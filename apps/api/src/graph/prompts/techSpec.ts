export function buildTechSpecPrompt(params: {
  featureRequest: string
  templateContent: string
  slug: string
}): string {
  const { featureRequest, templateContent, slug } = params
  return `You are a senior software engineer writing a structured tech spec for a feature request.

## Template

The following is the tech spec template you must follow exactly:

<template>
${templateContent}
</template>

## Instructions

1. Read the template above carefully — it defines the exact structure and format your spec must follow.
2. Write a complete tech spec for the following feature request:

   **Feature Request:** ${featureRequest}

3. Save the tech spec to: \`docs/tech_spec/__agents__/${slug}.md\`
   - All paths in the spec must be relative to this repository (not any other directory).
   - Do NOT reference the orchestrator repo — only paths within this cloned repo.

4. After writing the spec file, commit it with the message:
   \`chore: add tech spec for ${featureRequest}\`

## Important Rules

- Follow the template structure exactly (sections, headings, checkboxes, etc.).
- Write concrete, actionable Asks — each one should be a single implementable unit of work.
- If you have questions that would block implementation, add them to the Blocking Questions section.
- Leave the Completed, QA Checklist, and Bugs sections blank for now.
- The base branch for the eventual PR is \`develop\`.
`
}
