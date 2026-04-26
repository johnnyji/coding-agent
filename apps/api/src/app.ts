import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import pool from './db/client.js';
import {
  startThread,
  resumeThread,
  subscribeToThread,
  getThreadMessages,
} from './graph/run.js';
import { validateSession, type HonoEnv } from './auth/validateSession.js';
import { getInstallationOctokit } from './github/appClient.js';

const app = new Hono<HonoEnv>();

app.use(
  '*',
  cors({
    origin: process.env.ALLOWED_ORIGIN ?? '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

app.get('/health', (c) => c.json({ status: 'ok' }));

// All /api/threads routes require auth
app.use('/api/threads/*', validateSession);

// POST /api/threads — start a new session
app.post('/api/threads', async (c) => {
  const body = await c.req.json<{
    repoOwner: string;
    repoName: string;
    featureRequest: string;
  }>();

  const userId = c.get('userId');
  const userLogin = c.get('userLogin');

  // Pre-flight: verify the GitHub App is installed on the target repo
  try {
    await getInstallationOctokit(body.repoOwner, body.repoName);
  } catch {
    return c.json(
      {
        error: 'GitHub App is not installed on this repository. Please install it first.',
        installUrl: `https://github.com/apps/${process.env.GITHUB_APP_SLUG ?? 'your-app'}/installations/new`,
      },
      422
    );
  }

  const threadId = crypto.randomUUID();

  await pool.query(
    `INSERT INTO orchestrator_sessions
       (thread_id, user_id, user_login, repo_owner, repo_name, status)
     VALUES ($1, $2, $3, $4, $5, 'running')`,
    [threadId, userId, userLogin, body.repoOwner, body.repoName]
  );

  await startThread({
    threadId,
    userId,
    userLogin,
    repoOwner: body.repoOwner,
    repoName: body.repoName,
    featureRequest: body.featureRequest,
  });

  return c.json({ threadId });
});

// GET /api/threads/:threadId/stream — SSE stream of graph events
//
// Query params:
//   from (optional, default 0) — cursor sent by the client indicating how many
//   events it has already received. We replay only events from that index
//   onward, preventing duplicate messages on reconnect. See: subscribeToThread
//   in graph/run.ts and eventCountRef in useOrchestrator.ts.
app.get('/api/threads/:threadId/stream', (c) => {
  const threadId = c.req.param('threadId');
  const fromIndex = Math.max(0, parseInt(c.req.query('from') ?? '0', 10));

  return streamSSE(c, async (stream) => {
    await new Promise<void>((resolve) => {
      let unsubscribeFn: (() => void) | null = null;
      let resolved = false;
      let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

      function cleanup() {
        if (!resolved) {
          resolved = true;
          if (keepaliveTimer) clearInterval(keepaliveTimer);
          unsubscribeFn?.();
          resolve();
        }
      }

      stream.onAbort(cleanup);

      // Send an SSE comment every 30s to prevent Cloudflare 524 timeouts.
      // Cloudflare closes upstream connections that are silent for >60s, so we
      // keep the pipe alive with a no-op ping. The client ignores comment lines.
      keepaliveTimer = setInterval(() => {
        stream.write(': ping\n\n').catch(cleanup);
      }, 30_000);

      unsubscribeFn = subscribeToThread(
        threadId,
        (event) => {
          stream.writeSSE({ data: JSON.stringify(event) }).catch(cleanup);
          if (event.type === 'finish') {
            // Defer so unsubscribeFn is assigned before cleanup runs
            queueMicrotask(cleanup);
          }
        },
        fromIndex,
      );
    });
  });
});

// POST /api/threads/:threadId/messages — resume an interrupted graph
app.post('/api/threads/:threadId/messages', async (c) => {
  const threadId = c.req.param('threadId');
  const userId = c.get('userId');
  const body = await c.req.json<{ message: string }>();

  const result = await pool.query(
    'SELECT user_id FROM orchestrator_sessions WHERE thread_id = $1',
    [threadId]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'Thread not found' }, 404);
  }

  if ((result.rows[0] as { user_id: string }).user_id !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await resumeThread(threadId, body.message);

  return c.json({ ok: true });
});

// GET /api/threads/:threadId — current session state
app.get('/api/threads/:threadId', async (c) => {
  const threadId = c.req.param('threadId');
  const userId = c.get('userId');

  const result = await pool.query(
    'SELECT * FROM orchestrator_sessions WHERE thread_id = $1 AND user_id = $2',
    [threadId, userId]
  );

  if (result.rows.length === 0) {
    return c.json({ error: 'Thread not found' }, 404);
  }

  const messages = await getThreadMessages(threadId);

  return c.json({ session: result.rows[0], messages });
});

export { app };
