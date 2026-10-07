import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/Creative-Component-1-Robot-Perception/',
  test: {
    environment: 'jsdom',
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
