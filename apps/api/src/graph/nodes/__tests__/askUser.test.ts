import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── LangGraph interrupt ──────────────────────────────────────────────────────
// We capture the mock so tests can control what interrupt() returns.
const mockInterrupt = vi.fn();
vi.mock('@langchain/langgraph', () => ({
  interrupt: (...args: unknown[]) => mockInterrupt(...args),
}));

// ── Postgres pool ────────────────────────────────────────────────────────────
const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
vi.mock('../../../db/client.js', () => ({
  default: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { askUserNode } from '../askUser.js';
import type { GraphState } from '../../state.js';

const baseState: typeof GraphState.State = {
  threadId: 'thread-123',
  userId: 'user-1',
  userLogin: 'alice',
  repoOwner: 'acme',
  repoName: 'webapp',
  featureRequest: 'Add bulk CSV export',
  gitBranch: 'feature/add-bulk-csv-export',
  techSpecPath: 'docs/tech_spec/__agents__/add-bulk-csv-export.md',
  techSpecContent: '# spec',
  sandboxPath: '/app/sandboxes/thread-123',
  sandboxDbName: 'distru_session_thread_123',
  sandboxRedisPrefix: 'session:thread-123:',
  sandboxPort: 5100,
  messages: [],
  delegationDecision: 'ASK_USER_QUESTION',
  userQuestion: 'Which auth strategy should we use?',
  iterationCount: 2,
  maxIterations: 20,
  lastAgentOutput: '',
  prUrl: null,
};

describe('askUserNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when userQuestion is null', async () => {
    mockInterrupt.mockReturnValue('answer');
    await expect(
      askUserNode({ ...baseState, userQuestion: null })
    ).rejects.toThrow('[askUser] called but userQuestion is null');
  });

  it('calls interrupt with the current userQuestion', async () => {
    mockInterrupt.mockReturnValue('OAuth');

    await askUserNode(baseState);

    expect(mockInterrupt).toHaveBeenCalledWith('Which auth strategy should we use?');
  });

  it('sets session status to waiting before interrupt', async () => {
    mockInterrupt.mockReturnValue('OAuth');

    await askUserNode(baseState);

    // First query should be the 'waiting' update
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("status = 'waiting'"),
      ['thread-123']
    );
  });

  it('sets session status to running after resume', async () => {
    mockInterrupt.mockReturnValue('OAuth');

    await askUserNode(baseState);

    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("status = 'running'"),
      ['thread-123']
    );
  });

  it('appends question as AIMessage and answer as HumanMessage', async () => {
    mockInterrupt.mockReturnValue('Use OAuth');

    const result = await askUserNode(baseState);

    expect(result.messages).toHaveLength(2);
    const [questionMsg, answerMsg] = result.messages as Array<{ content: string }>;
    expect(questionMsg.content).toBe('Which auth strategy should we use?');
    expect(answerMsg.content).toBe('Use OAuth');
  });

  it('clears userQuestion in returned state', async () => {
    mockInterrupt.mockReturnValue('answer');

    const result = await askUserNode(baseState);

    expect(result.userQuestion).toBeNull();
  });

  it('resets delegationDecision to null', async () => {
    mockInterrupt.mockReturnValue('answer');

    const result = await askUserNode(baseState);

    expect(result.delegationDecision).toBeNull();
  });
});
