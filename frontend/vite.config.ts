import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  publicDir: 'public',
  server: {
    port: 3000,
    open: true
  }
});

