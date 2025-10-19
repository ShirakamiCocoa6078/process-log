// src/app/api/report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromAuth } from '@/lib/auth'; // 4단계 인증 헬퍼

// 날짜 문자열을 UTC Date 객체로 변환하는 헬퍼 함수
function parseUTCDate(dateString: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const parts = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return isNaN(date.getTime()) ? null : date;
}

// POST 핸들러
export async function POST(request: NextRequest) {
  try {
    // 1. 인증
    const userId = await getUserIdFromAuth(request);
    if (!userId) {
      return NextResponse.json({ status: 'error', message: '인증 실패' }, { status: 401 });
    }

    // 2. 요청 본문 파싱 (시작 날짜, 종료 날짜, 형식)
    const body = await request.json();
    const { startDate: startDateStr, endDate: endDateStr, format = 'md' } = body; // 기본 형식은 md

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ status: 'error', message: '시작 날짜와 종료 날짜가 필요합니다.' }, { status: 400 });
    }

    const startDate = parseUTCDate(startDateStr);
    const endDate = parseUTCDate(endDateStr);

    if (!startDate || !endDate || startDate > endDate) {
      return NextResponse.json({ status: 'error', message: '날짜 형식이 잘못되었거나 기간이 유효하지 않습니다.' }, { status: 400 });
    }

    // 3. DB에서 해당 기간의 요약 데이터(taskContent) 조회
    const logs = await prisma.personalTaskLog.findMany({
      where: {
        userId: userId,
        taskDateId: {
          gte: startDate, // 크거나 같음 (시작일 포함)
          lte: endDate,   // 작거나 같음 (종료일 포함)
        },
        taskContent: {     // 요약본이 있는 것만 조회
          not: null,
        },
      },
      select: {
        taskDateId: true,
        taskContent: true,
      },
      orderBy: {
        taskDateId: 'asc', // 날짜 오름차순 정렬
      },
    });

    if (logs.length === 0) {
      return NextResponse.json({ status: 'success', reportContent: null, message: '선택한 기간에 요약 데이터가 없습니다.' });
    }

    // 4. Markdown 레포트 내용 생성
    let reportContent = `# 활동 레포트 (${startDateStr} ~ ${endDateStr})\n\n`;
    logs.forEach(log => {
      // Date 객체를 YYYY-MM-DD 형식으로 변환 (ISOString 활용)
      const dateKey = log.taskDateId.toISOString().split('T')[0];
      reportContent += `## ${dateKey}\n\n`;
      reportContent += `${log.taskContent || '요약 없음'}\n\n`; // 각 날짜의 Markdown 요약 추가
      reportContent += '---\n\n'; // 날짜 구분선
    });

    // 5. 생성된 Markdown 내용 반환 (파일 다운로드는 클라이언트에서 처리)
    const fileName = `report_${startDateStr}_${endDateStr}.md`;
    return NextResponse.json({
      status: 'success',
      fileName: fileName,
      reportContent: reportContent,
      message: `${logs.length}일 분량의 레포트 생성 완료.`
    });

    // (향후 Word/PDF 구현 시)
    // if (format === 'docx') { /* docx 라이브러리 사용 */ }
    // else if (format === 'pdf') { /* pdf-lib 라이브러리 사용 */ }

  } catch (error) {
    console.error('[API /api/report Error]', error);
    return NextResponse.json({ status: 'error', message: '레포트 생성 중 오류 발생' }, { status: 500 });
  }
}