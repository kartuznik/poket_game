import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

function commitShort(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim().slice(0, 7);
  } catch {
    return '';
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_COMMIT__: JSON.stringify(commitShort()),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
  },
});
