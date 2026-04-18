import { Command } from '@langchain/langgraph';
import { buildGraph } from './graph.js';

export interface StartInput {
  threadId: string;
  userId: string;
  userLogin: string;
  repoOwner: string;
  repoName: string;
  featureRequest: string;
  maxIterations?: number;
}

type CompiledGraph = Awaited<ReturnType<typeof buildGraph>>;

let compiledGraph: CompiledGraph | null = null;

async function getCompiledGraph(): Promise<CompiledGraph> {
  if (!compiledGraph) {
    compiledGraph = await buildGraph();
  }
  return compiledGraph;
}

export async function startThread(input: StartInput): Promise<string> {
  const { threadId, maxIterations, ...rest } = input;
  const graph = await getCompiledGraph();

  // Fire-and-forget: graph runs in the background
  graph
    .invoke(
      {
        threadId,
        ...rest,
        maxIterations: maxIterations ?? 20,
        iterationCount: 0,
        messages: [],
        delegationDecision: null,
        userQuestion: null,
        lastAgentOutput: '',
        prUrl: null,
        gitBranch: '',
        techSpecPath: '',
        techSpecContent: '',
        sandboxPath: '',
        sandboxDbName: '',
        sandboxRedisPrefix: '',
        sandboxPort: 0,
      },
      { configurable: { thread_id: threadId } }
    )
    .catch((err: unknown) =>
      console.error(`[graph] thread ${threadId} error:`, err)
    );

  return threadId;
}

export async function resumeThread(
  threadId: string,
  userMessage: string
): Promise<void> {
  const graph = await getCompiledGraph();
  const config = { configurable: { thread_id: threadId } };

  // Verify the thread exists and is in an interrupted state before resuming
  await graph.getState(config);

  await graph.invoke(new Command({ resume: userMessage }), config);
}
