// src/types/next-auth.d.ts

import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

// JWT 토큰에 id와 role을 포함하도록 확장
declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
  }
}

// Session의 user 객체에 id와 role을 포함하도록 확장
declare module 'next-auth' {
  interface Session {
    user: {
      id: string; // 👈 여기! user 객체에 id를 추가합니다.
    } & DefaultSession['user']; // 기존의 name, email, image 타입은 유지
  }

  // (선택) User 모델에도 role을 추가하고 싶다면
  interface User extends DefaultUser {
    // role: string;
  }
}