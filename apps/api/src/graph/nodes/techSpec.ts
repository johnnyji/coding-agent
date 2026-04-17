import { readFile } from 'fs/promises'
import path from 'path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { GraphState } from '../state.js'
import { sandboxManager } from '../../sandbox/SandboxManager.js'
import { buildTechSpecPrompt } from '../prompts/techSpec.js'
import pool from '../../db/client.js'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export async function techSpecNode(
  state: typeof GraphState.State,
): Promise<Partial<typeof GraphState.State>> {
  console.log('[techSpec] called')

  const { threadId, repoOwner, repoName, featureRequest } = state

  // Derive branch name
  const slug = slugify(featureRequest)
  const gitBranch = `feature/${slug}`

  // Provision sandbox
  const sandboxInfo = await sandboxManager.create(
    threadId,
    repoOwner,
    repoName,
    gitBranch,
  )

  const { sandboxPath, sandboxDbName, sandboxRedisPrefix, sandboxPort } =
    sandboxInfo

  // Read the tech spec template from the cloned repo
  const templatePath = path.join(
    sandboxPath,
    'docs',
    'tech_spec',
    '__AI_TEMPLATE__.md',
  )
  const templateContent = await readFile(templatePath, 'utf-8')

  // Build prompt
  const prompt = buildTechSpecPrompt({ featureRequest, templateContent, slug })

  // Invoke Claude Code subprocess
  let lastAgentOutput = ''
  for await (const message of query({
    prompt,
    options: {
      cwd: sandboxPath,
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      maxTurns: 30,
    },
  })) {
    if ('result' in message) {
      lastAgentOutput += message.result + '\n'
    }
  }

  // Read the written spec file from disk
  const techSpecPath = `docs/tech_spec/__agents__/${slug}.md`
  const absoluteSpecPath = path.join(sandboxPath, techSpecPath)
  const techSpecContent = await readFile(absoluteSpecPath, 'utf-8')

  // Update orchestrator_sessions status
  await pool.query(
    `UPDATE orchestrator_sessions SET status = 'running', updated_at = NOW() WHERE thread_id = $1`,
    [threadId],
  )

  return {
    gitBranch,
    sandboxPath,
    sandboxDbName,
    sandboxRedisPrefix,
    sandboxPort,
    techSpecPath,
    techSpecContent,
    lastAgentOutput,
  }
}
