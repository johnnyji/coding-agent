export interface CleanupCategories {
  fe: boolean
  be: boolean
  gql: boolean
  db: boolean
}

export function buildPostCleanupPrompt(params: {
  techSpecContent: string
  changedFiles: string[]
  categories: CleanupCategories
}): string {
  const { techSpecContent, changedFiles, categories } = params

  const applicableSteps: string[] = []

  if (categories.fe) {
    applicableSteps.push(
      '1. Run `make fix-js`. If it exits non-zero, read the output, fix the issues, and re-run until it passes.',
    )
  }
  if (categories.be) {
    applicableSteps.push(
      `${applicableSteps.length + 1}. Run \`mix format\`. If it exits non-zero, fix the issues and re-run until it passes.`,
    )
  }
  if (categories.gql) {
    applicableSteps.push(
      `${applicableSteps.length + 1}. Run \`mix dump_graphql_schema\`. If it exits non-zero, fix the issues and re-run until it passes.`,
    )
  }
  if (categories.fe) {
    applicableSteps.push(
      `${applicableSteps.length + 1}. Run \`yarn check-types\`. If it exits non-zero, read the TypeScript errors, fix them, and re-run until it passes.`,
    )
  }

  const dbStep = categories.db
    ? `
**DB migration cleanup** — run the following sequence to restore and re-migrate the test database:
\`\`\`
git restore --source=develop priv/repo/structure.sql
MIX_ENV=test mix ecto.drop
MIX_ENV=test mix ecto.create
MIX_ENV=test mix ecto.load
MIX_ENV=test mix ecto.migrate
MIX_ENV=test mix run priv/repo/seeds.exs
\`\`\`
If any command fails, fix the underlying issue and re-run the full sequence from the top.
`
    : ''

  return `You are a senior software engineer performing post-implementation cleanup in a cloned repository worktree.

## Working Directory

All file paths are relative to the cloned repository worktree.
Do NOT reference the orchestrator repo or any paths outside this worktree.

## Current Tech Spec

<tech_spec>
${techSpecContent}
</tech_spec>

## Files Changed in the Last Commit

The following files were changed by the previous implementation commit:

\`\`\`
${changedFiles.join('\n')}
\`\`\`

## Your Task

Perform the following cleanup steps. Never stop early — run every applicable step before finishing.

### Applicable Cleanup Commands

${applicableSteps.length > 0 ? applicableSteps.join('\n') : '(No language-specific cleanup commands apply to the changed files.)'}

${dbStep}

### Always Required

- Run \`git status\` and inspect any untracked or modified files not currently in \`.gitignore\`.
  If newly generated files (e.g. auto-generated schema dumps, compiled artifacts) appear that should not be committed, add them to \`.gitignore\`.

### Commit Cleanup Changes

After all cleanup commands pass:
1. Run \`git status\`.
2. If there are any uncommitted changes (formatted files, schema dumps, \`.gitignore\` updates, or fixes from the steps above), stage them all and **amend the previous commit** with:
   \`git commit --amend --no-edit\`
   Do NOT create a new commit.

### Update the Tech Spec

After committing (or if there was nothing to commit):
1. Find the most recently implemented section's **Completed** block in the tech spec file.
2. Append a brief note that post-implementation cleanup ran and describe what was fixed or changed (if anything was changed, be specific; if nothing changed, say "No cleanup changes needed.").
3. Do NOT check off Asks or modify any other section.

## Important Rules

- Run every applicable step — do not skip steps.
- Do not create new commits; only amend the existing one if needed.
- Do not touch any code beyond what cleanup commands require.
`
}
