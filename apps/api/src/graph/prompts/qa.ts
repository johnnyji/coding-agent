export function buildQaPrompt(params: {
  techSpecContent: string
  sandboxPort: number
}): string {
  const { techSpecContent, sandboxPort } = params
  return `You are a QA engineer testing a feature using Playwright.

## App URL

The application is running at: http://localhost:${sandboxPort}

## Tech Spec

<tech_spec>
${techSpecContent}
</tech_spec>

## Your Task

1. Read the **QA Checklist** section of the tech spec above.
2. Use the Playwright MCP tools to execute each checklist item against the running app.
3. For each item, navigate to http://localhost:${sandboxPort}, interact with the UI, and verify the expected behavior.
4. **If any bugs are found**: Add them to the **Bugs** section of the tech spec file (use the path shown in the spec). Mark each bug as unresolved:
   \`- [ ] Bug description — steps to reproduce, expected vs actual behavior\`
5. **If all checks pass with no bugs**: Write "All checks passed." in the **QA Checklist** section of the spec.
6. Commit all spec file updates (and only the spec file) with message: \`chore: QA results\`

## Important Notes

- The database reflects the current state of this session. Seed data was applied at session start and may have been modified by previous QA runs. Do not assume emails or unique identifiers are fresh — account for this when writing test steps (e.g. use a unique timestamp or random suffix for user registrations if needed).
- Test both the happy path AND all edge cases listed in the QA Checklist.
- Be thorough — it is better to find and document a bug than to miss one.
- Only commit the tech spec file — do not modify any application source files during QA.
`
}
