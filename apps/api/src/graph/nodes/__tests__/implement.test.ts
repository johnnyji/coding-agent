import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @anthropic-ai/claude-agent-sdk
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'fs/promises'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { implementNode } from '../implement.js'
import type { GraphState } from '../../state.js'

const UPDATED_SPEC = '# Tech Spec\n\n## Asks\n- [x] implement feature\n\n## Completed\nFeature implemented.\n'

const baseState: typeof GraphState.State = {
  threadId: 'thread-abc',
  userId: 'user-1',
  userLogin: 'testuser',
  repoOwner: 'acme',
  repoName: 'webapp',
  featureRequest: 'Add bulk CSV export',
  gitBranch: 'feature/add-bulk-csv-export',
  techSpecPath: 'docs/tech_spec/__agents__/add-bulk-csv-export.md',
  techSpecContent: '# Tech Spec\n\n## Asks\n- [ ] implement feature\n',
  sandboxPath: '/app/sandboxes/thread-abc',
  sandboxDbName: 'distru_session_thread_abc',
  sandboxRedisPrefix: 'session:thread-abc:',
  sandboxPort: 5100,
  messages: [],
  delegationDecision: 'IMPLEMENT',
  userQuestion: null,
  iterationCount: 1,
  maxIterations: 20,
  lastAgentOutput: '',
  prUrl: null,
}

describe('implementNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(readFile).mockResolvedValue(UPDATED_SPEC as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockImplementation(async function* (): any {
      yield { result: 'Section implemented and committed.', stop_reason: 'end_turn' }
    } as any)
  })

  it('populates lastAgentOutput from query output', async () => {
    const result = await implementNode(baseState)
    expect(result.lastAgentOutput).toContain('Section implemented and committed.')
  })

  it('re-reads tech spec from disk and updates techSpecContent', async () => {
    const result = await implementNode(baseState)
    expect(result.techSpecContent).toBe(UPDATED_SPEC)
    expect(readFile).toHaveBeenCalledWith(
      '/app/sandboxes/thread-abc/docs/tech_spec/__agents__/add-bulk-csv-export.md',
      'utf-8',
    )
  })

  it('appends a summary AIMessage to state.messages', async () => {
    const result = await implementNode(baseState)
    expect(result.messages).toHaveLength(1)
    expect((result.messages![0] as { content: string }).content).toContain('[Implement]')
  })

  it('calls query with correct cwd, allowDangerouslySkipPermissions, and maxTurns', async () => {
    await implementNode(baseState)
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          cwd: '/app/sandboxes/thread-abc',
          allowDangerouslySkipPermissions: true,
          maxTurns: 80,
        }),
      }),
    )
  })

  it('sets delegationDecision to null and appends error message when query throws', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockImplementation(async function* (): any {
      throw new Error('Agent crashed')
    } as any)

    const result = await implementNode(baseState)
    expect(result.delegationDecision).toBeNull()
    expect(result.messages).toHaveLength(1)
    expect((result.messages![0] as { content: string }).content).toContain('Agent crashed')
  })
})
