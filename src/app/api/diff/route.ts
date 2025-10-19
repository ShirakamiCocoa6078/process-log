// src/app/api/diff/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserIdFromAuth } from '@/lib/auth'; // 1번에서 만든 헬퍼
import fs from 'fs';
import path from 'path';

// ----------------------------------------------------------------
// (OpenAI 호출 로직은 별도 함수로 분리하는 것을 권장합니다)
// (이 템플릿은 OpenAI API 호출 로직을 포함합니다)
// ----------------------------------------------------------------
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// AI 비교 프롬프트
const promptFilePath = path.join(
    process.cwd(), 
    'src',
    'app',
    'api',
    'diff',
    'developer-prompt.txt'
);
let AI_PROMPT_TEMPLATE: string;
try {
  // 서버가 시작될 때 파일을 동기적으로 읽어 변수에 저장
  AI_PROMPT_TEMPLATE = fs.readFileSync(promptFilePath, 'utf-8');
} catch (error) {
  console.error("developer-prompt.txt 파일을 읽는 데 실패했습니다.", error);
  // 파일 로드 실패 시 사용할 기본 프롬프트 (오류 방지)
  AI_PROMPT_TEMPLATE = `2枚の画像を比較し、それぞれの観察内容・共通点・差分を詳細に説明し、最後に新しい画像（画像B）の重要度を示す指標（数値）を含むJSON形式で出力してください。

- 画像Aおよび画像Bの内容を詳しく観察し、共通する特徴や要素を箇条書きでまとめます（理由付けとなる観察内容の整理）。
- 両画像を比較し、主な変化・異なる点（例：追加/削除された物体、位置や配色の変化など）を具体的にリストにします（理由となる違いの詳細な列挙）。
- 差分が与える意味や印象を簡潔にまとめます（結論部分）。明確な推測が必要な場合はその旨も明記し、事実ベースを優先してください。
- 最後に、新しい画像Bの"重要度"を0.0～1.0で定量的に評価してください。（例：画像Bが大きな情報や変化を含む場合は1.0、軽微な変化であれば0.1等。根拠があれば簡単に理由も付記）

# 出力フォーマット

以下のJSON形式で出力してください：

{
  "observationA": ["画像Aの詳細な観察内容その1", "観察内容その2", ...],
  "observationB": ["画像Bの詳細な観察内容その1", "観察内容その2", ...],
  "sharedFeatures": ["AとBに共通する特徴や場面", ...],
  "differences": ["主な差分・変化点その1", "主な差分その2", ...],
  "summary": "差分から分かる要点や意味を簡潔にまとめたテキスト。",
  "importanceScore": 0.0,  // 画像Bの重要度（0.0〜1.0の数値）
  "importanceReason": "このスコアをつけた理由、根拠となる説明"
}

# 注意事項
- 出力は必ず上記JSON形式・フィールド名・順序を守ってください。
- 差分説明や各リストは具体的かつ観察ベースで。理由→結論の順番を厳守してください。
- 「画像が不鮮明で識別困難」など、認識が難しい場合はその旨も返してください。
- "importanceScore"は定量的に判断し、根拠（"importanceReason"）も必ず記載してください。

# 具体例

【入力画像例】  
画像A: 公園で2人の子供が遊んでいる  
画像B: 公園で3人の子供が遊んでいる  

【出力例】  
{
  "observationA": ["公園で2人の子供が遊んでいる", "明るい日中で木々が背景にある"],
  "observationB": ["公園で3人の子供が遊んでいる", "明るい日中で木々が背景にある"],
  "sharedFeatures": ["両画像とも同じ公園で撮影されている", "背景や天候は同じ"],
  "differences": ["画像Bでは新たに1人子供が加わっている", "他の子供の位置や服装に変化は見られない"],
  "summary": "画像Bでは子供が1名増えている以外は大きな変化がない。",
  "importanceScore": 0.3,
  "importanceReason": "新しい人物が加わったが全体のシーンや雰囲気の変化は最小限であるため、重要度はやや低い。"
}

（実際の出力では、観察や差分説明はより詳細に記載してください）

# 重要ポイント再確認
- 観察・理由付け（observation, sharedFeatures, differences）を必ず先に記載、summary・重要度指標（importanceScore/importanceReason）は最後に。
- 出力はJSONのみ。段落や見出し、Markdownは不要です。`;
}

// 스크린샷 페이로드 타입
interface ScreenshotPayload {
  filename: string;
  data: string; // Base64 data URI
}

/**
 * 두 개의 이미지를 OpenAI에 보내 비교 분석을 요청
 */
async function analyzeImages(imgA: ScreenshotPayload, imgB: ScreenshotPayload) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o', // 1단계에서 논의된 모델
    response_format: { type: 'json_object' }, // JSON 출력 강제
    messages: [
      {
        role: 'system',
        content: AI_PROMPT_TEMPLATE,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `画像A (${imgA.filename})` },
          {
            type: 'image_url',
            image_url: { url: imgA.data, detail: 'low' },
          },
          { type: 'text', text: `画像B (${imgB.filename})` },
          {
            type: 'image_url',
            image_url: { url: imgB.data, detail: 'low' },
          },
        ],
      },
    ],
    max_tokens: 1024,
  });
  
  const jsonResult = response.choices[0].message.content;
  return JSON.parse(jsonResult); // JSON 객체 반환
}

/**
 * 스크린샷 파일명에서 타임스탬프 키 파싱
 * (예: "screenshot_2025-10-18_13-00-05.png" -> "13-00-05")
 */
function parseTimestampKey(filename: string): { date: Date, timeKey: string } {
  // 1. 날짜 및 시간 부분 추출 (예: "2025-10-18_13-00-05")
  const match = filename.match(/(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
  if (!match) {
    // 매치 실패 시 현재 시간 기준
    const now = new Date();
    return {
      date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      timeKey: now.toTimeString().split(' ')[0].replace(/:/g, '-') // HH-MM-SS
    };
  }
  
  const dateStr = match[1]; // "2025-10-18"
  const timeStr = match[2]; // "13-00-05"
  
  // UTC 자정 기준 날짜 객체 생성
  const dateParts = dateStr.split('-').map(Number);
  const taskDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));

  return {
    date: taskDate,
    timeKey: timeStr,
  };
}


// --- POST 핸들러 ---
export async function POST(request: NextRequest) {
  try {
    // 1. 인증: Bearer 토큰으로 userId 가져오기 (1번 파일)
    const userId = await getUserIdFromAuth(request);
    if (!userId) {
      return NextResponse.json({ status: 'error', message: '인증 실패' }, { status: 401 });
    }

    // 2. 요청 본문 파싱
    const body = await request.json();
    const { screenshots } = body as { screenshots: ScreenshotPayload[] };

    if (!screenshots || screenshots.length !== 2) {
      return NextResponse.json({ status: 'error', message: '스크린샷 2개가 필요합니다.' }, { status: 400 });
    }

    const [imgA, imgB] = screenshots;

    // 3. AI 분석 호출 (gpt-4o)
    const analysisResult = await analyzeImages(imgA, imgB);

    // 4. 타임스탬프 및 날짜 파싱 (Q3 동의)
    // (키는 첫 번째, 즉 더 빠른 스크린샷을 기준으로 함)
    const { date: taskDateId, timeKey } = parseTimestampKey(imgA.filename);
    
    // 5. DB 저장 로직 (Upsert)
    // 5-1. 오늘 날짜의 로그가 있는지 확인
    const existingLog = await prisma.personalTaskLog.findUnique({
      where: {
        userId_taskDateId: { userId, taskDateId }
      },
    });

    let newJsonData: any = {};
    if (existingLog && existingLog.taskTempTxt && typeof existingLog.taskTempTxt === 'object') {
      newJsonData = existingLog.taskTempTxt;
    }
    
    // 5-2. 새 분석 결과를 타임스탬프 키로 추가 (덮어쓰기/추가)
    newJsonData[timeKey] = analysisResult;

    // 5-3. DB에 생성 또는 업데이트
    await prisma.personalTaskLog.upsert({
      where: {
        userId_taskDateId: { userId, taskDateId }
      },
      update: {
        taskTempTxt: newJsonData,
      },
      create: {
        userId: userId,
        taskDateId: taskDateId,
        taskTempTxt: newJsonData,
      }
    });

    return NextResponse.json({
      status: 'success',
      message: '분석 완료 및 저장 성공',
      timestampKey: timeKey,
    });

  } catch (error) {
    console.error('[API /api/diff Error]', error);
    const errorMessage = error instanceof OpenAI.APIError ? error.message : String(error);
    return NextResponse.json({ status: 'error', message: errorMessage }, { status: 500 });
  }
}