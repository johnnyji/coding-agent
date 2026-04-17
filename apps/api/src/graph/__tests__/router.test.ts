import { describe, it, expect } from 'vitest';
import { routeFromDelegate } from '../router.js';
import type { GraphState } from '../state.js';

type PartialState = Pick<
  typeof GraphState.State,
  'iterationCount' | 'maxIterations' | 'delegationDecision'
>;

function makeState(overrides: PartialState): typeof GraphState.State {
  return overrides as typeof GraphState.State;
}

const base: PartialState = { iterationCount: 0, maxIterations: 20, delegationDecision: null };

describe('routeFromDelegate', () => {
  it('routes IMPLEMENT to implement', () => {
    expect(routeFromDelegate(makeState({ ...base, delegationDecision: 'IMPLEMENT' }))).toBe('implement');
  });

  it('routes BUG_FIX to bugFix', () => {
    expect(routeFromDelegate(makeState({ ...base, delegationDecision: 'BUG_FIX' }))).toBe('bugFix');
  });

  it('routes QA to qa', () => {
    expect(routeFromDelegate(makeState({ ...base, delegationDecision: 'QA' }))).toBe('qa');
  });

  it('routes ASK_USER_QUESTION to askUser', () => {
    expect(routeFromDelegate(makeState({ ...base, delegationDecision: 'ASK_USER_QUESTION' }))).toBe('askUser');
  });

  it('routes FINISH to openPr', () => {
    expect(routeFromDelegate(makeState({ ...base, delegationDecision: 'FINISH' }))).toBe('openPr');
  });

  it('routes to openPr when iterationCount equals maxIterations (escape hatch)', () => {
    expect(
      routeFromDelegate(makeState({ iterationCount: 20, maxIterations: 20, delegationDecision: 'IMPLEMENT' }))
    ).toBe('openPr');
  });

  it('routes to openPr when iterationCount exceeds maxIterations (escape hatch)', () => {
    expect(
      routeFromDelegate(makeState({ iterationCount: 25, maxIterations: 20, delegationDecision: 'BUG_FIX' }))
    ).toBe('openPr');
  });

  it('throws when decision is null and maxIterations not reached', () => {
    expect(() =>
      routeFromDelegate(makeState({ ...base, delegationDecision: null }))
    ).toThrow();
  });
});
