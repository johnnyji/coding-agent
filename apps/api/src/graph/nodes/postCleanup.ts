import { readFile } from 'fs/promises'
import path from 'path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { AIMessage } from '@langchain/core/messages'
import { GraphState } from '../state.js'
import { buildPostCleanupPrompt, type CleanupCategories } from '../prompts/postCleanup.js'
import { runInSandbox } from '../../sandbox/runInSandbox.js'

export function detectCleanupCategories(changedFiles: string[]): CleanupCategories {
  const fe = changedFiles.some(
    (f) =>
      /\.(js|ts|tsx|jsx|css|scss)$/.test(f) ||
      f.startsWith('assets/') ||
      ['package.json', 'yarn.lock'].includes(path.basename(f)),
  )
  const be = changedFiles.some((f) => /\.(ex|exs)$/.test(f) || path.basename(f) === 'mix.exs')
  const gql = changedFiles.some((f) => /\.(graphql|gql)$/.test(f) || /_types\.ex$/.test(f))
  const db = changedFiles.some((f) => f.includes('priv/repo/migrations/'))
  return { fe, be, gql, db }
}

export async function postCleanupNode(
  state: typeof GraphState.State,
): Promise<Partial<typeof GraphState.State>> {
  console.log('[postCleanup] called')

  const { sandboxPath, techSpecPath } = state

  // Get the list of files changed by the last commit
  const diffResult = await runInSandbox(
    sandboxPath,
    'git diff --name-only HEAD~1 HEAD',
  )
  const changedFiles = diffResult.stdout
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)

  const categories = detectCleanupCategories(changedFiles)

  const prompt = buildPostCleanupPrompt({
    techSpecContent: state.techSpecContent,
    changedFiles,
    categories,
  })

  let lastAgentOutput = ''

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: sandboxPath,
        allowDangerouslySkipPermissions: true,
        maxTurns: 40,
      },
    })) {
      if ('result' in message) {
        lastAgentOutput += message.result + '\n'
      }
    }

    // Re-read the tech spec from disk to get the latest content after agent updates
    const absoluteSpecPath = path.join(sandboxPath, techSpecPath)
    const updatedTechSpecContent = await readFile(absoluteSpecPath, 'utf-8')

    const summaryMessage = new AIMessage(
      `[PostCleanup] Agent finished.\n\nOutput:\n${lastAgentOutput.trim()}`,
    )

    return {
      lastAgentOutput,
      techSpecContent: updatedTechSpecContent,
      messages: [summaryMessage],
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorAIMessage = new AIMessage(
      `[PostCleanup] Agent failed with error: ${errorMessage}`,
    )

    return {
      messages: [errorAIMessage],
      delegationDecision: null,
    }
  }
}
