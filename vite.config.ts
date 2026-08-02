import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // La logique métier est pure : aucun test n'a besoin du DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
