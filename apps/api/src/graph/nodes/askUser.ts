import { GraphState } from '../state.js';

export async function askUserNode(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  console.log('[askUser] called');
  return {};
}
