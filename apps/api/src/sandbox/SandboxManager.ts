import { exec } from 'child_process'
import { mkdir, writeFile, rm } from 'fs/promises'
import path from 'path'
import pool from '../db/client.js'

function execAsync(
  command: string,
  options?: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, options ?? {}, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve({ stdout: stdout.toString(), stderr: stderr.toString() })
    })
  })
}

export interface SandboxInfo {
  sandboxPath: string
  sandboxDbName: string
  sandboxRedisPrefix: string
  sandboxPort: number
  devServerPid?: number
}

interface SandboxRecord extends SandboxInfo {
  mirrorDir: string
  lastActivityAt: Date
}

export function sanitizeThreadId(threadId: string): string {
  const sanitized = threadId.replace(/[^a-zA-Z0-9]/g, '_')
  // Postgres identifiers cannot start with a digit
  const prefixed = /^[0-9]/.test(sanitized) ? `s_${sanitized}` : sanitized
  return prefixed.substring(0, 50)
}

function buildDbUrl(baseUrl: string, dbName: string): string {
  try {
    const url = new URL(baseUrl)
    url.pathname = `/${dbName}`
    return url.toString()
  } catch {
    return `${baseUrl.replace(/\/[^/]*$/, '')}/${dbName}`
  }
}

const MAX_CONCURRENT_SANDBOXES = 5

export class SandboxManager {
  private sandboxes = new Map<string, SandboxRecord>()
  private allocatedPorts = new Map<string, number>()
  private mirrorLocks = new Map<string, Promise<void>>()
  private idleCheckInterval: ReturnType<typeof setInterval>

  constructor() {
    this.idleCheckInterval = setInterval(async () => {
      await this.checkIdleSandboxes()
    }, 30 * 60 * 1000)
    // Don't block process exit on this timer
    ;(this.idleCheckInterval as unknown as { unref?: () => void }).unref?.()
  }

  private get basePath(): string {
    return process.env.SANDBOX_BASE_PATH ?? '/app/sandboxes'
  }

  private get mirrorPath(): string {
    return process.env.SANDBOX_MIRROR_PATH ?? '/app/mirrors'
  }

  private get portRangeStart(): number {
    return parseInt(process.env.SANDBOX_PORT_RANGE_START ?? '5100', 10)
  }

  private get portRangeEnd(): number {
    return parseInt(process.env.SANDBOX_PORT_RANGE_END ?? '5199', 10)
  }

  private ensureMirror(repoOwner: string, repoName: string, mirrorDir: string, repoUrl: string): Promise<void> {
    const key = `${repoOwner}/${repoName}`
    const prev = this.mirrorLocks.get(key) ?? Promise.resolve()
    const next = prev.catch(() => {}).then(async () => {
      try {
        await execAsync(`git -C "${mirrorDir}" remote update`)
      } catch {
        await mkdir(path.dirname(mirrorDir), { recursive: true })
        await execAsync(`git clone --mirror "${repoUrl}" "${mirrorDir}"`)
      }
    })
    this.mirrorLocks.set(key, next.catch(() => {}))
    return next
  }

  private allocatePort(): number {
    const usedPorts = new Set(this.allocatedPorts.values())
    for (let port = this.portRangeStart; port <= this.portRangeEnd; port++) {
      if (!usedPorts.has(port)) {
        return port
      }
    }
    throw new Error('No ports available in the sandbox pool')
  }

  private async checkIdleSandboxes(): Promise<void> {
    const now = Date.now()
    const fourHoursMs = 4 * 60 * 60 * 1000
    for (const [threadId, record] of this.sandboxes.entries()) {
      if (now - record.lastActivityAt.getTime() > fourHoursMs) {
        await this.destroy(threadId)
      }
    }
  }

  private buildDevEnv(sanitizedId: string, port: number, threadId: string): string {
    const baseUrl = process.env.DATABASE_URL ?? ''
    return [
      `DATABASE_URL=${buildDbUrl(baseUrl, `distru_session_${sanitizedId}`)}`,
      `REDIS_URL=${process.env.REDIS_URL ?? ''}`,
      `REDIS_KEY_PREFIX=session:${threadId}:`,
      `SECRET_KEY_BASE=${process.env.DISTRU_SECRET_KEY_BASE ?? ''}`,
      `AWS_ACCESS_KEY_ID=${process.env.DISTRU_AWS_ACCESS_KEY_ID ?? ''}`,
      `AWS_SECRET_ACCESS_KEY=${process.env.DISTRU_AWS_SECRET_ACCESS_KEY ?? ''}`,
      `AWS_REGION=${process.env.DISTRU_AWS_REGION ?? ''}`,
      `S3_BUCKET=${process.env.DISTRU_S3_BUCKET ?? ''}`,
      `ANTHROPIC_API_KEY=${process.env.DISTRU_ANTHROPIC_API_KEY ?? ''}`,
      `OPENAI_API_KEY=${process.env.DISTRU_OPENAI_API_KEY ?? ''}`,
      `COHERE_API_KEY=${process.env.DISTRU_COHERE_API_KEY ?? ''}`,
      `GOOGLE_GEMINI_API_KEY=${process.env.DISTRU_GOOGLE_GEMINI_API_KEY ?? ''}`,
      `CHARGEBEE_API_KEY=${process.env.DISTRU_CHARGEBEE_API_KEY ?? ''}`,
      `GOOGLE_MAPS_API_KEY=${process.env.DISTRU_GOOGLE_MAPS_API_KEY ?? ''}`,
      `PORT=${port}`,
      `MIX_ENV=dev`,
    ].join('\n')
  }

  private buildTestEnv(sanitizedId: string): string {
    const baseUrl = process.env.DATABASE_URL ?? ''
    return [
      `DATABASE_URL=${buildDbUrl(baseUrl, `distru_session_${sanitizedId}_test`)}`,
      `REDIS_URL=${process.env.REDIS_URL ?? ''}`,
      `SECRET_KEY_BASE=${process.env.DISTRU_SECRET_KEY_BASE ?? ''}`,
      `AWS_ACCESS_KEY_ID=${process.env.DISTRU_AWS_ACCESS_KEY_ID ?? ''}`,
      `AWS_SECRET_ACCESS_KEY=${process.env.DISTRU_AWS_SECRET_ACCESS_KEY ?? ''}`,
      `AWS_REGION=${process.env.DISTRU_AWS_REGION ?? ''}`,
      `S3_BUCKET=${process.env.DISTRU_S3_BUCKET ?? ''}`,
      `ANTHROPIC_API_KEY=${process.env.DISTRU_ANTHROPIC_API_KEY ?? ''}`,
      `OPENAI_API_KEY=${process.env.DISTRU_OPENAI_API_KEY ?? ''}`,
      `COHERE_API_KEY=${process.env.DISTRU_COHERE_API_KEY ?? ''}`,
      `GOOGLE_GEMINI_API_KEY=${process.env.DISTRU_GOOGLE_GEMINI_API_KEY ?? ''}`,
      `CHARGEBEE_API_KEY=${process.env.DISTRU_CHARGEBEE_API_KEY ?? ''}`,
      `GOOGLE_MAPS_API_KEY=${process.env.DISTRU_GOOGLE_MAPS_API_KEY ?? ''}`,
      `MIX_ENV=test`,
    ].join('\n')
  }

  async create(
    threadId: string,
    repoOwner: string,
    repoName: string,
    branch: string,
  ): Promise<SandboxInfo> {
    if (this.sandboxes.size >= MAX_CONCURRENT_SANDBOXES) {
      throw new Error(`Maximum concurrent sandbox limit (${MAX_CONCURRENT_SANDBOXES}) reached`)
    }

    const sanitizedId = sanitizeThreadId(threadId)
    const mirrorDir = path.join(this.mirrorPath, repoOwner, `${repoName}.git`)
    const sandboxPath = path.join(this.basePath, threadId)
    const repoUrl = `https://github.com/${repoOwner}/${repoName}`

    // Step 1: Ensure mirror exists; serialized per repo to avoid concurrent git corruption
    await this.ensureMirror(repoOwner, repoName, mirrorDir, repoUrl)

    // Steps 2 & 3: Create worktree and checkout
    try {
      await execAsync(
        `git -C "${mirrorDir}" worktree add --no-checkout "${sandboxPath}" "${branch}"`,
      )
      await execAsync(`git -C "${sandboxPath}" checkout`)
    } catch {
      // Branch doesn't exist yet — create from develop
      await execAsync(
        `git -C "${mirrorDir}" worktree add -b "${branch}" "${sandboxPath}" develop`,
      )
    }

    // Step 4: Allocate a port (synchronous — safe under concurrent calls)
    const port = this.allocatePort()
    this.allocatedPorts.set(threadId, port)

    // Step 5: Create both Postgres databases
    const dbName = `distru_session_${sanitizedId}`
    const testDbName = `${dbName}_test`
    const client = await pool.connect()
    try {
      await client.query(`CREATE DATABASE "${dbName}"`)
      await client.query(`CREATE DATABASE "${testDbName}"`)
    } finally {
      client.release()
    }

    // Steps 6 & 6a: Write config/env/dev.env and config/env/test.env
    const configEnvDir = path.join(sandboxPath, 'config', 'env')
    await mkdir(configEnvDir, { recursive: true })
    await writeFile(path.join(configEnvDir, 'dev.env'), this.buildDevEnv(sanitizedId, port, threadId))
    await writeFile(path.join(configEnvDir, 'test.env'), this.buildTestEnv(sanitizedId))

    // Step 7: Install dependencies (10-min timeout each)
    await execAsync('mix deps.get', { cwd: sandboxPath, timeout: 10 * 60 * 1000 })
    await execAsync('yarn install --frozen-lockfile', { cwd: sandboxPath, timeout: 10 * 60 * 1000 })

    // Step 8: Migrate and seed (DB was already created in step 5; skip ecto.create)
    await execAsync('mix ecto.migrate && mix run priv/repo/seeds.exs', {
      cwd: sandboxPath,
      timeout: 5 * 60 * 1000,
    })

    const info: SandboxInfo = {
      sandboxPath,
      sandboxDbName: dbName,
      sandboxRedisPrefix: `session:${threadId}:`,
      sandboxPort: port,
    }

    this.sandboxes.set(threadId, { ...info, mirrorDir, lastActivityAt: new Date() })
    return info
  }

  async destroy(threadId: string): Promise<void> {
    const record = this.sandboxes.get(threadId)
    if (!record) return

    const { sandboxPath, sandboxDbName, sandboxPort, devServerPid, mirrorDir } = record
    const testDbName = `${sandboxDbName}_test`

    // Step 1: Kill dev server
    if (devServerPid) {
      try { process.kill(devServerPid, 'SIGTERM') } catch { /* already dead */ }
    } else {
      // Fall back to killing by port
      try {
        const { stdout } = await execAsync(`lsof -ti:${sandboxPort}`)
        for (const pid of stdout.trim().split('\n').filter(Boolean)) {
          try { process.kill(parseInt(pid, 10), 'SIGTERM') } catch { /* ignore */ }
        }
      } catch { /* no processes on port */ }
    }

    // Step 2: Remove git worktree
    try {
      await execAsync(`git -C "${mirrorDir}" worktree remove --force "${sandboxPath}"`)
    } catch { /* worktree already gone */ }

    // Step 3: Drop both databases
    const client = await pool.connect()
    try {
      await client.query(`DROP DATABASE IF EXISTS "${sandboxDbName}"`)
      await client.query(`DROP DATABASE IF EXISTS "${testDbName}"`)
    } finally {
      client.release()
    }

    // Step 4: Delete the directory
    try {
      await rm(sandboxPath, { recursive: true, force: true })
    } catch { /* already gone */ }

    // Step 5: Release port
    this.allocatedPorts.delete(threadId)
    this.sandboxes.delete(threadId)
  }

  getSandboxInfo(threadId: string): SandboxInfo | null {
    const record = this.sandboxes.get(threadId)
    if (!record) return null
    const { mirrorDir: _mirrorDir, lastActivityAt: _lastActivityAt, ...info } = record
    return info
  }

  setDevServerPid(threadId: string, pid: number): void {
    const record = this.sandboxes.get(threadId)
    if (record) {
      record.devServerPid = pid
      record.lastActivityAt = new Date()
    }
  }

  updateActivity(threadId: string): void {
    const record = this.sandboxes.get(threadId)
    if (record) record.lastActivityAt = new Date()
  }

  dispose(): void {
    clearInterval(this.idleCheckInterval)
  }
}

export const sandboxManager = new SandboxManager()
export default sandboxManager
