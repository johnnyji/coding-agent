export function buildBugFixPrompt(params: {
  techSpecContent: string
}): string {
  const { techSpecContent } = params
  return `You are a senior software engineer fixing bugs found during QA in a cloned repository worktree.

## Working Directory

All file paths are relative to the cloned repository worktree.
Do NOT reference the orchestrator repo or any paths outside this worktree.

## Current Tech Spec

The following is the full current tech spec (included here for context caching):

<tech_spec>
${techSpecContent}
</tech_spec>

## Your Task

Fix the bugs listed in the **Bugs** section of the tech spec:

1. Read the **Bugs** section and identify all unresolved bugs.
2. Fix each bug — update the relevant code, tests, and any supporting files.
3. After fixing, update the tech spec file:
   - Mark each resolved bug as fixed (e.g., append \`(resolved)\` or similar notation).
   - Update the **Bugs** section to reflect which bugs have been addressed.
4. Commit all changes (code + updated spec) with the message format:
   \`fix: <description>\`
   where \`<description>\` is a concise summary of the bugs fixed.

## Important Rules

- All paths are relative to the cloned repo worktree.
- Only fix bugs listed in the **Bugs** section — do not add new features.
- After committing, stop. Do not run QA or make further changes.
`
}
