import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// One JS + one CSS, no chunks, no public dir: build.mjs inlines everything
// (and swaps the portal's asset URLs for data URIs) into a single HTML file.
export default defineConfig({
  plugins: [react()],
  root: here,
  base: './',
  publicDir: false,
  resolve: {
    alias: [
      { find: /^(\.\.\/)+lib\/track\.js$/, replacement: resolve(here, 'stubs.js') },
      { find: /^(\.\.\/)+lib\/engagement\.js$/, replacement: resolve(here, 'stubs.js') },
      { find: /^(\.\.\/)+lib\/supabase\.js$/, replacement: resolve(here, 'stubs.js') },
      { find: /^\.\/supabase\.js$/, replacement: resolve(here, 'stubs.js') },
    ],
  },
  build: {
    outDir: resolve(here, 'dist-tmp'),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: { output: { inlineDynamicImports: true, manualChunks: undefined, entryFileNames: 'assets/app.js', assetFileNames: 'assets/[name][extname]' } },
  },
  logLevel: 'warn',
});
