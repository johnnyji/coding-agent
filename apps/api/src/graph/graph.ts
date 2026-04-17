import { StateGraph, START, END } from '@langchain/langgraph';
import { GraphState } from './state.js';
import { techSpecNode } from './nodes/techSpec.js';
import { delegateNode } from './nodes/delegate.js';
import { implementNode } from './nodes/implement.js';
import { bugFixNode } from './nodes/bugFix.js';
import { postCleanupNode } from './nodes/postCleanup.js';
import { qaNode } from './nodes/qa.js';
import { askUserNode } from './nodes/askUser.js';
import { openPrNode } from './nodes/openPr.js';
import { routeFromDelegate } from './router.js';
import { getCheckpointer } from '../db/checkpointer.js';

export async function buildGraph() {
  const checkpointer = await getCheckpointer();

  const graph = new StateGraph(GraphState)
    .addNode('techSpec', techSpecNode)
    .addNode('delegate', delegateNode)
    .addNode('implement', implementNode)
    .addNode('bugFix', bugFixNode)
    .addNode('postCleanup', postCleanupNode)
    .addNode('qa', qaNode)
    .addNode('askUser', askUserNode)
    .addNode('openPr', openPrNode)
    .addEdge(START, 'techSpec')
    .addEdge('techSpec', 'delegate')
    .addConditionalEdges('delegate', routeFromDelegate)
    .addEdge('implement', 'postCleanup')
    .addEdge('bugFix', 'postCleanup')
    .addEdge('postCleanup', 'delegate')
    .addEdge('qa', 'delegate')
    .addEdge('askUser', 'delegate')
    .addEdge('openPr', END);

  return graph.compile({ checkpointer });
}
