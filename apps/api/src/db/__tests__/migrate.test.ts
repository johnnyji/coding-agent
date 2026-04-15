import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the pool before importing migrate
vi.mock('../client.js', () => ({
  default: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

// Mock fs/promises to return a deterministic set of SQL files
vi.mock('fs/promises', () => ({
  readdir: vi.fn().mockResolvedValue(['001_sessions.sql']),
  readFile: vi.fn().mockResolvedValue(
    'CREATE TABLE IF NOT EXISTS orchestrator_sessions (thread_id TEXT PRIMARY KEY);',
  ),
}))

describe('runMigrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs all sql files in order', async () => {
    const { readdir, readFile } = await import('fs/promises')
    const pool = (await import('../client.js')).default
    const { runMigrations } = await import('../migrate.js')

    await runMigrations()

    expect(readdir).toHaveBeenCalledOnce()
    expect(readFile).toHaveBeenCalledOnce()
    expect(pool.query).toHaveBeenCalledOnce()
  })

  it('is idempotent — running twice executes each sql file twice without error', async () => {
    const pool = (await import('../client.js')).default
    const { runMigrations } = await import('../migrate.js')

    await runMigrations()
    await runMigrations()

    // pool.query is called once per file per run; 1 file × 2 runs = 2 calls
    expect(pool.query).toHaveBeenCalledTimes(2)
  })

  it('sorts migration files before executing', async () => {
    const { readdir, readFile } = await import('fs/promises')
    vi.mocked(readdir).mockResolvedValue([
      '002_another.sql',
      '001_sessions.sql',
    ] as unknown as ReturnType<typeof readdir> extends Promise<infer T> ? T : never)

    const callOrder: string[] = []
    vi.mocked(readFile).mockImplementation(async (p) => {
      callOrder.push(String(p).split('/').pop()!)
      return '-- noop'
    })

    const { runMigrations } = await import('../migrate.js')
    await runMigrations()

    expect(callOrder).toEqual(['001_sessions.sql', '002_another.sql'])
  })
})
