import crypto from 'crypto';
import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

// Admin credentials and the session secret come from the environment (.env), never the source.
// With either admin variable missing, the admin form simply rejects every attempt.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

if (!process.env.NEXTAUTH_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('NEXTAUTH_SECRET is not set');
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'missing-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'missing-client-secret',
      // Shows only school accounts in Google's picker; signIn below still checks the domain.
      authorization: { params: { hd: 'sirin.ac.th', prompt: 'select_account' } },
    }),
    CredentialsProvider({
      name: 'Admin Login',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      // Accounts made on /admin first, then the one in .env. The username is what logs and any
      // evaluations by this admin are stored under.
      async authorize(credentials) {
        const username = String(credentials?.username || '').trim().toLowerCase();
        const password = String(credentials?.password || '');
        if (!username || !password) return null;
        const { getDb } = require('@/lib/db');
        const { isLockedOut, noteFailure, verifyAccount } = require('@/lib/adminAccounts');
        if (isLockedOut(username)) return null;
        try {
          const acc = await verifyAccount(getDb(), username, password);
          if (acc) return { id: `admin:${acc.username}`, name: acc.displayName || acc.username, role: 'admin', prefix: acc.username, adminSource: 'db' };
        } catch (e) {
          console.error('Admin account check failed:', e);
        }
        if (safeEqual(username, (process.env.ADMIN_USERNAME || '').toLowerCase()) && safeEqual(password, process.env.ADMIN_PASSWORD)) {
          return { id: 'admin', name: 'Administrator', role: 'admin', prefix: username, adminSource: 'env' };
        }
        noteFailure(username);
        return null;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account.provider === 'google') {
        if (!user.email || !user.email.toLowerCase().endsWith('@sirin.ac.th')) return false;
        try {
          const { getDb } = require('@/lib/db');
          const { resolveRole } = require('@/lib/roles');
          const found = await resolveRole(getDb(), user.email);
          if (!found) return false;
          user.role = found.role;
          user.prefix = found.prefix;
          return true;
        } catch (e) {
          console.error('DB check failed during signIn:', e);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.role = user.role || 'user';
        token.prefix = user.prefix || '';
        token.via = account?.provider || '';
        token.adminSource = user.adminSource || '';
        return token;
      }
      // An admin account deleted on /admin stops working on its next request.
      if (token.via === 'credentials' && token.adminSource === 'db') {
        try {
          const { getDb } = require('@/lib/db');
          const still = await getDb().prepare('SELECT 1 FROM admin_accounts WHERE username = ?').get(token.prefix);
          if (!still) token.role = 'student';
        } catch {
          // keep the role from sign-in
        }
        return token;
      }
      // Google accounts: look the role up again, so adding, changing or removing someone on /admin
      // applies on their next request instead of after the 30-day session ends. Someone no longer
      // allowed in keeps only what a student may see.
      if (token.email && token.via !== 'credentials') {
        try {
          const { getDb } = require('@/lib/db');
          const { resolveRole } = require('@/lib/roles');
          const found = await resolveRole(getDb(), token.email);
          token.role = found ? found.role : 'student';
        } catch {
          // keep the role from sign-in
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.role = token.role;
        session.user.prefix = token.prefix;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
