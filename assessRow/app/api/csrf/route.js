import { NextResponse } from 'next/server';

const { generateCsrfToken, CSRF_COOKIE_NAME } = require('@/lib/csrf');

export async function GET() {
  try {
    const token = generateCsrfToken();

    const response = NextResponse.json({ csrfToken: token });
    response.cookies.set(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('CSRF token generation error occurred');
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด' },
      { status: 500 }
    );
  }
}
