import { GraphState } from '../state.js';

export async function techSpecNode(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log('[techSpec] called');
  return {};
}
