import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isStudent = mode === 'student';
  return {
    base: './',
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
