import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import pool from './client.js'

let checkpointer: PostgresSaver | null = null

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (!checkpointer) {
    checkpointer = new PostgresSaver(pool)
    await checkpointer.setup()
  }
  return checkpointer
}
