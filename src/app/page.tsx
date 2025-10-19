// src/app/page.tsx
'use client';

import AuthButton from '@/components/AuthButton';
import { useSession } from 'next-auth/react';
import React, { useState } from 'react';

// 3단계의 preload.ts에서 노출한 'electronAPI'의 타입을 정의
declare global {
  interface Window {
    electronAPI: {
      startCapture: (settings: { interval: number; resolution: number }) => Promise<{ success: boolean; message: string }>;
      stopCapture: () => Promise<{ success: boolean; message: string }>;
    };
  }
}

export default function Home() {
  const { data: session, status } = useSession();
  
  // UI 상태 관리
  const [isCapturing, setIsCapturing] = useState(false);
  const [logMessage, setLogMessage] = useState('준비 완료.');
  const [summary, setSummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  // 캡처 시작 핸들러
  const handleStartCapture = async () => {
    if (!window.electronAPI) {
      setLogMessage('Electron API를 찾을 수 없습니다. (브라우저에서 실행 중?)');
      return;
    }
    const settings = { interval: 5.0, resolution: 1.0 }; 
    const result = await window.electronAPI.startCapture(settings);
    
    if (result.success) {
      setIsCapturing(true);
      setLogMessage('캡처 시작됨.');
    } else {
      setLogMessage(`캡처 시작 실패: ${result.message}`);
    }
  };

  // 캡처 중지 핸들러
  const handleStopCapture = async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.stopCapture();

    if (result.success) {
      setIsCapturing(false);
      setLogMessage('캡처 중지됨.');
    } else {
      setLogMessage(`캡처 중지 실패: ${result.message}`);
    }
  };

  // 오늘 요약 생성 핸들러
  const handleGenerateSummary = async () => {
    setIsLoadingSummary(true);
    setSummary('');
    setLogMessage('오늘 활동 요약을 생성 중입니다...');

    try {
      // 2번에서 만든 API 호출
      const response = await fetch('/api/summary', {
        method: 'POST',
      });
      
      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setSummary(data.summary); // (Markdown 텍스트)
        setLogMessage('요약 생성 완료.');
      } else {
        setLogMessage(`요약 생성 실패: ${data.message}`);
      }
    } catch (error) {
      setLogMessage(`API 호출 오류: ${(error as Error).message}`);
    }
    setIsLoadingSummary(false);
  };

  // ---------------------------------
  // 렌더링
  // ---------------------------------
  if (status === 'loading') {
    return <main style={{ padding: '2rem' }}>Loading...</main>;
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Process Log</h1>
      <AuthButton />
      <hr style={{ margin: '20px 0' }} />

      {/* 1. 로그인 되었을 때만 컨트롤러 표시 */}
      {session && (
        <section>
          <h2>캡처 컨트롤러</h2>
          <button 
            onClick={handleStartCapture} 
            disabled={isCapturing}
            style={{ padding: '10px', background: 'green', color: 'white' }}
          >
            캡처 시작
          </button>
          <button 
            onClick={handleStopCapture} 
            disabled={!isCapturing}
            style={{ padding: '10px', background: 'red', color: 'white', marginLeft: '10px' }}
          >
            캡처 중지
          </button>
        </section>
      )}

      {/* 2. 요약 섹션 */}
      {session && (
        <section style={{ marginTop: '20px' }}>
          <h2>오늘 요약</h2>
          <button 
            onClick={handleGenerateSummary} 
            disabled={isLoadingSummary}
            style={{ padding: '10px', background: 'blue', color: 'white' }}
          >
            {isLoadingSummary ? '생성 중...' : '오늘 요약 생성하기'}
          </button>
          
          {/* 요약 결과 표시 */}
          {summary && (
            <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #ccc', background: '#f9f9f9' }}>
              <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                {summary}
              </pre>
            </div>
          )}
        </section>
      )}

      {/* 3. 로그 표시 (Q2 답변) */}
      <footer style={{ marginTop: '20px', background: '#333', color: '#eee', padding: '10px' }}>
        <strong>로그:</strong> {logMessage}
      </footer>
    </main>
  );
}