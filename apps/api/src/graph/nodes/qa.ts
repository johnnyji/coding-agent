import { readFile } from 'fs/promises'
import path from 'path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { AIMessage } from '@langchain/core/messages'
import { GraphState } from '../state.js'
import { buildQaPrompt } from '../prompts/qa.js'
import { runInSandbox } from '../../sandbox/runInSandbox.js'
import { sandboxManager } from '../../sandbox/SandboxManager.js'

export const HEALTH_POLL_INTERVAL_MS = 5_000
export const HEALTH_POLL_MAX_ATTEMPTS = 36 // 36 * 5s = 3 minutes

async function pollServerReady(url: string, maxAttempts: number, intervalMs: number): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // server not ready yet
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  return false
}

export async function qaNode(
  state: typeof GraphState.State,
): Promise<Partial<typeof GraphState.State>> {
  console.log('[qa] called')

  const { threadId, sandboxPath, sandboxPort, techSpecPath, techSpecContent } = state

  // Step 1: Start the dev server in the background and capture its PID
  const serverStartResult = await runInSandbox(
    sandboxPath,
    'mix phx.server & echo $!',
    30_000,
  )
  const devServerPid = parseInt(serverStartResult.stdout.trim(), 10)

  if (isNaN(devServerPid)) {
    return {
      messages: [
        new AIMessage(
          `[QA] Failed to start dev server. stdout: ${serverStartResult.stdout} stderr: ${serverStartResult.stderr}`,
        ),
      ],
    }
  }

  sandboxManager.setDevServerPid(threadId, devServerPid)

  // Poll until server is ready (up to 3 minutes)
  const healthUrl = `http://localhost:${sandboxPort}/health`
  const serverReady = await pollServerReady(healthUrl, HEALTH_POLL_MAX_ATTEMPTS, HEALTH_POLL_INTERVAL_MS)

  if (!serverReady) {
    try { process.kill(devServerPid, 'SIGTERM') } catch { /* already dead */ }
    return {
      messages: [
        new AIMessage(
          `[QA] Dev server did not become ready at ${healthUrl} within ${Math.round((HEALTH_POLL_MAX_ATTEMPTS * HEALTH_POLL_INTERVAL_MS) / 60_000)} minutes.`,
        ),
      ],
    }
  }

  // Step 2: Build QA prompt
  const prompt = buildQaPrompt({ techSpecContent, sandboxPort })

  // Steps 3-4: Invoke Claude Code with Playwright MCP and stream output
  let lastAgentOutput = ''
  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: sandboxPath,
        allowDangerouslySkipPermissions: true,
        maxTurns: 60,
        mcpServers: {
          playwright: {
            command: 'npx',
            args: ['@playwright/mcp'],
          },
        },
      },
    })) {
      if ('result' in message) {
        lastAgentOutput += message.result + '\n'
      }
    }

    // Step 5: Re-read tech spec to capture any Bugs the agent wrote
    const absoluteSpecPath = path.join(sandboxPath, techSpecPath)
    const updatedTechSpecContent = await readFile(absoluteSpecPath, 'utf-8')

    const summaryMessage = new AIMessage(
      `[QA] Agent finished.\n\nOutput:\n${lastAgentOutput.trim()}`,
    )

    return {
      lastAgentOutput,
      techSpecContent: updatedTechSpecContent,
      messages: [summaryMessage],
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      messages: [new AIMessage(`[QA] Agent failed with error: ${errorMessage}`)],
    }
  } finally {
    // Step 6: Kill dev server regardless of success or failure
    try { process.kill(devServerPid, 'SIGTERM') } catch { /* already dead */ }
  }
}
