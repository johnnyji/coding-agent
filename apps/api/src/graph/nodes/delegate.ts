import { readFile } from 'fs/promises'
import path from 'path'
import { ChatAnthropic } from '@langchain/anthropic'
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { GraphState } from '../state.js'
import { buildDelegateSystemPrompt } from '../prompts/delegate.js'

const DelegationSchema = z.object({
  decision: z.enum(['IMPLEMENT', 'BUG_FIX', 'QA', 'ASK_USER_QUESTION', 'FINISH']),
  reasoning: z.string(),
  userQuestion: z.string().optional(),
})

export async function delegateNode(
  state: typeof GraphState.State,
): Promise<Partial<typeof GraphState.State>> {
  console.log('[delegate] called')

  const { threadId, sandboxPath, techSpecPath } = state

  // Re-read the tech spec from disk to get the latest content
  const absoluteSpecPath = path.join(sandboxPath, techSpecPath)
  const techSpecContent = await readFile(absoluteSpecPath, 'utf-8')

  const model = new ChatAnthropic({
    model: 'claude-sonnet-4-6',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })

  const structuredModel = model.withStructuredOutput(DelegationSchema)

  const messages = [
    new SystemMessage(buildDelegateSystemPrompt()),
    new HumanMessage(techSpecContent),
  ]

  const result = await structuredModel.invoke(messages, {
    cache_control: { type: 'ephemeral' },
  } as Parameters<typeof structuredModel.invoke>[1])

  const delegationDecision = result.decision
  const userQuestion = result.userQuestion ?? null

  const summaryMessage = new AIMessage(
    `[Delegation] Decision: ${delegationDecision}\nReasoning: ${result.reasoning}`,
  )

  return {
    techSpecContent,
    delegationDecision,
    userQuestion,
    iterationCount: state.iterationCount + 1,
    messages: [summaryMessage],
  }
}
