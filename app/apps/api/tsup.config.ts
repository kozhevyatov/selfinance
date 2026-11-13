import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// версия приложения — одна на всё, из корневого app/package.json (сборка запускается из apps/api)
const { version } = JSON.parse(readFileSync('../../package.json', 'utf8')) as { version: string };

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
  define: { __APP_VERSION__: JSON.stringify(version) },
});
