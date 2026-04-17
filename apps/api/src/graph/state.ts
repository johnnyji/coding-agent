import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import type { DelegationDecision } from '@coding-agent/shared';

export const GraphState = Annotation.Root({
  // Session identity
  threadId: Annotation<string>,
  userId: Annotation<string>,
  userLogin: Annotation<string>,

  // Target repo
  repoOwner: Annotation<string>,
  repoName: Annotation<string>,
  featureRequest: Annotation<string>,

  // Branch & tech spec
  gitBranch: Annotation<string>,
  techSpecPath: Annotation<string>,
  techSpecContent: Annotation<string>,

  // Sandbox
  sandboxPath: Annotation<string>,
  sandboxDbName: Annotation<string>,
  sandboxRedisPrefix: Annotation<string>,
  sandboxPort: Annotation<number>,

  // Orchestration
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  delegationDecision: Annotation<DelegationDecision | null>,
  userQuestion: Annotation<string | null>,
  iterationCount: Annotation<number>,
  maxIterations: Annotation<number>,
  lastAgentOutput: Annotation<string>,

  // Result
  prUrl: Annotation<string | null>,
});
