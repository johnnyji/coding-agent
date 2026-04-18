import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @anthropic-ai/claude-agent-sdk
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

// Mock runInSandbox
vi.mock('../../../sandbox/runInSandbox.js', () => ({
  runInSandbox: vi.fn(),
}))

// Mock SandboxManager singleton
vi.mock('../../../sandbox/SandboxManager.js', () => ({
  sandboxManager: {
    setDevServerPid: vi.fn(),
  },
}))

import { readFile } from 'fs/promises'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { runInSandbox } from '../../../sandbox/runInSandbox.js'
import { sandboxManager } from '../../../sandbox/SandboxManager.js'
import { qaNode, HEALTH_POLL_INTERVAL_MS, HEALTH_POLL_MAX_ATTEMPTS } from '../qa.js'
import type { GraphState } from '../../state.js'

const UPDATED_SPEC = '# Tech Spec\n\n## QA Checklist\nAll checks passed.\n\n## Bugs\n*(none)*\n'

const baseState: typeof GraphState.State = {
  threadId: 'thread-qa',
  userId: 'user-1',
  userLogin: 'testuser',
  repoOwner: 'acme',
  repoName: 'webapp',
  featureRequest: 'Add bulk CSV export',
  gitBranch: 'feature/add-bulk-csv-export',
  techSpecPath: 'docs/tech_spec/__agents__/add-bulk-csv-export.md',
  techSpecContent: '# Tech Spec\n\n## QA Checklist\n- [ ] Verify CSV export works\n',
  sandboxPath: '/app/sandboxes/thread-qa',
  sandboxDbName: 'distru_session_thread_qa',
  sandboxRedisPrefix: 'session:thread-qa:',
  sandboxPort: 5100,
  messages: [],
  delegationDecision: 'QA',
  userQuestion: null,
  iterationCount: 3,
  maxIterations: 20,
  lastAgentOutput: '',
  prUrl: null,
}

describe('qaNode', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let killSpy: any
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    killSpy = vi.spyOn(process, 'kill').mockReturnValue(true as unknown as never)

    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    // Default: dev server starts with PID 12345
    vi.mocked(runInSandbox).mockResolvedValue({
      stdout: '12345\n',
      stderr: '',
      exitCode: 0,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(readFile).mockResolvedValue(UPDATED_SPEC as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockImplementation(async function* (): any {
      yield { result: 'QA complete. All checks passed.', stop_reason: 'end_turn' }
    } as never)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts the dev server via runInSandbox and stores the PID', async () => {
    await qaNode(baseState)
    expect(runInSandbox).toHaveBeenCalledWith(
      '/app/sandboxes/thread-qa',
      'mix phx.server & echo $!',
      30_000,
    )
    expect(sandboxManager.setDevServerPid).toHaveBeenCalledWith('thread-qa', 12345)
  })

  it('polls the health endpoint at the correct URL', async () => {
    await qaNode(baseState)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5100/health')
  })

  it('returns an error message if the dev server PID is not parseable', async () => {
    vi.mocked(runInSandbox).mockResolvedValue({
      stdout: 'not-a-number\n',
      stderr: 'mix failed',
      exitCode: 1,
    })
    const result = await qaNode(baseState)
    expect(result.messages).toHaveLength(1)
    expect((result.messages![0] as { content: string }).content).toContain(
      'Failed to start dev server',
    )
    // query should not have been called
    expect(query).not.toHaveBeenCalled()
  })

  it('returns an error and kills server if health check never succeeds', async () => {
    vi.useFakeTimers()
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    const resultPromise = qaNode(baseState)

    // Advance past the full poll window (all attempts × interval)
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MAX_ATTEMPTS * HEALTH_POLL_INTERVAL_MS + 1000)

    const result = await resultPromise

    expect(result.messages).toHaveLength(1)
    expect((result.messages![0] as { content: string }).content).toContain('did not become ready')
    expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM')
    expect(query).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('populates lastAgentOutput from query output', async () => {
    const result = await qaNode(baseState)
    expect(result.lastAgentOutput).toContain('QA complete.')
  })

  it('re-reads tech spec from disk and updates techSpecContent', async () => {
    const result = await qaNode(baseState)
    expect(result.techSpecContent).toBe(UPDATED_SPEC)
    expect(readFile).toHaveBeenCalledWith(
      '/app/sandboxes/thread-qa/docs/tech_spec/__agents__/add-bulk-csv-export.md',
      'utf-8',
    )
  })

  it('appends a summary AIMessage to state.messages on success', async () => {
    const result = await qaNode(baseState)
    expect(result.messages).toHaveLength(1)
    expect((result.messages![0] as { content: string }).content).toContain('[QA]')
  })

  it('calls query with correct cwd, permissions, maxTurns, and Playwright mcpServers', async () => {
    await qaNode(baseState)
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          cwd: '/app/sandboxes/thread-qa',
          allowDangerouslySkipPermissions: true,
          maxTurns: 60,
          mcpServers: expect.objectContaining({
            playwright: expect.objectContaining({ command: 'npx' }),
          }),
        }),
      }),
    )
  })

  it('kills the dev server even when Claude Code throws', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockImplementation(async function* (): any {
      throw new Error('QA agent crashed')
    } as never)

    await qaNode(baseState)

    expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM')
  })

  it('returns an error message when Claude Code throws', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockImplementation(async function* (): any {
      throw new Error('QA agent crashed')
    } as never)

    const result = await qaNode(baseState)
    expect(result.messages).toHaveLength(1)
    expect((result.messages![0] as { content: string }).content).toContain('QA agent crashed')
  })

  it('kills the dev server after successful QA', async () => {
    await qaNode(baseState)
    expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM')
  })
})
