// src/app/api/auth/[...nextauth]/route.ts
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import NextAuth, { AuthOptions } from 'next-auth';

export const authOptions: AuthOptions = {
  // 1. Prisma Adapter 설정
  adapter: PrismaAdapter(prisma),

  // 2. Provider 설정 (Google)
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  // 3. 세션 전략 (JWT 권장)
  session: {
    strategy: 'jwt',
  },

  // 4. 콜백 설정 (★★★★★ 중요 ★★★★★)
  // 세션에 userId를 포함시켜야 API가 사용자를 식별할 수 있습니다.
  callbacks: {
    async session({ session, token }) {
      // token.sub은 JWT의 subject이며, Prisma Adapter가 user.id로 설정해줍니다.
      if (token && session.user) {
        session.user.id = token.sub as string;
      }
      return session;
    },
    async jwt({ token, user }) {
      // 로그인 시 (user 객체가 있을 때) token.sub에 user.id를 주입합니다.
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  
  // (선택) 로그인/로그아웃 등 커스텀 페이지 설정
  // pages: {
  //   signIn: '/login',
  // },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };