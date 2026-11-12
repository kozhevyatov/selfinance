import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // общий пакет — исходники TS, вшиваем в сборку
  noExternal: ['@selfinance/shared'],
});
