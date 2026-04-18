import { interrupt } from '@langchain/langgraph';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { GraphState } from '../state.js';
import pool from '../../db/client.js';

export async function askUserNode(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log('[askUser] called');

  const { threadId, userQuestion } = state;

  if (!userQuestion) {
    throw new Error('[askUser] called but userQuestion is null');
  }

  // Update session status to 'waiting' so the API can surface this to the UI
  await pool.query(
    `UPDATE orchestrator_sessions SET status = 'waiting', updated_at = NOW() WHERE thread_id = $1`,
    [threadId]
  );

  // Suspend the graph. On first call this throws (LangGraph catches it and checkpoints state).
  // On second call (after resumeThread), this returns the engineer's answer.
  const answer = interrupt(userQuestion) as string;

  // Only reached on resume ─────────────────────────────────────────────────────

  // Flip session back to 'running'
  await pool.query(
    `UPDATE orchestrator_sessions SET status = 'running', updated_at = NOW() WHERE thread_id = $1`,
    [threadId]
  );

  return {
    messages: [
      new AIMessage(userQuestion),   // question surfaced in chat history
      new HumanMessage(answer),      // engineer's reply
    ],
    userQuestion: null,
    delegationDecision: null,
  };
}
