import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 8_000,
    hookTimeout: 8_000,
    restoreMocks: true,
  },
});
