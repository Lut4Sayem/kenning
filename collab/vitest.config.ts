import { defineConfig } from 'vitest/config'

export default defineConfig({
  // One yjs for the frontend file undoRule.test.ts imports too (frontend/node_modules is absent in CI).
  resolve: { dedupe: ['yjs'] },
  test: { include: ['test/**/*.test.ts'], testTimeout: 10_000 },
})
