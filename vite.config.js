import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        login: 'login.html',
        verified: 'verified.html',
        strength: 'strength.html',
        endurance: 'endurance.html'
      }
    }
  }
});
