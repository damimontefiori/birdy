import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { birdyApiVitePlugin } from './server/apiPlugin';

export default defineConfig({
  plugins: [react(), birdyApiVitePlugin()],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
