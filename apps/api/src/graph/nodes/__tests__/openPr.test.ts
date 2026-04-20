import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock GitHub app client
const mockPullsCreate = vi.fn()
const mockGetInstallationOctokit = vi.fn().mockResolvedValue({
  pulls: { create: mockPullsCreate },
})
vi.mock('../../../github/appClient.js', () => ({
  getInstallationOctokit: (...args: unknown[]) => mockGetInstallationOctokit(...args),
}))

// Mock runInSandbox
const mockRunInSandbox = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
vi.mock('../../../sandbox/runInSandbox.js', () => ({
  runInSandbox: (...args: unknown[]) => mockRunInSandbox(...args),
}))

// Mock SandboxManager singleton
const mockDestroy = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../sandbox/SandboxManager.js', () => ({
  default: { destroy: (...args: unknown[]) => mockDestroy(...args) },
  sandboxManager: { destroy: (...args: unknown[]) => mockDestroy(...args) },
}))

// Mock Postgres pool
const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
vi.mock('../../../db/client.js', () => ({
  default: { query: (...args: unknown[]) => mockQuery(...args) },
}))

import { openPrNode } from '../openPr.js'
import type { GraphState } from '../../state.js'

const TECH_SPEC = `# My Feature

## What are we building?

A feature that exports bulk CSV data from the orders table.

## Feature Sections

### Section 1
`

const baseState: typeof GraphState.State = {
  threadId: 'thread-open-pr',
  userId: 'user-1',
  userLogin: 'alice',
  repoOwner: 'acme',
  repoName: 'webapp',
  featureRequest: 'add bulk csv export to the orders table',
  gitBranch: 'feature/add-bulk-csv-export-to-the-orders-table',
  techSpecPath: 'docs/tech_spec/__agents__/add-bulk-csv-export.md',
  techSpecContent: TECH_SPEC,
  sandboxPath: '/app/sandboxes/thread-open-pr',
  sandboxDbName: 'distru_session_thread_open_pr',
  sandboxRedisPrefix: 'session:thread-open-pr:',
  sandboxPort: 5100,
  messages: [],
  delegationDecision: 'FINISH',
  userQuestion: null,
  iterationCount: 5,
  maxIterations: 20,
  lastAgentOutput: '',
  prUrl: null,
}

describe('openPrNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPullsCreate.mockResolvedValue({
      data: { html_url: 'https://github.com/acme/webapp/pull/42' },
    })
  })

  it('pushes the feature branch via runInSandbox', async () => {
    await openPrNode(baseState)
    expect(mockRunInSandbox).toHaveBeenCalledWith(
      '/app/sandboxes/thread-open-pr',
      expect.stringContaining('git push origin'),
    )
    expect(mockRunInSandbox).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('feature/add-bulk-csv-export-to-the-orders-table'),
    )
  })

  it('calls octokit.pulls.create with correct head, base, and owner', async () => {
    await openPrNode(baseState)
    expect(mockPullsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'webapp',
        head: 'feature/add-bulk-csv-export-to-the-orders-table',
        base: 'develop',
      }),
    )
  })

  it('PR title is title-cased and truncated to 70 chars', async () => {
    await openPrNode(baseState)
    const call = mockPullsCreate.mock.calls[0][0] as { title: string }
    expect(call.title).toBe('Add Bulk Csv Export To The Orders Table')
    expect(call.title.length).toBeLessThanOrEqual(70)
  })

  it('PR body contains the engineer login', async () => {
    await openPrNode(baseState)
    const call = mockPullsCreate.mock.calls[0][0] as { body: string }
    expect(call.body).toContain('@alice')
  })

  it('PR body contains the feature request summary from the spec', async () => {
    await openPrNode(baseState)
    const call = mockPullsCreate.mock.calls[0][0] as { body: string }
    expect(call.body).toContain('A feature that exports bulk CSV data from the orders table.')
  })

  it('stores the PR URL in state', async () => {
    const result = await openPrNode(baseState)
    expect(result.prUrl).toBe('https://github.com/acme/webapp/pull/42')
  })

  it('appends a message with the PR URL', async () => {
    const result = await openPrNode(baseState)
    expect(result.messages).toHaveLength(1)
    expect((result.messages![0] as { content: string }).content).toContain(
      'https://github.com/acme/webapp/pull/42',
    )
  })

  it('updates orchestrator_sessions to finished with pr_url', async () => {
    await openPrNode(baseState)
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'finished'"),
      ['https://github.com/acme/webapp/pull/42', 'thread-open-pr'],
    )
  })

  it('destroys the sandbox', async () => {
    await openPrNode(baseState)
    expect(mockDestroy).toHaveBeenCalledWith('thread-open-pr')
  })
})
