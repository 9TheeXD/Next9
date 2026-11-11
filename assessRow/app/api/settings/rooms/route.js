import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const { getDb } = require('@/lib/db');
const { loadRooms, normalizeRooms } = require('@/lib/config');

// Rooms per grade (ม.1 – ม.6). GET is public (the summary and evaluation pages need it);
// POST { rooms: { "1": 14, … } } is for admins (/admin → ภาคเรียน).
export async function GET() {
  try {
    return NextResponse.json({ success: true, rooms: await loadRooms(getDb()) });
  } catch {
    return NextResponse.json({ success: false, rooms: null }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const rooms = normalizeRooms(body.rooms);
    const db = getDb();
    await db
      .prepare(`INSERT INTO settings (key, value) VALUES ('rooms_per_grade', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
      .run(JSON.stringify(rooms));
    return NextResponse.json({ success: true, rooms: await loadRooms(db, { fresh: true }), message: 'บันทึกจำนวนห้องแล้ว' });
  } catch (error) {
    console.error('Failed to save rooms:', error);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
