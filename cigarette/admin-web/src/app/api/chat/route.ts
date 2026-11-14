import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

const unauthorized = () =>
  NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
const MAX_LENGTH = 1000;

export async function GET(req: NextRequest) {
  if (!authenticateRequest(req)) return unauthorized();
  try {
    const { searchParams } = new URL(req.url);
    const take = Math.min(Math.max(parseInt(searchParams.get('take') || '30', 10) || 30, 1), 100);
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
      { success: false, error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (!auth) return unauthorized();
  try {
    const body = await req.json();
    // The sender is always the logged-in user; a userId in the body is ignored.
    const userId = auth.userId;
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const alias = typeof body.alias === 'string' ? body.alias.trim().slice(0, 40) : null;

    if (!content) {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
        { status: 400 }
      );
    }
    if (content.length > MAX_LENGTH) {
      return NextResponse.json(
        { success: false, error: 'Message is too long' },
        { status: 400 }
      );
    }

    const newMessage = await prisma.chatMessage.create({
      data: {
        userId,
        content,
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
      { success: false, error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
