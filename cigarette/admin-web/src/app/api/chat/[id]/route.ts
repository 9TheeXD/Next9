import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { userId, content } = body;

    if (!userId || (!content && content !== '')) {
      return NextResponse.json(
        { success: false, error: 'User ID and content are required' },
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
        content: content.trim(),
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
      { success: false, error: error.message || 'Failed to edit message' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    // To verify user, we should ideally get userId from body or query,
    // Since DELETE body is sometimes ignored, we can pass userId in searchParams or rely on an auth token.
    // For simplicity with fetch, we'll accept it in searchParams.
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
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
      { success: false, error: error.message || 'Failed to unsend message' },
      { status: 500 }
    );
  }
}
