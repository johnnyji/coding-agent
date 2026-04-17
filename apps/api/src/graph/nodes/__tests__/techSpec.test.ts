import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @anthropic-ai/claude-agent-sdk
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

// Mock SandboxManager
vi.mock('../../../sandbox/SandboxManager.js', () => ({
  sandboxManager: {
    create: vi.fn(),
  },
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

// Mock db/client
vi.mock('../../../db/client.js', () => ({
  default: {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  },
}))

import { readFile } from 'fs/promises'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { sandboxManager } from '../../../sandbox/SandboxManager.js'
import { techSpecNode } from '../techSpec.js'
import type { GraphState } from '../../state.js'

const mockSandboxInfo = {
  sandboxPath: '/app/sandboxes/thread-abc',
  sandboxDbName: 'distru_session_thread_abc',
  sandboxRedisPrefix: 'session:thread-abc:',
  sandboxPort: 5100,
}

const baseState: typeof GraphState.State = {
  threadId: 'thread-abc',
  userId: 'user-1',
  userLogin: 'testuser',
  repoOwner: 'acme',
  repoName: 'webapp',
  featureRequest: 'Add bulk CSV export to orders table',
  gitBranch: '',
  techSpecPath: '',
  techSpecContent: '',
  sandboxPath: '',
  sandboxDbName: '',
  sandboxRedisPrefix: '',
  sandboxPort: 0,
  messages: [],
  delegationDecision: null,
  userQuestion: null,
  iterationCount: 0,
  maxIterations: 20,
  lastAgentOutput: '',
  prUrl: null,
}

describe('techSpecNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(sandboxManager.create).mockResolvedValue(mockSandboxInfo)

    // readFile called twice: once for template, once for spec
    vi.mocked(readFile)
      .mockResolvedValueOnce('# Tech Spec Template\n\n## Asks\n- [ ] ...\n')
      .mockResolvedValueOnce('# Tech Spec: Bulk CSV Export\n\n## Asks\n- [ ] implement export\n')

    // query yields a result message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockImplementation(async function* (): any {
      yield { result: 'Tech spec written successfully', stop_reason: 'end_turn' }
    } as any)
  })

  it('derives gitBranch from featureRequest', async () => {
    const result = await techSpecNode(baseState)
    expect(result.gitBranch).toBe('feature/add-bulk-csv-export-to-orders-table')
  })

  it('computes techSpecPath using the slug', async () => {
    const result = await techSpecNode(baseState)
    expect(result.techSpecPath).toBe(
      'docs/tech_spec/__agents__/add-bulk-csv-export-to-orders-table.md',
    )
  })

  it('populates techSpecContent from the written spec file', async () => {
    const result = await techSpecNode(baseState)
    expect(result.techSpecContent).toContain('Bulk CSV Export')
  })

  it('sets sandbox state fields from SandboxManager', async () => {
    const result = await techSpecNode(baseState)
    expect(result.sandboxPath).toBe(mockSandboxInfo.sandboxPath)
    expect(result.sandboxDbName).toBe(mockSandboxInfo.sandboxDbName)
    expect(result.sandboxRedisPrefix).toBe(mockSandboxInfo.sandboxRedisPrefix)
    expect(result.sandboxPort).toBe(mockSandboxInfo.sandboxPort)
  })

  it('calls SandboxManager.create with correct branch', async () => {
    await techSpecNode(baseState)
    expect(sandboxManager.create).toHaveBeenCalledWith(
      'thread-abc',
      'acme',
      'webapp',
      'feature/add-bulk-csv-export-to-orders-table',
    )
  })

  it('accumulates agent output into lastAgentOutput', async () => {
    const result = await techSpecNode(baseState)
    expect(result.lastAgentOutput).toContain('Tech spec written successfully')
  })

  it('passes cwd and bypassPermissions to query', async () => {
    await techSpecNode(baseState)
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          cwd: mockSandboxInfo.sandboxPath,
          allowDangerouslySkipPermissions: true,
        }),
      }),
    )
  })
})
