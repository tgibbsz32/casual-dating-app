import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// SPARK_DEMO=1 runs the API against test/wrangler.jsonc, the local harness
// with stand-in sign-in. Production/dev default to the real worker.
const demo = process.env.SPARK_DEMO === '1'

export default defineConfig({
  plugins: [react(), cloudflare({ configPath: demo ? './wrangler.test.jsonc' : './wrangler.jsonc' })],
  server: {
    host: true,
    port: 3000,
    allowedHosts: ['pv-d028c959af84-a6c8081f-5e43-45ab-8aa3-f07e6d0d2a45.style.dev'],
  },
})
