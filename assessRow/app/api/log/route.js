import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/session';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;
    
    if (action !== 'view') {
      return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
    }

    let userId = session.user.prefix || (session.user.email ? session.user.email.split('@')[0] : 'unknown');

    const { logAction } = require('@/lib/logger');
    await logAction(userId, session.user.role, 'view');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Log POST error:', error);
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาด' },
      { status: 500 }
    );
  }
}
