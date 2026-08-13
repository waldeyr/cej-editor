/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  // Caminhos relativos: o Electron carrega o bundle via file:// (loadFile), onde
  // URLs absolutas como /fonts/rawline-400.ttf apontariam para a raiz do sistema.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  /*
   * O teste roda com DOM porque o leitor de arquivo depende de `DOMParser`.
   * Sem isto o vitest exercitava um segundo leitor, escrito só para o Node,
   * que não é o que o programa usa — e que perdia a epígrafe e a ementa dos
   * atos publicados de verdade. Um teste que aprova código que ninguém executa
   * é pior que teste nenhum.
   */
  test: {
    environment: 'jsdom',
  },
});
