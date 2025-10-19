// src/app/page.tsx
import AuthButton from '@/components/AuthButton';

export default function Home() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Process Log (Electron Client UI)</h1>
      <hr />
      <AuthButton />
    </main>
  );
}