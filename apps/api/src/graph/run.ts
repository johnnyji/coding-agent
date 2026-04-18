import { EventEmitter } from 'events';
import { Command } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
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

export type ThreadEvent =
  | { type: 'message'; content: string }
  | { type: 'status'; content: string }
  | { type: 'error'; content: string }
  | { type: 'finish'; prUrl: string };

type CompiledGraph = Awaited<ReturnType<typeof buildGraph>>;

let compiledGraph: CompiledGraph | null = null;

async function getCompiledGraph(): Promise<CompiledGraph> {
  if (!compiledGraph) {
    compiledGraph = await buildGraph();
  }
  return compiledGraph;
}

// Per-thread event bus and buffer for streaming
const threadEmitter = new EventEmitter();
threadEmitter.setMaxListeners(0);
const threadBuffers = new Map<string, ThreadEvent[]>();
const MAX_BUFFER_SIZE = 1000;

function emitThreadEvent(threadId: string, event: ThreadEvent): void {
  const buffer = threadBuffers.get(threadId);
  if (buffer) {
    buffer.push(event);
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.shift();
    }
  }
  threadEmitter.emit(threadId, event);
}

function extractEventsFromUpdate(update: Record<string, unknown>): ThreadEvent[] {
  const events: ThreadEvent[] = [];

  for (const [nodeName, nodeOutput] of Object.entries(update)) {
    const output = nodeOutput as Record<string, unknown>;

    events.push({ type: 'status', content: `Processing: ${nodeName}` });

    if (Array.isArray(output?.messages)) {
      for (const msg of output.messages as AIMessage[]) {
        if (
          msg instanceof AIMessage &&
          typeof msg.content === 'string' &&
          msg.content.length > 0
        ) {
          events.push({ type: 'message', content: msg.content });
        }
      }
    }

    if (nodeName === 'openPr' && typeof output?.prUrl === 'string') {
      events.push({ type: 'finish', prUrl: output.prUrl });
    }
  }

  return events;
}

async function runGraphStream(
  threadId: string,
  streamIterable: AsyncIterable<Record<string, unknown>>
): Promise<void> {
  try {
    for await (const update of streamIterable) {
      const events = extractEventsFromUpdate(update);
      for (const event of events) {
        emitThreadEvent(threadId, event);
      }
    }
  } catch (err) {
    emitThreadEvent(threadId, { type: 'error', content: String(err) });
  }
}

export async function startThread(input: StartInput): Promise<string> {
  const { threadId, maxIterations, ...rest } = input;
  const graph = await getCompiledGraph();

  threadBuffers.set(threadId, []);

  const initialState = {
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
  };

  // Fire-and-forget: stream graph events to the event bus
  const stream = graph.stream(initialState, {
    configurable: { thread_id: threadId },
    streamMode: 'updates',
  } as Parameters<typeof graph.stream>[1]) as unknown as AsyncIterable<
    Record<string, unknown>
  >;

  runGraphStream(threadId, stream).catch((err: unknown) =>
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

  // Verify thread exists
  await graph.getState(config);

  // Resume graph in background, streaming events to the bus
  const stream = graph.stream(new Command({ resume: userMessage }), {
    ...config,
    streamMode: 'updates',
  } as Parameters<typeof graph.stream>[1]) as unknown as AsyncIterable<
    Record<string, unknown>
  >;

  runGraphStream(threadId, stream).catch((err: unknown) =>
    console.error(`[graph] resume thread ${threadId} error:`, err)
  );
}

export async function getThreadMessages(threadId: string): Promise<unknown[]> {
  const graph = await getCompiledGraph();
  const state = await graph.getState({ configurable: { thread_id: threadId } });
  const values = state.values as { messages?: unknown[] } | undefined;
  return values?.messages ?? [];
}

/**
 * Subscribe to thread events. Replays buffered events from thread start,
 * then delivers live events as they arrive.
 * Returns an unsubscribe function.
 */
export function subscribeToThread(
  threadId: string,
  onEvent: (event: ThreadEvent) => void
): () => void {
  // Capture current buffer length BEFORE adding the listener.
  // Since JS is single-threaded, no events can sneak in between these two
  // synchronous steps, so the replay + live subscription is gap-free.
  const buffer = threadBuffers.get(threadId) ?? [];
  const snapshotLength = buffer.length;

  // Add live listener first so no events are missed after the snapshot
  threadEmitter.on(threadId, onEvent);

  // Replay historical events (everything before this subscription)
  for (let i = 0; i < snapshotLength; i++) {
    onEvent(buffer[i]);
  }

  return () => threadEmitter.off(threadId, onEvent);
}
