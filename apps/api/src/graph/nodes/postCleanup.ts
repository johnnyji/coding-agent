import { GraphState } from '../state.js';

export async function postCleanupNode(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log('[postCleanup] called');
  return {};
}
