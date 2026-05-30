import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isStudent = mode === 'student';
  // Vercel 환경에서는 절대경로(/)를 써야 /teacher-portal 같은 하위 경로에서도
  // /assets/... 를 올바르게 찾는다. Electron/Capacitor는 상대경로(./)가 필요하다.
  const base = process.env.VERCEL ? '/' : './';
  return {
    base,
    root: '.',
    publicDir: 'public',
    server: {
      port: 5173,
      open: true,
      // 로컬 AI 피드백 API: 다른 터미널에서 `npx vercel dev --listen 3000` 실행 시 `/api/problem-feedback` 사용
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist'
    },
    define: {
      'import.meta.env.VITE_APP_SHELL': JSON.stringify(isStudent ? 'student' : 'teacher'),
    },
  };
});
