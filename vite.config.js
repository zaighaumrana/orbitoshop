import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  esbuild: {
    target: 'es2020',
  }
})