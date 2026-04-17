import { GraphState } from './state.js';

export function routeFromDelegate(state: typeof GraphState.State): string {
  // Safety escape hatch: max iterations reached, go straight to PR
  if (state.iterationCount >= state.maxIterations) {
    return 'openPr';
  }

  switch (state.delegationDecision) {
    case 'IMPLEMENT':
      return 'implement';
    case 'BUG_FIX':
      return 'bugFix';
    case 'QA':
      return 'qa';
    case 'ASK_USER_QUESTION':
      return 'askUser';
    case 'FINISH':
      return 'openPr';
    default:
      throw new Error(
        `[router] Invalid delegation decision: ${String(state.delegationDecision)}`
      );
  }
}
