import { serve } from '@hono/node-server';
import { app } from './app.js';
import { runMigrations } from './db/migrate.js';

// Safety net: log unhandled rejections instead of crashing the process
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
});

await runMigrations();

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 8080),
});
