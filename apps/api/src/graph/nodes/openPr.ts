import { GraphState } from '../state.js';

export async function openPrNode(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log('[openPr] called');
  return {};
}
