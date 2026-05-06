import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isStudent = mode === 'student';
  return {
    base: './',
    root: '.',
    publicDir: 'public',
    server: {
      port: 5173,
      open: true
    },
    build: {
      outDir: 'dist'
    },
    define: {
      'import.meta.env.VITE_APP_SHELL': JSON.stringify(isStudent ? 'student' : 'teacher'),
    },
  };
});
