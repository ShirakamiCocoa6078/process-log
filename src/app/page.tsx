// src/app/page.tsx
'use client';

import AuthButton from '@/components/AuthButton';
import { useSession, signOut } from 'next-auth/react';
import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

// --------------------------------------------------
// 타입 정의: Electron Preload 및 상태
// --------------------------------------------------
type SettingsData = {
  interval?: number;
  resolution?: number | string;
  deleteAfterUpload?: boolean;
};

type StatsData = {
  totalShots: number;
  totalSize: number;
  uploadedCount: number;
};

type ActivityLogEntry = {
  time: string;
  message: string;
};

declare global {
  interface Window {
    electronAPI?: {
      startCapture: (settings: { interval: number; resolution: number }) => Promise<{ success: boolean; message: string }>;
      stopCapture: () => Promise<{ success: boolean; message: string }>;
      readSettings: () => Promise<SettingsData>;
      writeSettings: (settings: SettingsData) => Promise<{ success: boolean; error?: string }>;
      getStats: () => Promise<StatsData>;
      listScreenshots: (limit?: number) => Promise<string[]>;
      closeWindow: () => Promise<void>;
      onLogMessage: (callback: (message: string) => void) => () => void; // 반환 타입은 클린업 함수
    };
  }
}
// --------------------------------------------------
// 메인 컴포넌트
// --------------------------------------------------
export default function Home() {
  const { data: session, status } = useSession();

  // --- UI 상태 ---
  const [intervalSec, setIntervalSec] = useState<number>(5);
  const [resolution, setResolution] = useState<string>('1.0');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [deleteAfterUpload, setDeleteAfterUpload] = useState<boolean>(false);
  const [summary, setSummary] = useState('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false); // 설정 로드 완료 여부

  // --- [추가] 통계 상태 ---
  const [totalShots, setTotalShots] = useState<number>(0);
  const [totalSize, setTotalSize] = useState<number>(0);
  const [uploadedCount, setUploadedCount] = useState<number>(0);

  // --- [추가] 미리보기 상태 ---
  const [previewImages, setPreviewImages] = useState<string[]>([]);

  // --- [추가] 활동 로그 상태 ---
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);

  // --- 로그 추가 함수 ---
  const addLog = useCallback((message: string) => {
    // 메시지에서 타임스탬프 제거 (index.ts에서 이미 추가함)
    const cleanMessage = message.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
    const timeMatch = message.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
    const time = timeMatch ? timeMatch[1] : new Date().toLocaleTimeString();

    setActivityLog((prev) => [{ time, message: cleanMessage }, ...prev].slice(0, 100)); // 최근 100개 로그만 유지
  }, []);

  // --- useEffect: 설정 로드 (마운트 시 1회) ---
  useEffect(() => {
    const loadSettings = async () => {
      if (window.electronAPI?.readSettings) {
        try {
          const settings = await window.electronAPI.readSettings();
          setIntervalSec(settings.interval ?? 5);
          setResolution(String(settings.resolution ?? '1.0'));
          setDeleteAfterUpload(settings.deleteAfterUpload ?? false);
          addLog('저장된 설정을 불러왔습니다.');
        } catch (error) {
          addLog(`설정 로드 오류: ${(error as Error).message}`);
        } finally {
          setSettingsLoaded(true); // 로드 완료 표시
        }
      } else {
        setSettingsLoaded(true); // Electron API 없으면 바로 완료 처리
      }
    };
    loadSettings();
  }, [addLog]); // addLog가 useCallback으로 감싸져 있어 한번만 실행됨

  // --- useEffect: 설정 자동 저장 ---
  useEffect(() => {
    if (!settingsLoaded) return; // 설정이 로드된 후에만 저장 시작

    const saveSettings = async () => {
      if (window.electronAPI?.writeSettings) {
        try {
          await window.electronAPI.writeSettings({
            interval: intervalSec,
            resolution: parseFloat(resolution), // 숫자로 변환하여 저장
            deleteAfterUpload: deleteAfterUpload,
          });
          // addLog('설정이 자동 저장되었습니다.'); // 너무 자주 로깅되므로 주석 처리
        } catch (error) {
          addLog(`설정 저장 오류: ${(error as Error).message}`);
        }
      }
    };
    // 디바운스: 마지막 변경 후 500ms 뒤에 저장
    const timer = setTimeout(saveSettings, 500);
    return () => clearTimeout(timer);
  }, [intervalSec, resolution, deleteAfterUpload, settingsLoaded, addLog]);

  // --- useEffect: 통계 및 미리보기 주기적 업데이트 ---
  useEffect(() => {
    const fetchStatsAndPreviews = async () => {
      if (window.electronAPI?.getStats) {
        try {
          const stats = await window.electronAPI.getStats();
          setTotalShots(stats.totalShots);
          setTotalSize(stats.totalSize);
          setUploadedCount(stats.uploadedCount);
        } catch (error) {
          addLog(`통계 업데이트 오류: ${(error as Error).message}`);
        }
      }
      if (window.electronAPI?.listScreenshots) {
        try {
          const previews = await window.electronAPI.listScreenshots(4); // 최근 4개
          setPreviewImages(previews);
        } catch (error) {
          addLog(`미리보기 업데이트 오류: ${(error as Error).message}`);
        }
      }
    };

    fetchStatsAndPreviews(); // 즉시 한번 실행
    const intervalId = setInterval(fetchStatsAndPreviews, 5000); // 5초마다 업데이트

    return () => clearInterval(intervalId); // 컴포넌트 언마운트 시 인터벌 제거
  }, [addLog]);

  // --- useEffect: Main 프로세스 로그 리스너 ---
  useEffect(() => {
    if (window.electronAPI?.onLogMessage) {
      const unsubscribe = window.electronAPI.onLogMessage((message) => {
        addLog(message); // 받은 로그를 상태에 추가
      });
      // 클린업 함수: 컴포넌트 언마운트 시 리스너 제거
      return () => unsubscribe();
    }
  }, [addLog]); // addLog가 useCallback으로 감싸져 있어 한번만 실행됨

  // --- 핸들러 함수들 ---
  const handleStartCapture = async () => { /* 이전과 동일 */ };
  const handleStopCapture = async () => { /* 이전과 동일 */ };
  const handleGenerateSummary = async () => { /* 이전과 동일 */ };

  // [추가] 창 닫기 핸들러
  const handleCloseWindow = () => {
    window.electronAPI?.closeWindow();
  };

  // [추가] 다크 모드 핸들러
  const handleDarkModeToggle = (isChecked: boolean) => {
    document.body.classList.toggle('dark', isChecked);
    // (선택) 로컬 스토리지 등에 상태 저장
    try { localStorage.setItem('darkMode', isChecked ? '1' : '0'); } catch {}
  };

  // --- 렌더링 ---
  if (status === 'loading' || !settingsLoaded) {
    return <main className="main-content"><p>Loading...</p></main>;
  }

  // 로그인되지 않은 상태
  if (!session) {
    // ... (이전과 동일한 로그인 UI)
    return (
        <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
           <div className="login-container">
               <button className="close-button" onClick={handleCloseWindow}>×</button>
               <div className="login-header">
                 <h1>로그인</h1>
                 <p>Screen Capture AI</p>
               </div>
               <AuthButton />
               {/* 구 프로젝트 login.tsx의 다크 모드 토글 등 필요시 추가 */}
           </div>
        </main>
      );
  }

  // 로그인된 상태
  const userName = session.user?.name || 'User';
  return (
    <>
      {/* 헤더 */}
      <header className="header">
        <div className="container">
          <div className="header-content">
            {/* ... (헤더 왼쪽 로고/타이틀) ... */}
             <div className="header-left">
              {/* 로고 SVG 등 필요시 추가 */}
              <div className="header-title">
                <h1>Screen Capture AI</h1>
                <p>자동 스크린샷 & AI 분석</p>
              </div>
            </div>
            <div className="header-right">
              {/* 사용자 정보 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                 {/* ... (사용자 이름, 이메일, 이미지) ... */}
                  <div style={{ textAlign: 'right' }}>
                   <div style={{ fontWeight: 600 }}>{userName}</div>
                   <div style={{ color: 'var(--muted-foreground)' }}>{session.user?.email}</div>
                 </div>
                 {session.user?.image && (
                   <Image src={session.user.image} alt="Profile" width={40} height={40} style={{ borderRadius: '50%' }} />
                 )}
              </div>
              {/* 다크 모드 토글 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label className="toggle-switch">
                      <input type="checkbox" onChange={(e) => handleDarkModeToggle(e.target.checked)} defaultChecked={typeof window !== 'undefined' && localStorage.getItem('darkMode') === '1'} />
                      <span className="slider"></span>
                  </label>
                  <span style={{ fontSize: '0.8rem'}}>다크 모드</span>
              </div>
              {/* 로그아웃 버튼 */}
              <button onClick={() => signOut()} className="btn btn-secondary btn-sm">로그아웃</button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="main-content">
        <div className="container">
          <div className="grid">
            {/* 왼쪽 컬럼 */}
            <div className="col-left">
              <section className="card"> {/* yoko 클래스 제거하고 flex direction 설정 */}
                <div style={{ flex: '7.5', display: 'flex', flexDirection: 'column' }}> {/* 왼쪽 영역 */}
                    <div className="card-header">
                      <h3 className="card-title">자동 스크린샷 설정</h3>
                    </div>
                    <div className="card-content">
                      {/* ... (캡처 간격, 해상도, 시작/중지 버튼 - 이전과 동일) ... */}
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
                        <button
                          onClick={isRecording ? handleStopCapture : handleStartCapture}
                          className={`btn btn-large btn-full ${isRecording ? 'btn-destructive' : 'btn-primary'}`}
                          id={isRecording ? 'btn-stop' : 'btn-start'}
                        >
                          {isRecording ? '캡처 중지' : '캡처 시작'}
                        </button>
                      </div>
                      {/* --- [추가] 통계 표시 --- */}
                      <div className="stats-grid">
                        <div className="stat-card">
                          <div className="stat-label">촬영 매수</div>
                          <div className="stat-value">{totalShots}</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">총 용량</div>
                          {/* 바이트를 MB 단위로 변환하여 소수점 1자리까지 표시 */}
                          <div className="stat-value">{(totalSize / (1024 * 1024)).toFixed(1)} <span style={{fontSize: '1rem'}}>MB</span></div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">업로드 완료</div>
                          <div className="stat-value">{uploadedCount}</div>
                        </div>
                      </div>
                    </div>
                     {/* --- [추가] 스크린샷 미리보기 --- */}
                     <div className="card-content" style={{ borderTop: '1px solid var(--border)' }}>
                         <h4>최근 스크린샷</h4>
                         <div id="isCapturing" style={{ marginTop: '10px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
                           {previewImages.length > 0 ? (
                             previewImages.map((dataUrl, index) => (
                               <img key={index} src={dataUrl} alt={`preview-${index}`} style={{ height: '100px', width: 'auto', borderRadius: '4px', border: '1px solid var(--border)' }} />
                             ))
                           ) : (
                             <p style={{ color: 'var(--muted-foreground)' }}>미리보기 없음</p>
                           )}
                         </div>
                     </div>
                </div>

                <div style={{ flex: '2.5', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}> {/* 오른쪽 영역 */}
                  <div className="card-header">
                      <h4 className="card-title">활동 로그</h4>
                  </div>
                  <div className="card-content" style={{ flexGrow: 1, overflow: 'hidden' }}> {/* 내용이 넘칠 경우 스크롤 */}
                    {/* --- [추가] 활동 로그 리스트 --- */}
                    <div className="activity-list" style={{ height: 'calc(100% - 20px)', overflowY: 'auto' }}>
                       {activityLog.length > 0 ? (
                           activityLog.map((log, index) => (
                             <div className="activity-item" key={index}>
                               <span className="activity-time">{log.time}</span>
                               <span className="activity-message">{log.message}</span>
                             </div>
                           ))
                       ) : (
                           <p style={{ color: 'var(--muted-foreground)'}}>로그 없음</p>
                       )}
                    </div>
                    {/* AI 분석 도트 (캡처 중일 때만 표시) */}
                    <div className={`ai-dots ${isRecording ? 'running' : ''}`} style={{ marginTop: '10px' }}>
                       <span className="dot" />
                       <span className="dot" />
                       <span className="dot" />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* 오른쪽 컬럼 */}
            <div className="col-right">
              {/* 레포트 생성 카드 */}
              <section className="card"> {/* yoko 제거 */}
                <div className="card-content" style={{width: '100%'}}> {/* yoko 제거로 인한 스타일 조정 */}
                  <div className="card-header" style={{padding: 0, marginBottom: '1rem'}}>
                     <h4 className="card-title">레포트 생성</h4>
                  </div>
                  <div className="report-section">
                    <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label htmlFor="deleteAfterUploadToggle">전송 후 스크린샷 삭제</label>
                      <label className="toggle-switch">
                        <input type="checkbox" id="deleteAfterUploadToggle" checked={deleteAfterUpload} onChange={(e) => setDeleteAfterUpload(e.target.checked)} />
                        <span className="slider"></span>
                      </label>
                    </div>
                    <button
                      onClick={handleGenerateSummary}
                      disabled={isLoadingSummary}
                      className="btn btn-primary btn-large btn-full"
                      style={{ marginTop: '1rem' }}
                    >
                      {isLoadingSummary ? '생성 중...' : '오늘 요약 생성하기'}
                    </button>
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
              {/* 과거 레포트 카드 (구 프로젝트 참조, 필요시 추가) */}
              {/* <section className="card">...</section> */}
            </div>
          </div>
        </div>
      </main>

      {/* 하단 로그 바 제거됨 */}
    </>
  );
}