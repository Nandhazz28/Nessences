import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev: proxy API + media so cookies are same-origin (no CORS/SameSite surprises).
export default defineConfig({
  test: { environment: 'jsdom', globals: true, css: false, testTimeout: 20000, setupFiles: ['./test/setup.js'] },
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000', '/media': 'http://localhost:4000', '/sitemap.xml': 'http://localhost:4000', '/robots.txt': 'http://localhost:4000' } },
});
