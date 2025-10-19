// src/app/api/user/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromAuth } from '@/lib/auth'; // 4단계 인증 헬퍼

export async function PUT(request: NextRequest) {
  try {
    // 1. 인증
    const userId = await getUserIdFromAuth(request);
    if (!userId) {
      return NextResponse.json({ status: 'error', message: '인증 실패' }, { status: 401 });
    }

    // 2. 요청 본문에서 설정 값 읽기
    const body = await request.json();
    const autoSummaryEnabled = typeof body.autoSummaryEnabled === 'boolean' ? body.autoSummaryEnabled : null;

    if (autoSummaryEnabled === null) {
        return NextResponse.json({ status: 'error', message: 'autoSummaryEnabled 값이 필요합니다.' }, { status: 400 });
    }

    // 3. DB 업데이트
    await prisma.user.update({
      where: { id: userId },
      data: { autoSummaryEnabled: autoSummaryEnabled },
    });

    return NextResponse.json({ status: 'success', message: '설정이 업데이트되었습니다.', autoSummaryEnabled });

  } catch (error) {
    console.error('[API /api/user/settings Error]', error);
    return NextResponse.json({ status: 'error', message: '설정 업데이트 중 오류 발생' }, { status: 500 });
  }
}

// (선택) 현재 설정을 가져오는 GET 핸들러도 추가할 수 있습니다.
export async function GET(request: NextRequest) {
    try {
        const userId = await getUserIdFromAuth(request);
        if (!userId) {
          return NextResponse.json({ status: 'error', message: '인증 실패' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { autoSummaryEnabled: true }
        });

        if (!user) {
             return NextResponse.json({ status: 'error', message: '사용자를 찾을 수 없음' }, { status: 404 });
        }

        return NextResponse.json({ status: 'success', autoSummaryEnabled: user.autoSummaryEnabled });

    } catch (error) {
        console.error('[API /api/user/settings GET Error]', error);
        return NextResponse.json({ status: 'error', message: '설정 조회 중 오류 발생' }, { status: 500 });
    }
}