// src/components/AuthButton.tsx
'use client';

import { useSession, signIn, signOut } from 'next-auth/react';

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <p>인증 상태 확인 중...</p>;
  }

  if (session) {
    // 로그인 된 상태
    return (
      <div>
        <p>환영합니다, {session.user?.email}</p>
        <button 
          onClick={() => signOut()} 
          style={{ padding: '10px', color: 'white', background: 'red' }}
        >
          로그아웃
        </button>
      </div>
    );
  }

  // 로그인 안 된 상태
  return (
    <div>
      <p>로그인되지 않았습니다.</p>
      <button 
        onClick={() => signIn('google')} 
        style={{ padding: '10px', color: 'white', background: 'blue' }}
      >
        Google 계정으로 로그인
      </button>
    </div>
  );
}