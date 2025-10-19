// src/app/api/summary/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// ----------------------------------------------------------------
// 1. AI 요약 프롬프트 (소스 1 파일 로드)
// ----------------------------------------------------------------
const promptFilePath = path.join(
  process.cwd(),
  'src',
  'app',
  'api',
  'summary',
  'developer-prompt.txt'
);

let SUMMARY_PROMPT_TEMPLATE: string;
try {
  SUMMARY_PROMPT_TEMPLATE = fs.readFileSync(promptFilePath, 'utf-8');
} catch (error) {
  console.error("summary/developer-prompt.txt 파일을 읽는 데 실패했습니다.", error);
  SUMMARY_PROMPT_TEMPLATE = "활동 로그를 Markdown으로 요약해 주세요."; // 오류 시 비상 프롬프트
}

// ----------------------------------------------------------------
// 2. OpenAI 호출 함수
// ----------------------------------------------------------------
async function requestSummaryFromOpenAI(contentToSummarize: string) {
  // 빌드 오류 방지를 위해 함수 내에서 생성
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o', // 👈 gpt-5 대신 gpt-4o 사용
    messages: [
      {
        role: 'system',
        content: SUMMARY_PROMPT_TEMPLATE, // 👈 (소스 1) 파일 내용
      },
      {
        role: 'user',
        content: contentToSummarize, // 👈 3번에서 생성한 JSON 조각 텍스트
      },
    ],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const summary = response.choices[0].message.content;
  if (!summary) {
    throw new Error('OpenAI가 요약 내용을 반환하지 않았습니다.');
  }
  return summary; // Markdown 텍스트
}

// ----------------------------------------------------------------
// 3. POST 핸들러 (인증 및 로직 수정됨)
// ----------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // 1. 인증 (쿠키에서 세션 가져오기)
    const session = await getServerSession(authOptions); 

    if (!session || !session.user || !session.user.id) {
      // 세션이 없거나(로그인 안됨), 세션에 user.id가 없음
      return NextResponse.json({ status: 'error', message: '인증 실패' }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. 오늘 날짜 (UTC 기준)
    const today = new Date();
    const taskDateId = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    // 3. DB 조회 (taskContent 대신 taskTempTxt)
    const log = await prisma.personalTaskLog.findUnique({
      where: {
        userId_taskDateId: { userId, taskDateId }, // 👈 userSystemId 대신 userId
      },
      select: {
        taskTempTxt: true, // 👈 taskContent 대신 taskTempTxt
      },
    });

    if (!log || !log.taskTempTxt || typeof log.taskTempTxt !== 'object' || Array.isArray(log.taskTempTxt)) {
      return NextResponse.json({ status: 'error', message: '요약할 데이터가 없습니다.' }, { status: 404 });
    }
    
    // 4. (Q5-3 동의) AI에 보낼 텍스트 재구성
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskData = log.taskTempTxt as Record<string, any>;
    let contentToSummarize = "다음은 오늘 활동 로그 데이터(JSON 조각)입니다. 이를 (소스 1) 프롬프트 형식에 맞게 하나의 Markdown 활동 기록으로 재구성해 주세요:\n\n";
    
    // 시간순 정렬 (키 "HH-MM-SS" 기준)
    const sortedKeys = Object.keys(taskData).sort();
    
    for (const timeKey of sortedKeys) {
      const entry = taskData[timeKey];
      // (소스 1) 프롬프트가 잘 이해하도록 JSON 형식 유지
      const dataChunk = {
        time: timeKey,
        summary: entry.summary || 'N/A',
        importance: entry.importanceScore || 0.0,
        details: {
          observations: entry.observationB || entry.observationA,
          diff: entry.differences,
        }
      };
      contentToSummarize += JSON.stringify(dataChunk) + "\n";
    }

    // 5. AI 요약 호출
    const markdownSummary = await requestSummaryFromOpenAI(contentToSummarize);

    // 6. DB의 'taskContent' 필드에 덮어쓰기
    await prisma.personalTaskLog.update({
      where: {
        userId_taskDateId: { userId, taskDateId },
      },
      data: {
        taskContent: markdownSummary,
      },
    });

    // 7. 클라이언트에 요약본 반환
    return NextResponse.json({
      status: 'success',
      summary: markdownSummary,
    });

  } catch (error) {
    console.error('[API /api/summary Error]', error);
    const errorMessage = error instanceof OpenAI.APIError ? error.message : String(error);
    return NextResponse.json({ status: 'error', message: errorMessage }, { status: 500 });
  }
}