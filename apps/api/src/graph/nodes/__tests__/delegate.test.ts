import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @langchain/anthropic
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn(),
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'fs/promises'
import { ChatAnthropic } from '@langchain/anthropic'
import { delegateNode } from '../delegate.js'
import type { GraphState } from '../../state.js'

const SPEC_CONTENT = '# Tech Spec\n\n## Asks\n- [ ] implement feature\n'

const baseState: typeof GraphState.State = {
  threadId: 'thread-abc',
  userId: 'user-1',
  userLogin: 'testuser',
  repoOwner: 'acme',
  repoName: 'webapp',
  featureRequest: 'Add bulk CSV export',
  gitBranch: 'feature/add-bulk-csv-export',
  techSpecPath: 'docs/tech_spec/__agents__/add-bulk-csv-export.md',
  techSpecContent: '',
  sandboxPath: '/app/sandboxes/thread-abc',
  sandboxDbName: 'distru_session_thread_abc',
  sandboxRedisPrefix: 'session:thread-abc:',
  sandboxPort: 5100,
  messages: [],
  delegationDecision: null,
  userQuestion: null,
  iterationCount: 0,
  maxIterations: 20,
  lastAgentOutput: '',
  prUrl: null,
}

function makeStructuredModel(returnValue: object) {
  return {
    invoke: vi.fn().mockResolvedValue(returnValue),
    withStructuredOutput: vi.fn(),
  }
}

function setupMocks(decision: object) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(readFile).mockResolvedValue(SPEC_CONTENT as any)

  const structuredModel = makeStructuredModel(decision)
  const mockInstance = {
    withStructuredOutput: vi.fn().mockReturnValue(structuredModel),
  }
  vi.mocked(ChatAnthropic).mockImplementation(() => mockInstance as unknown as ChatAnthropic)

  return { structuredModel, mockInstance }
}

describe('delegateNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns IMPLEMENT when there are unchecked Asks', async () => {
    setupMocks({ decision: 'IMPLEMENT', reasoning: 'Unchecked asks remain.' })

    const result = await delegateNode(baseState)
    expect(result.delegationDecision).toBe('IMPLEMENT')
  })

  it('returns BUG_FIX when bugs are found', async () => {
    setupMocks({ decision: 'BUG_FIX', reasoning: 'Unresolved bugs in spec.' })

    const result = await delegateNode(baseState)
    expect(result.delegationDecision).toBe('BUG_FIX')
  })

  it('returns QA when all asks are complete', async () => {
    setupMocks({ decision: 'QA', reasoning: 'All asks checked, QA not run.' })

    const result = await delegateNode(baseState)
    expect(result.delegationDecision).toBe('QA')
  })

  it('returns ASK_USER_QUESTION and populates userQuestion', async () => {
    setupMocks({
      decision: 'ASK_USER_QUESTION',
      reasoning: 'Blocking question found.',
      userQuestion: 'Which database should be used?',
    })

    const result = await delegateNode(baseState)
    expect(result.delegationDecision).toBe('ASK_USER_QUESTION')
    expect(result.userQuestion).toBe('Which database should be used?')
  })

  it('returns FINISH when QA passed with no bugs', async () => {
    setupMocks({ decision: 'FINISH', reasoning: 'QA passed, no bugs.' })

    const result = await delegateNode(baseState)
    expect(result.delegationDecision).toBe('FINISH')
  })

  it('increments iterationCount', async () => {
    setupMocks({ decision: 'IMPLEMENT', reasoning: 'More work to do.' })

    const result = await delegateNode({ ...baseState, iterationCount: 3 })
    expect(result.iterationCount).toBe(4)
  })

  it('re-reads tech spec from disk and updates techSpecContent', async () => {
    setupMocks({ decision: 'IMPLEMENT', reasoning: 'Unchecked asks remain.' })

    const result = await delegateNode(baseState)
    expect(result.techSpecContent).toBe(SPEC_CONTENT)
    expect(readFile).toHaveBeenCalledWith(
      '/app/sandboxes/thread-abc/docs/tech_spec/__agents__/add-bulk-csv-export.md',
      'utf-8',
    )
  })

  it('appends a delegation summary to messages', async () => {
    setupMocks({ decision: 'QA', reasoning: 'All done, time to test.' })

    const result = await delegateNode(baseState)
    expect(result.messages).toHaveLength(1)
    expect((result.messages![0] as { content: string }).content).toContain('QA')
    expect((result.messages![0] as { content: string }).content).toContain('All done, time to test.')
  })

  it('sets userQuestion to null when decision is not ASK_USER_QUESTION', async () => {
    setupMocks({ decision: 'FINISH', reasoning: 'Done.' })

    const result = await delegateNode(baseState)
    expect(result.userQuestion).toBeNull()
  })
})
