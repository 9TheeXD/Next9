import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Rank is the number of users created before or at the same time as this user
    const rank = await prisma.user.count({
      where: {
        createdAt: {
          lte: user.createdAt
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: { rank }
    });
  } catch (error: any) {
    console.error('Fetch rank error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch user rank' },
      { status: 500 }
    );
  }
}
