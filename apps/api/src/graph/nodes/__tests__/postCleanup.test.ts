import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { readFile } from 'fs/promises'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { runInSandbox } from '../../../sandbox/runInSandbox.js'
import { postCleanupNode, detectCleanupCategories } from '../postCleanup.js'
import type { GraphState } from '../../state.js'

const UPDATED_SPEC =
  '# Tech Spec\n\n## Completed\nFeature implemented.\n\nPost-cleanup: No cleanup changes needed.\n'

const baseState: typeof GraphState.State = {
  threadId: 'thread-abc',
  userId: 'user-1',
  userLogin: 'testuser',
  repoOwner: 'acme',
  repoName: 'webapp',
  featureRequest: 'Add bulk CSV export',
  gitBranch: 'feature/add-bulk-csv-export',
  techSpecPath: 'docs/tech_spec/__agents__/add-bulk-csv-export.md',
  techSpecContent: '# Tech Spec\n\n## Completed\nFeature implemented.\n',
  sandboxPath: '/app/sandboxes/thread-abc',
  sandboxDbName: 'distru_session_thread_abc',
  sandboxRedisPrefix: 'session:thread-abc:',
  sandboxPort: 5100,
  messages: [],
  delegationDecision: 'IMPLEMENT',
  userQuestion: null,
  iterationCount: 2,
  maxIterations: 20,
  lastAgentOutput: '',
  prUrl: null,
}

describe('detectCleanupCategories', () => {
  it('detects FE changes from .ts files', () => {
    const cats = detectCleanupCategories(['src/components/Table.tsx', 'src/utils/export.ts'])
    expect(cats.fe).toBe(true)
    expect(cats.be).toBe(false)
    expect(cats.gql).toBe(false)
    expect(cats.db).toBe(false)
  })

  it('detects FE changes from package.json', () => {
    const cats = detectCleanupCategories(['package.json'])
    expect(cats.fe).toBe(true)
  })

  it('detects FE changes from assets/ path', () => {
    const cats = detectCleanupCategories(['assets/images/logo.png'])
    expect(cats.fe).toBe(true)
  })

  it('detects BE changes from .ex files', () => {
    const cats = detectCleanupCategories(['lib/distru/orders.ex', 'mix.exs'])
    expect(cats.be).toBe(true)
    expect(cats.fe).toBe(false)
  })

  it('detects GQL changes from .graphql files', () => {
    const cats = detectCleanupCategories(['lib/distru_web/schema/order_types.ex'])
    expect(cats.gql).toBe(true)
    expect(cats.be).toBe(true) // _types.ex also matches .ex
  })

  it('detects DB changes from migrations path', () => {
    const cats = detectCleanupCategories([
      'priv/repo/migrations/20240101_add_exports_table.exs',
    ])
    expect(cats.db).toBe(true)
    expect(cats.be).toBe(true) // .exs also matches BE
  })

  it('returns all false for unrelated files', () => {
    const cats = detectCleanupCategories(['README.md', 'docs/tech_spec/feature.md'])
    expect(cats).toEqual({ fe: false, be: false, gql: false, db: false })
  })

  it('detects multiple categories at once', () => {
    const cats = detectCleanupCategories([
      'lib/distru/orders.ex',
      'assets/js/app.js',
      'priv/repo/migrations/001_add_table.exs',
    ])
    expect(cats.fe).toBe(true)
    expect(cats.be).toBe(true)
    expect(cats.db).toBe(true)
  })
})

describe('postCleanupNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: no changed files
    vi.mocked(runInSandbox).mockResolvedValue({
      stdout: 'lib/distru/orders.ex\nsrc/components/Table.tsx\n',
      stderr: '',
      exitCode: 0,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(readFile).mockResolvedValue(UPDATED_SPEC as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockImplementation(async function* (): any {
      yield { result: 'Cleanup complete. No changes needed.', stop_reason: 'end_turn' }
    } as any)
  })

  it('populates lastAgentOutput from query output', async () => {
    const result = await postCleanupNode(baseState)
    expect(result.lastAgentOutput).toContain('Cleanup complete.')
  })

  it('re-reads tech spec from disk and updates techSpecContent', async () => {
    const result = await postCleanupNode(baseState)
    expect(result.techSpecContent).toBe(UPDATED_SPEC)
    expect(readFile).toHaveBeenCalledWith(
      '/app/sandboxes/thread-abc/docs/tech_spec/__agents__/add-bulk-csv-export.md',
      'utf-8',
    )
  })

  it('appends a summary AIMessage to state.messages', async () => {
    const result = await postCleanupNode(baseState)
    expect(result.messages).toHaveLength(1)
    expect((result.messages![0] as { content: string }).content).toContain('[PostCleanup]')
  })

  it('calls query with correct cwd, allowDangerouslySkipPermissions, and maxTurns', async () => {
    await postCleanupNode(baseState)
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          cwd: '/app/sandboxes/thread-abc',
          allowDangerouslySkipPermissions: true,
          maxTurns: 40,
        }),
      }),
    )
  })

  it('invokes Claude Code even when no cleanup categories are detected', async () => {
    vi.mocked(runInSandbox).mockResolvedValue({
      stdout: 'README.md\ndocs/overview.md\n',
      stderr: '',
      exitCode: 0,
    })

    await postCleanupNode(baseState)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('sets delegationDecision to null and appends error message when query throws', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(query).mockImplementation(async function* (): any {
      throw new Error('Cleanup agent crashed')
    } as any)

    const result = await postCleanupNode(baseState)
    expect(result.delegationDecision).toBeNull()
    expect(result.messages).toHaveLength(1)
    expect((result.messages![0] as { content: string }).content).toContain('Cleanup agent crashed')
  })

  it('runs git diff to determine changed files using runInSandbox', async () => {
    await postCleanupNode(baseState)
    expect(runInSandbox).toHaveBeenCalledWith(
      '/app/sandboxes/thread-abc',
      'git diff --name-only HEAD~1 HEAD',
    )
  })
})
