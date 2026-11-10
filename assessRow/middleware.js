import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';

export default withAuth(
  function middleware(request) {
    const response = NextResponse.next();

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-DNS-Prefetch-Control', 'off');

  // CSP - allow self and Google Fonts and recharts inline styles
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self';"
  );
  // TODO(security): Remove 'unsafe-inline' for styles once CSS modules fully replace inline styles from recharts
  // TODO(security): Remove 'unsafe-eval' once Next.js dev mode is no longer needed (production builds don't require it)

  return response;
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        const path = req.nextUrl.pathname;
        // The /admin page carries its own admin sign-in form and shows nothing else to anyone who is
        // not an admin, so it must be reachable signed out. (Requiring role=admin here sent everyone
        // to the Google-only /login, where an admin session can never be created.) Its data comes
        // only from /api/admin/* and POST /api/settings/lock, which check role === 'admin' themselves.
        if (path === '/admin') return true;
        if (path.startsWith('/admin/')) return !!token && token.role === 'admin';
        return !!token;
      },
    },
    pages: {
      signIn: '/login',
    }
  }
);

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
