import { GraphState } from '../state.js';

export async function implementNode(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log('[implement] called');
  return {};
}
