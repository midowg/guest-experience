import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  // 'server-only' resolves to its client build under Vitest; the server entry is the correct no-op here.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)) } },
  // Server and pure logic run in node; a `.dom.test.tsx` file opts into jsdom instead.
  // Two projects rather than environmentMatchGlobs, which Vitest has deprecated.
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'], exclude: ['**/*.dom.test.tsx'] },
      },
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', include: ['src/**/*.dom.test.tsx'] },
      },
    ],
  },
});
