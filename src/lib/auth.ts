// src/lib/auth.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma'; // 1단계에서 만든 prisma client

/**
 * Next.js API 라우트에서 Bearer 토큰을 검증하고 사용자 ID를 반환합니다.
 * (Prisma DB의 Session 테이블을 조회하는 방식)
 * @param request NextRequest
 * @returns {Promise<string | null>} 성공 시 userId, 실패 시 null
 */
export async function getUserIdFromAuth(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[Auth] No Bearer token found.');
    return null;
  }

  const sessionToken = authHeader.split(' ')[1];

  if (!sessionToken) {
    console.warn('[Auth] Token is empty.');
    return null;
  }

  try {
    // 1단계의 NextAuth.js가 생성한 Session을 DB에서 찾습니다.
    const session = await prisma.session.findUnique({
      where: {
        sessionToken: sessionToken,
      },
      include: {
        user: true, // 사용자 정보 포함
      },
    });

    // 세션이 유효하고 만료되지 않았는지 확인
    if (session && session.expires > new Date() && session.user) {
      return session.user.id; // ★ 성공! userId 반환
    } else {
      console.warn(`[Auth] Invalid or expired token: ${sessionToken}`);
      return null;
    }
  } catch (error) {
    console.error('[Auth] Error during session validation:', error);
    return null;
  }
}