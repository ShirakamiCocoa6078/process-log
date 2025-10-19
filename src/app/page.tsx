// src/app/page.tsx
'use client';

import AuthButton from '@/components/AuthButton'; // 기존 AuthButton 유지 (또는 구 프로젝트 login.tsx 기반으로 수정 가능)
import { useSession, signOut } from 'next-auth/react';
import React, { useState, useEffect } from 'react';
import Image from 'next/image'; // 구 프로젝트에서 사용

// --------------------------------------------------
// 타입 정의: Electron Preload 및 구 프로젝트 상태
// --------------------------------------------------
declare global {
  interface Window {
    // 5단계에서 정의한 현재 프로젝트의 electronAPI
    electronAPI?: {
      startCapture: (settings: { interval: number; resolution: number }) => Promise<{ success: boolean; message: string }>;
      stopCapture: () => Promise<{ success: boolean; message: string }>;
    };
  }
}

// 구 프로젝트의 설정을 위한 타입 (필요시 사용)
type PersonalSettings = {
  interval: number;
  resolution: number | string;
  statusText?: string; // 구 프로젝트에 있었으나 현재는 상태로 관리
  isRecording?: boolean; // 구 프로젝트에 있었으나 현재는 상태로 관리
  deleteAfterUpload?: boolean;
};

// --------------------------------------------------
// 메인 컴포넌트
// --------------------------------------------------
export default function Home() {
  const { data: session, status } = useSession();

  // --- UI 상태 (구 프로젝트 index.tsx 참조 + 현재 프로젝트 상태 통합) ---
  const [intervalSec, setIntervalSec] = useState<number>(5); // 초 단위 간격
  const [resolution, setResolution] = useState<string>('1.0'); // 해상도 스케일
  const [isRecording, setIsRecording] = useState<boolean>(false); // 캡처 진행 여부
  const [logMessage, setLogMessage] = useState<string>('준비 완료.'); // 하단 로그 메시지
  const [summary, setSummary] = useState(''); // 생성된 요약 (Markdown)
  const [isLoadingSummary, setIsLoadingSummary] = useState(false); // 요약 생성 중 로딩 상태
  const [deleteAfterUpload, setDeleteAfterUpload] = useState<boolean>(false); // 전송 후 삭제 토글 (기본값 false)

  // (구 프로젝트의 activityLog, fileStats 등은 필요시 추가 구현)

  // --- 핸들러 함수들 (현재 프로젝트 IPC/API 호출 방식으로 수정) ---

  // 캡처 시작
  const handleStartCapture = async () => {
    if (!window.electronAPI) {
      setLogMessage('Electron API를 찾을 수 없습니다.');
      return;
    }
    setLogMessage('캡처 시작 요청 중...');
    const settings = { interval: intervalSec, resolution: parseFloat(resolution) };
    const result = await window.electronAPI.startCapture(settings);

    if (result.success) {
      setIsRecording(true);
      setLogMessage('캡처 시작됨.');
    } else {
      setLogMessage(`캡처 시작 실패: ${result.message}`);
    }
  };

  // 캡처 중지
  const handleStopCapture = async () => {
    if (!window.electronAPI) return;
    setLogMessage('캡처 중지 요청 중...');
    const result = await window.electronAPI.stopCapture();

    if (result.success) {
      setIsRecording(false);
      setLogMessage('캡처 중지됨.');
    } else {
      setLogMessage(`캡처 중지 실패: ${result.message}`);
    }
  };

  // 오늘 요약 생성 (5단계 로직 유지)
  const handleGenerateSummary = async () => {
    setIsLoadingSummary(true);
    setSummary('');
    setLogMessage('오늘 활동 요약을 생성 중입니다...');

    try {
      const response = await fetch('/api/summary', {
        method: 'POST',
      });
      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setSummary(data.summary);
        setLogMessage('요약 생성 완료.');
      } else {
        setLogMessage(`요약 생성 실패: ${data.message}`);
      }
    } catch (error) {
      setLogMessage(`API 호출 오류: ${(error as Error).message}`);
    }
    setIsLoadingSummary(false);
  };

  // --- 렌더링 (구 프로젝트 index.tsx 구조 참조) ---

  if (status === 'loading') {
    return <main className="main-content"><p>Loading...</p></main>;
  }

  // 로그인되지 않은 상태 (구 프로젝트 login.tsx 디자인 참조 또는 AuthButton 사용)
  if (!session) {
    return (
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
         {/* 간단 버전: AuthButton 사용 */}
         <div className="login-container">
             <div className="login-header">
               <h1>로그인</h1>
               <p>Screen Capture AI</p>
             </div>
             <AuthButton />
             {/* 필요시 구 프로젝트 login.tsx의 HTML/CSS 추가 */}
         </div>
      </main>
    );
  }

  // 로그인된 상태 (구 프로젝트 index.tsx의 메인 UI 구조)
  const userName = session.user?.name || 'User';
  return (
    <>
      {/* 헤더 (구 프로젝트 구조) */}
      <header className="header">
        <div className="container">
          <div className="header-content">
            <div className="header-left">
              <div className="logo"> {/* 로고 아이콘 등 필요시 추가 */} </div>
              <div className="header-title">
                <h1>Screen Capture AI</h1>
                <p>자동 스크린샷 & AI 분석</p>
              </div>
            </div>
            <div className="header-right">
              {/* 사용자 정보 및 로그아웃 버튼 (AuthButton 내부 로직 활용) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                 <div style={{ textAlign: 'right' }}>
                   <div style={{ fontWeight: 600 }}>{userName}</div>
                   <div style={{ color: 'var(--muted-foreground)' }}>{session.user?.email}</div>
                 </div>
                 {session.user?.image && (
                   <Image src={session.user.image} alt="Profile" width={40} height={40} style={{ borderRadius: '50%' }} />
                 )}
              </div>
              <button onClick={() => signOut()} className="btn btn-secondary btn-sm">로그아웃</button>
              {/* 다크 모드 토글 등 필요시 추가 */}
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 (구 프로젝트 구조) */}
      <main className="main-content">
        <div className="container">
          <div className="grid"> {/* 구 프로젝트는 flex였으나 grid 사용 */}
            {/* 왼쪽 컬럼 */}
            <div className="col-left">
              <section className="card yoko yoko-left"> {/* display: flex 필요 없음 */}
                <div className="card-header">
                  <h3 className="card-title">자동 스크린샷 설정</h3>
                  {/* 상태 표시 등 필요시 추가 */}
                </div>
                <div className="card-content">
                  <div className="control-section">
                    <div className="form-group">
                      <label htmlFor="interval">캡처 간격 (초):</label>
                      <select className="select" id="interval" value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} disabled={isRecording}>
                        <option value={5}>5초</option>
                        <option value={15}>15초</option>
                        <option value={30}>30초</option>
                        <option value={60}>1분</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="resolution">해상도 스케일:</label>
                      <select className="select" id="resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={isRecording}>
                        <option value="1.0">100%</option>
                        <option value="0.75">75%</option>
                        <option value="0.5">50%</option>
                      </select>
                    </div>
                    {/* 캡처 시작/중지 버튼 */}
                    <button
                      onClick={isRecording ? handleStopCapture : handleStartCapture}
                      className={`btn btn-large btn-full ${isRecording ? 'btn-destructive' : 'btn-primary'}`}
                      id={isRecording ? 'btn-stop' : 'btn-start'}
                    >
                      {isRecording ? '캡처 중지' : '캡처 시작'}
                    </button>
                  </div>
                  {/* 통계 (구 프로젝트 참조, 필요시 추가) */}
                  {/* <div className="stats-grid">...</div> */}
                </div>
                {/* 미리보기 (구 프로젝트 참조, 필요시 추가) */}
                {/* <div id="isCapturing">...</div> */}
              </section>
            </div>

            {/* 오른쪽 컬럼 */}
            <div className="col-right">
              <section className="card yoko">
                <div className="card-header">
                  <h4 className="card-title">레포트 생성</h4>
                </div>
                <div className="card-content">
                  <div className="report-section">
                    {/* 전송 후 삭제 토글 (구 프로젝트 참조) */}
                    <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label htmlFor="deleteAfterUploadToggle">전송 후 스크린샷 삭제</label>
                      <label className="toggle-switch">
                        <input type="checkbox" id="deleteAfterUploadToggle" checked={deleteAfterUpload} onChange={(e) => setDeleteAfterUpload(e.target.checked)} />
                        <span className="slider"></span>
                      </label>
                    </div>
                    {/* 오늘 요약 생성 버튼 */}
                    <button
                      onClick={handleGenerateSummary}
                      disabled={isLoadingSummary}
                      className="btn btn-primary btn-large btn-full"
                      style={{ marginTop: '1rem' }}
                    >
                      {isLoadingSummary ? '생성 중...' : '오늘 요약 생성하기'}
                    </button>
                     {/* 요약 결과 표시 */}
                     {summary && (
                       <div style={{ marginTop: '1rem', padding: '10px', border: '1px solid var(--border)', background: 'var(--background)', maxHeight: '300px', overflowY: 'auto' }}>
                         <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '0.875rem' }}>
                           {summary}
                         </pre>
                       </div>
                     )}
                  </div>
                </div>
              </section>
              {/* 활동 로그 (구 프로젝트 참조, 필요시 추가) */}
              {/* <section className="card yoko">...</section> */}
              {/* 과거 레포트 (구 프로젝트 참조, 필요시 추가) */}
              {/* <section className="card">...</section> */}
            </div>
          </div>
        </div>
      </main>

      {/* 하단 로그 바 */}
      <footer style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', background: '#333', color: '#eee', padding: '10px 20px', fontSize: '0.875rem' }}>
        <strong>로그:</strong> {logMessage}
      </footer>
    </>
  );
}