import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const take = parseInt(searchParams.get('take') || '30', 10);
    const cursor = searchParams.get('cursor');

    const query: any = {
      take,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            role: true,
            smokingType: true,
          },
        },
      },
      where: {
        isDeleted: false
      }
    };

    if (cursor) {
      query.cursor = { id: cursor };
      query.skip = 1; // Skip the cursor itself
    }

    const messages = await prisma.chatMessage.findMany(query);

    // Return messages in chronological order for chat UI
    return NextResponse.json({
      success: true,
      data: messages.reverse(),
    });
  } catch (error: any) {
    console.error('Fetch chat messages error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, content, alias } = body;

    if (!userId || (!content && content !== '')) {
      return NextResponse.json(
        { success: false, error: 'User ID and content are required' },
        { status: 400 }
      );
    }

    const newMessage = await prisma.chatMessage.create({
      data: {
        userId,
        content: content.trim(),
        alias: alias || null,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            role: true,
            smokingType: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: newMessage,
    });
  } catch (error: any) {
    console.error('Send chat message error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}
