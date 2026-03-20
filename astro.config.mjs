// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';

export default defineConfig({
  integrations: [clerk()],
  output: 'server',
  adapter: vercel(),
  build: {
    inlineStylesheets: 'always',
  },
});
