import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (must be declared before any import that triggers the module) ---

// vi.hoisted ensures variables declared here are available inside vi.mock factories
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../graph/run.js', () => ({
  startThread: vi.fn().mockResolvedValue('test-thread-id'),
  resumeThread: vi.fn().mockResolvedValue(undefined),
  subscribeToThread: vi.fn().mockReturnValue(() => {}),
  getThreadMessages: vi.fn().mockResolvedValue([]),
}));

vi.mock('../db/client.js', () => ({
  default: { query: mockQuery },
}));

// Mock jose so JWT validation always succeeds in tests
vi.mock('jose', () => ({
  jwtVerify: vi.fn().mockResolvedValue({
    payload: { userId: 'user-123', userLogin: 'testuser' },
  }),
}));

// Mock graph/build so the app module can be imported without a real DB
vi.mock('../graph/graph.js', () => ({
  buildGraph: vi.fn().mockResolvedValue({
    invoke: vi.fn(),
    stream: vi.fn(),
    getState: vi.fn(),
    streamEvents: vi.fn(),
  }),
}));

// Import after mocks are established
import { app } from '../app.js';
import { startThread, resumeThread } from '../graph/run.js';

// Set required env vars before any route handler runs
process.env.NEXTAUTH_SECRET = 'test-secret';

// ---------------------------------------------------------------------------

const AUTH_HEADER = { Authorization: 'Bearer test-token' };

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

// ---------------------------------------------------------------------------

describe('POST /api/threads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('creates a session row and starts the graph, returns threadId', async () => {
    const res = await request('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({
        repoOwner: 'acme',
        repoName: 'backend',
        featureRequest: 'Add CSV export',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { threadId: string };
    expect(typeof body.threadId).toBe('string');
    expect(body.threadId.length).toBeGreaterThan(0);

    // Verify DB insert
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO orchestrator_sessions'),
      expect.arrayContaining(['acme', 'backend'])
    );

    // Verify graph started
    expect(startThread).toHaveBeenCalledOnce();
    expect(startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        repoOwner: 'acme',
        repoName: 'backend',
        featureRequest: 'Add CSV export',
        userId: 'user-123',
        userLogin: 'testuser',
      })
    );
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoOwner: 'acme',
        repoName: 'backend',
        featureRequest: 'Add CSV export',
      }),
    });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/threads/:threadId/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resumes the graph and returns { ok: true }', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-123' }] });

    const res = await request('/api/threads/thread-abc/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({ message: 'Use UUIDs for primary keys' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(resumeThread).toHaveBeenCalledOnce();
    expect(resumeThread).toHaveBeenCalledWith(
      'thread-abc',
      'Use UUIDs for primary keys'
    );
  });

  it('returns 404 when thread does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request('/api/threads/nonexistent/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({ message: 'hello' }),
    });

    expect(res.status).toBe(404);
    expect(resumeThread).not.toHaveBeenCalled();
  });

  it('returns 403 when thread belongs to a different user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }] });

    const res = await request('/api/threads/thread-abc/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({ message: 'hello' }),
    });

    expect(res.status).toBe(403);
    expect(resumeThread).not.toHaveBeenCalled();
  });

  it('returns 401 without auth', async () => {
    const res = await request('/api/threads/thread-abc/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });

    expect(res.status).toBe(401);
  });
});
