import { GraphState } from '../state.js';

export async function qaNode(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log('[qa] called');
  return {};
}
