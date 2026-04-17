import { GraphState } from '../state.js';

export async function delegateNode(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log('[delegate] called');
  return {};
}
