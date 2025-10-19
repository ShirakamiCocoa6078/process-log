// src/app/api/summary/[date]/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromAuth } from '@/lib/auth'; // 4단계 인증 헬퍼

// GET 핸들러 (날짜 파라미터 사용)
// context.params.date 로 URL의 [date] 부분을 받을 수 있습니다.
export async function GET(
  request: NextRequest,
  // @ts-expect-error
  context: { params: { date: string } }
) {
  try {
    // 1. 인증
    const userId = await getUserIdFromAuth(request);
    if (!userId) {
      return NextResponse.json({ status: 'error', message: '인증 실패' }, { status: 401 });
    }

    // 2. URL 파라미터에서 날짜 문자열(YYYY-MM-DD) 가져오기
    const params = context.params as { date: string };
    const dateString = params.date;
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return NextResponse.json({ status: 'error', message: '날짜 형식이 잘못되었습니다 (YYYY-MM-DD).' }, { status: 400 });
    }

    // 3. 날짜 문자열을 UTC 자정 기준 Date 객체로 변환
    const dateParts = dateString.split('-').map(Number);
    const taskDateId = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));

    if (isNaN(taskDateId.getTime())) {
         return NextResponse.json({ status: 'error', message: '유효하지 않은 날짜입니다.' }, { status: 400 });
    }

    // 4. DB에서 해당 날짜의 taskContent 조회
    const log = await prisma.personalTaskLog.findUnique({
      where: {
        userId_taskDateId: { userId, taskDateId },
      },
      select: {
        taskContent: true, // 요약본만 가져옴
      },
    });

    if (!log || !log.taskContent) {
      return NextResponse.json({ status: 'success', summary: null, message: '해당 날짜의 요약 데이터가 없습니다.' });
    }

    // 5. 요약본 반환
    return NextResponse.json({
      status: 'success',
      summary: log.taskContent, // 저장된 Markdown 반환
    });

  } catch (error) {
    // @ts-expect-error
    const params = context.params as { date: string };
    console.error(`[API /api/summary/${params.date} Error]`, error);
    return NextResponse.json({ status: 'error', message: '요약 조회 중 오류 발생' }, { status: 500 });
  }
}