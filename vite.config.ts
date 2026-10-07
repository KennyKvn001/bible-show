import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works from any folder on any static host.
export default defineConfig({
  base: './',
  plugins: [react()],
});
