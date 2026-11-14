import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!authenticateRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const after = searchParams.get('after');

    let count = 0;

    if (after) {
      const parsedDate = new Date(after);
      if (!isNaN(parsedDate.getTime())) {
        count = await prisma.chatMessage.count({
          where: {
            createdAt: {
              gt: parsedDate,
            },
            isDeleted: false, // Don't count deleted messages
          },
        });
      }
    } else {
      // If no after date is provided, we could consider all messages unread?
      // Usually we return 0 or the total count. Let's return total count.
      count = await prisma.chatMessage.count({
        where: { isDeleted: false }
      });
    }

    return NextResponse.json({
      success: true,
      data: { count }
    });
  } catch (error: any) {
    console.error('Fetch unread count error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch unread count' },
      { status: 500 }
    );
  }
}
