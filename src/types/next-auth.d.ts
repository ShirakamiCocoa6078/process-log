// src/types/next-auth.d.ts

import { DefaultSession } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

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
            id: string;
        } & DefaultSession['user'];
    }
}