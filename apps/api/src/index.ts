import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

serve({
  fetch: app.fetch,
  port: 8080,
})
