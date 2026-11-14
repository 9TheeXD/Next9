import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

const unauthorized = () =>
  NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req);
  if (!auth) return unauthorized();
  try {
    const { id } = await context.params;
    const body = await req.json();
    const userId = auth.userId;
    const content = typeof body.content === 'string' ? body.content.trim() : '';

    if (!content || content.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Content is required (max 1000 characters)' },
        { status: 400 }
      );
    }

    const existingMessage = await prisma.chatMessage.findUnique({
      where: { id },
    });

    if (!existingMessage) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    if (existingMessage.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to edit this message' },
        { status: 403 }
      );
    }

    const updatedMessage = await prisma.chatMessage.update({
      where: { id },
      data: {
        content,
        isEdited: true,
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
      data: updatedMessage,
    });
  } catch (error: any) {
    console.error('Edit chat message error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to edit message' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req);
  if (!auth) return unauthorized();
  try {
    const { id } = await context.params;
    const userId = auth.userId;

    const existingMessage = await prisma.chatMessage.findUnique({
      where: { id },
    });

    if (!existingMessage) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    if (existingMessage.userId !== userId && auth.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to unsend this message' },
        { status: 403 }
      );
    }

    const deletedMessage = await prisma.chatMessage.update({
      where: { id },
      data: {
        isDeleted: true,
        content: '', // Optional: clear content for privacy
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
      data: deletedMessage,
    });
  } catch (error: any) {
    console.error('Unsend chat message error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to unsend message' },
      { status: 500 }
    );
  }
}
