import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // In development the dashboard calls /api and /socket.io on its own origin and Vite proxies
  // them to the backend. Set VITE_API_BASE_URL to call the backend directly instead (CORS).
  const backend = env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: backend, changeOrigin: false },
        '/socket.io': { target: backend, ws: true, changeOrigin: false },
      },
    },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.test.{js,jsx}'],
      css: false,
    },
  };
});
