import {defineConfig} from 'vitest/config';

// unit — быстрые (логика, реестры, API, фото): npm test
// render — медленные, с настоящим рендером: npm run test:render
export default defineConfig({
  test: {
    projects: [
      {test: {name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts', 'tests/server/**/*.test.mjs']}},
      {test: {name: 'render', environment: 'node', include: ['tests/render/**/*.test.mjs'], testTimeout: 600_000, hookTimeout: 600_000}},
    ],
  },
});
