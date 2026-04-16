import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exec } from 'child_process'
import { SandboxManager, sanitizeThreadId } from '../SandboxManager.js'

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../db/client.js', () => ({
  default: {
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    }),
  },
}))

// Helper to make the mocked exec succeed
function mockExecSuccess(stdout = '') {
  vi.mocked(exec).mockImplementation(
    ((_cmd: string, _opts: unknown, cb: unknown) => {
      const callback = (typeof _opts === 'function' ? _opts : cb) as (
        err: null,
        stdout: string,
        stderr: string,
      ) => void
      process.nextTick(() => callback(null, stdout, ''))
    }) as typeof exec,
  )
}

describe('sanitizeThreadId', () => {
  it('replaces hyphens and spaces with underscores', () => {
    expect(sanitizeThreadId('abc-123')).toBe('abc_123')
    expect(sanitizeThreadId('hello world')).toBe('hello_world')
  })

  it('prefixes numeric-starting IDs to avoid leading digit', () => {
    expect(sanitizeThreadId('123abc')).toBe('s_123abc')
  })

  it('truncates to 50 characters', () => {
    const long = 'a'.repeat(60)
    expect(sanitizeThreadId(long).length).toBeLessThanOrEqual(50)
  })

  it('produces names valid for Postgres (letter/underscore start, alphanumeric/underscore body)', () => {
    const ids = ['thread-abc-123', '99-start', 'uuid-4f3a-b2c1', 'simple']
    for (const id of ids) {
      expect(sanitizeThreadId(id)).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    }
  })
})

describe('SandboxManager', () => {
  let manager: SandboxManager

  beforeEach(() => {
    manager = new SandboxManager()
    mockExecSuccess()
  })

  afterEach(() => {
    manager.dispose()
  })

  describe('port allocation', () => {
    it('allocates unique ports for concurrent create calls', async () => {
      const [info1, info2, info3] = await Promise.all([
        manager.create('thread-1', 'owner', 'repo', 'branch-1'),
        manager.create('thread-2', 'owner', 'repo', 'branch-2'),
        manager.create('thread-3', 'owner', 'repo', 'branch-3'),
      ])

      const ports = [info1.sandboxPort, info2.sandboxPort, info3.sandboxPort]
      expect(new Set(ports).size).toBe(3)
      expect(ports[0]).not.toBe(ports[1])
      expect(ports[1]).not.toBe(ports[2])
    })

    it('releases the port back to the pool after destroy', async () => {
      const info = await manager.create('thread-A', 'owner', 'repo', 'branch')
      const allocatedPort = info.sandboxPort

      await manager.destroy('thread-A')

      const info2 = await manager.create('thread-B', 'owner', 'repo', 'branch')
      expect(info2.sandboxPort).toBe(allocatedPort)
    })
  })

  describe('create', () => {
    it('populates sandboxDbName using sanitized threadId', async () => {
      const info = await manager.create('my-thread-id', 'acme', 'webapp', 'feature/foo')
      expect(info.sandboxDbName).toBe('distru_session_my_thread_id')
    })

    it('populates sandboxRedisPrefix with original threadId', async () => {
      const info = await manager.create('my-thread-id', 'acme', 'webapp', 'feature/foo')
      expect(info.sandboxRedisPrefix).toBe('session:my-thread-id:')
    })

    it('includes threadId in sandboxPath', async () => {
      const info = await manager.create('my-thread-id', 'acme', 'webapp', 'feature/foo')
      expect(info.sandboxPath).toContain('my-thread-id')
    })
  })

  describe('destroy', () => {
    it('removes the sandbox from getSandboxInfo', async () => {
      await manager.create('thread-X', 'owner', 'repo', 'branch')
      expect(manager.getSandboxInfo('thread-X')).not.toBeNull()

      await manager.destroy('thread-X')
      expect(manager.getSandboxInfo('thread-X')).toBeNull()
    })

    it('is a no-op for unknown threadIds', async () => {
      await expect(manager.destroy('nonexistent')).resolves.toBeUndefined()
    })
  })

  describe('setDevServerPid', () => {
    it('stores the pid and getSandboxInfo reflects it', async () => {
      await manager.create('thread-pid', 'owner', 'repo', 'branch')
      manager.setDevServerPid('thread-pid', 12345)
      expect(manager.getSandboxInfo('thread-pid')?.devServerPid).toBe(12345)
    })
  })
})
