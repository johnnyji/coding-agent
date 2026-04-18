import { serve } from '@hono/node-server';
import { app } from './app.js';
import { runMigrations } from './db/migrate.js';

await runMigrations();

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 8080),
});
