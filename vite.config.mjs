import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import nodePolyfills from 'rollup-plugin-node-polyfills'

export default defineConfig({
  base: '/DripX/', // 👈 Very important — repo name with forward slashes
  plugins: [
    react(),
    nodePolyfills({
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      // process: 'process/browser',
    },
  },
  define: {
    'process.env': {},
  },
})
