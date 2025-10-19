// src/app/api/cron-handler/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// --- 요약 프롬프트 로드 (summary API와 동일) ---
const promptFilePath = path.join(process.cwd(), 'src', 'app', 'api', 'summary', 'developer-prompt.txt');
let SUMMARY_PROMPT_TEMPLATE: string;
try {
  SUMMARY_PROMPT_TEMPLATE = fs.readFileSync(promptFilePath, 'utf-8');
} catch {
  SUMMARY_PROMPT_TEMPLATE = "활동 로그를 Markdown으로 요약해 주세요.";
}

// --- OpenAI 호출 함수 (summary API와 동일) ---
async function requestSummaryFromOpenAI(contentToSummarize: string) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({ /* ... 모델, 메시지 등 설정 ... */
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SUMMARY_PROMPT_TEMPLATE },
          { role: 'user', content: contentToSummarize },
        ],
        max_tokens: 1024,
        temperature: 0.3,
    });
    const summary = response.choices[0].message.content;
    if (!summary) throw new Error('OpenAI returned empty summary');
    return summary;
}

// --- GET 핸들러 (Cron Job은 GET 요청을 보냄) ---
export async function GET(request: NextRequest) {
  // 1. Cron Job 인증
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // CRON_SECRET이 일치하지 않으면 401 Unauthorized 오류 반환
    return NextResponse.json({ status: 'error', message: '인증 실패' }, { status: 401 });
  }

  console.log('[Cron] Daily summary job started...');
  let processedCount = 0;
  let errorCount = 0;

  try {
    // 2. 어제 날짜 계산 (UTC 기준)
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const taskDateId = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate()));

    // 3. 자동 요약이 활성화된 사용자 목록 조회
    const usersToProcess = await prisma.user.findMany({
      where: { autoSummaryEnabled: true },
      select: { id: true }, // userId만 가져옴
    });

    console.log(`[Cron] Found ${usersToProcess.length} users with auto-summary enabled for date ${taskDateId.toISOString().split('T')[0]}.`);

    // 4. 각 사용자에 대해 요약 생성 시도
    for (const user of usersToProcess) {
      const userId = user.id;
      try {
        // 4-1. 해당 사용자의 어제자 taskTempTxt 조회
        const log = await prisma.personalTaskLog.findUnique({
          where: { userId_taskDateId: { userId, taskDateId } },
          select: { taskTempTxt: true, taskContent: true }, // taskContent도 확인 (이미 생성되었는지)
        });

        // 데이터가 없거나, taskTempTxt가 없거나, 이미 요약본이 있으면 건너뛰기
        if (!log || !log.taskTempTxt || typeof log.taskTempTxt !== 'object' || Array.isArray(log.taskTempTxt) || log.taskContent) {
           if (log && log.taskContent) {
               console.log(`[Cron] User ${userId}: Summary already exists for ${taskDateId.toISOString().split('T')[0]}. Skipping.`);
           } else if (log && !log.taskTempTxt) {
                console.log(`[Cron] User ${userId}: No taskTempTxt data found for ${taskDateId.toISOString().split('T')[0]}. Skipping.`);
           }
           continue; // 다음 사용자로
        }

        // 4-2. AI에 보낼 텍스트 재구성 (summary API와 동일 로직)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const taskData = log.taskTempTxt as Record<string, any>;
        let contentToSummarize = `어제(${taskDateId.toISOString().split('T')[0]}) 활동 로그 데이터입니다...\n\n`;
        const sortedKeys = Object.keys(taskData).sort();
        for (const timeKey of sortedKeys) {
            const entry = taskData[timeKey];
            const dataChunk = { /* ... JSON 조각 생성 ... */ };
            contentToSummarize += JSON.stringify(dataChunk) + "\n";
        }

        // 4-3. AI 요약 호출
        const markdownSummary = await requestSummaryFromOpenAI(contentToSummarize);

        // 4-4. DB의 taskContent 업데이트
        await prisma.personalTaskLog.update({
          where: { userId_taskDateId: { userId, taskDateId } },
          data: { taskContent: markdownSummary },
        });

        console.log(`[Cron] User ${userId}: Successfully generated summary for ${taskDateId.toISOString().split('T')[0]}.`);
        processedCount++;

      } catch (userError) {
        console.error(`[Cron] Error processing user ${userId}:`, userError);
        errorCount++;
      }
    } // end for loop

    console.log(`[Cron] Daily summary job finished. Processed: ${processedCount}, Errors: ${errorCount}`);
    return NextResponse.json({ status: 'success', processed: processedCount, errors: errorCount });

  } catch (error) {
    console.error('[Cron] Fatal error during cron job:', error);
    return NextResponse.json({ status: 'error', message: '크론 잡 실행 중 심각한 오류 발생' }, { status: 500 });
  }
}