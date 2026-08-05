import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env.test.local' })

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': new URL('./src/', import.meta.url).pathname,
    },
  },
})
