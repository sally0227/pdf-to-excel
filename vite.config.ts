import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // Use '.' instead of process.cwd() to avoid TS error: Property 'cwd' does not exist on type 'Process'
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    define: {
      // This ensures process.env.API_KEY works in the browser code
      // by replacing it with the value from the build environment (Vercel)
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});
