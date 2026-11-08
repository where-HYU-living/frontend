/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // 3-4: 자주 안 바뀌는 라이브러리를 따로 떼어 재배포 때도 브라우저 캐시를 쓰게
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]three[\\/]/.test(id)) return 'vendor-three';
          if (/react|scheduler|zustand|@tanstack|lucide/.test(id)) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
