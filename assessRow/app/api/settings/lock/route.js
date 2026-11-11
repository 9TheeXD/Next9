import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/session';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
const { getDb } = require('@/lib/db');

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const db = getDb();
    
    // Default values
    let locked = false;
    let lockUntil = null;

    const lockedRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('system_locked');
    if (lockedRow && lockedRow.value === 'true') {
      locked = true;
    }

    const untilRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('lock_until');
    if (untilRow && untilRow.value) {
      lockUntil = untilRow.value;
    }

    // Check if lock has expired
    if (locked && lockUntil) {
      const untilDate = new Date(lockUntil);
      if (new Date() > untilDate) {
        locked = false;
        // Auto-unlock in DB
        await db.prepare(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?`).run('false', 'system_locked');
      }
    }
    
    let target = 'all';
    const targetRow = await db.prepare('SELECT value FROM settings WHERE key = ?').get('lock_target');
    if (targetRow && targetRow.value) {
      target = targetRow.value;
    }

    // Role filtering for LockOverlay checking
    if (locked && session && session.user.role !== 'admin') {
      if (target === 'student' && session.user.role !== 'student') {
        locked = false;
      }
    }

    // The text admins can set for the maintenance popup (empty = the built-in wording).
    const textRow = async (key) => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(key))?.value || '';
    // `exempt`: admins are never blocked (the early check in app/layout.js reads this).
    const exempt = session?.user?.role === 'admin';
    return NextResponse.json({ locked, lockUntil, target, exempt, title: await textRow('lock_title'), message: await textRow('lock_message') });
  } catch (error) {
    console.error('Failed to get lock status:', error);
    // Fail open if db error
    return NextResponse.json({ locked: false });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { action, minutes, target, until, title, message } = await request.json();
    const db = getDb();
    const setSetting = async (key, value) =>
      await db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run(key, value);

    // Popup wording only, without locking or unlocking.
    if (action === 'text') {
      await setSetting('lock_title', String(title || '').slice(0, 120));
      await setSetting('lock_message', String(message || '').slice(0, 1000));
      return NextResponse.json({ success: true, message: 'บันทึกข้อความแล้ว' });
    }

    if (action === 'unlock') {
      await db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run('system_locked', 'false');
      await db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run('lock_until', '');
      return NextResponse.json({ success: true, message: 'ระบบเปิดให้ใช้งานแล้ว' });
    } 
    
    if (action === 'lock') {
      let lockUntil = '';
      // `until` (an exact time, ISO) is used by the admin page; `minutes` is kept for older callers.
      const untilDate = until ? new Date(until) : null;
      if (untilDate && !isNaN(untilDate.getTime())) {
        if (untilDate.getTime() <= Date.now()) return NextResponse.json({ message: 'เวลาที่เลือกผ่านไปแล้ว' }, { status: 400 });
        lockUntil = untilDate.toISOString();
      } else if (minutes) {
        const untilDate = new Date(Date.now() + minutes * 60000);
        lockUntil = untilDate.toISOString();
      }
      const lockTarget = target === 'student' ? 'student' : 'all';
      if (title !== undefined) await setSetting('lock_title', String(title || '').slice(0, 120));
      if (message !== undefined) await setSetting('lock_message', String(message || '').slice(0, 1000));
      await db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run('system_locked', 'true');
      await db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run('lock_until', lockUntil);
      await db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run('lock_target', lockTarget);
      return NextResponse.json({ success: true, message: 'ระบบถูกปิดการใช้งานเรียบร้อยแล้ว' });
    }

    return NextResponse.json({ message: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Failed to set lock status:', error);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
