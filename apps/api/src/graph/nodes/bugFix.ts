import { GraphState } from '../state.js';

export async function bugFixNode(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log('[bugFix] called');
  return {};
}
