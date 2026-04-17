import { readFile } from 'fs/promises'
import path from 'path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { AIMessage } from '@langchain/core/messages'
import { GraphState } from '../state.js'
import { buildImplementPrompt } from '../prompts/implement.js'

export async function implementNode(
  state: typeof GraphState.State,
): Promise<Partial<typeof GraphState.State>> {
  console.log('[implement] called')

  const { techSpecContent, sandboxPath, techSpecPath } = state

  const prompt = buildImplementPrompt({ techSpecContent, sandboxPath })

  let lastAgentOutput = ''

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: sandboxPath,
        allowDangerouslySkipPermissions: true,
        maxTurns: 80,
      },
    })) {
      if ('result' in message) {
        lastAgentOutput += message.result + '\n'
      }
    }

    // Re-read the tech spec from disk to get the latest content after agent changes
    const absoluteSpecPath = path.join(sandboxPath, techSpecPath)
    const updatedTechSpecContent = await readFile(absoluteSpecPath, 'utf-8')

    const summaryMessage = new AIMessage(
      `[Implement] Agent finished.\n\nOutput:\n${lastAgentOutput.trim()}`,
    )

    return {
      lastAgentOutput,
      techSpecContent: updatedTechSpecContent,
      messages: [summaryMessage],
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorAIMessage = new AIMessage(
      `[Implement] Agent failed with error: ${errorMessage}`,
    )

    return {
      messages: [errorAIMessage],
      delegationDecision: null,
    }
  }
}
