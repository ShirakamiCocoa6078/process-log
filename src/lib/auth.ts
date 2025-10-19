// src/lib/auth.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * [업그레이드됨] Bearer 토큰(Python) 또는 세션 쿠키(브라우저)를 검증하고 
 * 사용자 ID를 반환합니다.
 * @param request NextRequest
 * @returns {Promise<string | null>} 성공 시 userId, 실패 시 null
 */
export async function getUserIdFromAuth(request: NextRequest): Promise<string | null> {
  let sessionToken: string | undefined;

  // 1. Bearer 토큰 확인 (Python / Postman)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessionToken = authHeader.split(' ')[1];
  }

  // 2. Bearer 토큰이 없다면 쿠키 확인 (브라우저)
  if (!sessionToken) {
    // 1단계에서 Vercel 배포 시 사용한 쿠키 이름
    const cookieName = '__Secure-next-auth.session-token'; 
    // 1단계에서 로컬 테스트 시 사용한 쿠키 이름
    const localCookieName = 'next-auth.session-token';
    
    // next/headers에서 쿠키 가져오기
    const cookieStore = request.cookies; 
  const secureCookie = cookieStore.get(cookieName);
  const localCookie = cookieStore.get(localCookieName);

    if (secureCookie) {
      sessionToken = secureCookie.value;
    } else if (localCookie) {
      sessionToken = localCookie.value;
    }
  }
  
  // 3. 토큰이 없음 (로그인 안 됨)
  if (!sessionToken) {
    console.warn('[Auth] No session token found in headers or cookies.');
    return null;
  }

  // 4. DB에서 세션 검증 (DB 전략)
  try {
    const session = await prisma.session.findUnique({
      where: {
        sessionToken: sessionToken,
      },
      include: {
        user: true,
      },
    });

    if (session && session.expires > new Date() && session.user) {
      return session.user.id; // ★ 성공!
    } else {
      console.warn(`[Auth] Invalid or expired token: ${sessionToken}`);
      return null;
    }
  } catch (error) {
    console.error('[Auth] Error during session validation:', error);
    return null;
  }
}