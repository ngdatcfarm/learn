import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Polyfill Node.js modules (events, buffer, stream, ...) cho browser
      // simple-peer dung readable-stream + EventEmitter, can co de WebRTC work
      nodePolyfills({
        include: ['events', 'buffer', 'stream', 'util', 'process'],
        globals: { Buffer: true, global: true, process: true },
        protocolImports: true,
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
