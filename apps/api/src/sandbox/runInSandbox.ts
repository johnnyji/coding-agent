import { spawn } from 'child_process'
import { readFile } from 'fs/promises'
import path from 'path'

async function loadSandboxEnv(sandboxPath: string): Promise<Record<string, string>> {
  const envFile = path.join(sandboxPath, 'config', 'env', 'dev.env')
  try {
    const content = await readFile(envFile, 'utf-8')
    const env: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1)
    }
    return env
  } catch {
    return {}
  }
}

export async function runInSandbox(
  sandboxPath: string,
  command: string,
  timeoutMs = 15 * 60 * 1000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const sandboxEnv = await loadSandboxEnv(sandboxPath)

  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: sandboxPath,
      env: { ...process.env, ...sandboxEnv },
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`))
    }, timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
