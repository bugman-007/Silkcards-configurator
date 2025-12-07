import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  publicDir: 'public',
  server: {
    port: 3000,
    host: true, // Enable network access
    open: true,
    hmr: {
      clientPort: 3000, // Use same port for HMR WebSocket
      protocol: 'ws'
    }
  }
});

