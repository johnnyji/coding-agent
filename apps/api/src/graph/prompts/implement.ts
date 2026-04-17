export function buildImplementPrompt(params: {
  techSpecContent: string
  sandboxPath: string
}): string {
  const { techSpecContent, sandboxPath } = params
  return `You are a senior software engineer implementing one section of a tech spec in a cloned repository worktree.

## Working Directory

All file paths are relative to the cloned repository worktree at: ${sandboxPath}
Do NOT reference the orchestrator repo or any paths outside this worktree.

## Instructions for Working with the Tech Spec

1. Read \`docs/tech_spec/__AI_TEMPLATE__.md\` in the cloned repo for detailed instructions on how to work with this spec format.

## Current Tech Spec

The following is the full current tech spec (included here for context caching):

<tech_spec>
${techSpecContent}
</tech_spec>

## Your Task

Implement **exactly one section** of the tech spec:

1. Find the first Feature Section that has one or more unchecked Asks (\`- [ ] ...\`).
2. Implement all the Asks in that section — write the code, tests, and any supporting files.
3. After implementing, update the tech spec file:
   - Check off each completed Ask: change \`- [ ]\` to \`- [x]\`
   - Fill in the **Completed** subsection with a brief narrative of what was done.
   - If you encountered any questions or blockers, add them to the **Blocking Questions** subsection.
4. Commit all changes (code + updated spec) with the message format:
   \`feat(<section-slug>): <one-line description>\`
   where \`<section-slug>\` is a kebab-case slug of the section name and \`<one-line description>\` is a concise summary.

## HARD STOP RULES

- Implement **exactly one section** — no more, no less.
- After committing, **stop immediately**. Do not proceed to other sections.
- Do not run QA, do not open a PR, do not touch any other section.
`
}
