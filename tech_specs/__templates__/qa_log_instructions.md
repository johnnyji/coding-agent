# QA Log Instructions for AI Agents

> IMPORTANT: If you are a QA agent, read this entire file before doing anything else.

This file is instructions for how to keep a running log of all QA sessions for this feature in a `qa_log.md` file`. Each session is dated. Bugs are logged here and checked off in-place when fixed — never deleted, so the full history is preserved.

## How to run a QA session and interact with `qa_log.md`

1. Read `tech_specs/__templates__/playwright_qa_setup.md` **before touching Playwright**. It documents the required setup steps and past mistakes to avoid. Do not skip this step
2. Re-read the feature's `tech_spec.md` from top to bottom to understand what was built.
3. Scan `qa_log.md` file for any `OPEN` bugs from previous sessions — you must re-QA those as part of every new session.
4. Derive a set of test steps: cover the happy path described in "What are we building?", then edge cases and error states.
5. Append a new session block (see format below) to the **bottom** of `qa_log.md`.
6. Use the Playwright MCP to execute each step. Check off steps as you complete them.
7. For every bug found, add an entry under **Bugs Found** in the current session block marked `OPEN`.
8. If an `OPEN` bug from a **previous** session is now fixed, check it off and add a **Fixed** note to that earlier entry — do not move or copy it into the new session.
9. After QA finishes, commit only this file (and any spec updates): `chore(qa): <date> QA session`.

## Session block format

Append one block per session. Do not edit or reformat previous blocks.

```markdown
---

## YYYY-MM-DD

### Steps Taken

- [x] Happy path: <what was tested and what the expected outcome was>
- [x] Edge case: <description and outcome>
- [ ] <step that failed or was skipped — leave unchecked and add a note inline explaining why>

### Bugs Found

- [ ] **Bug N** — <short title> `OPEN`
  - **Found:** <which step surfaced this, and what the actual vs. expected behaviour was>

- [x] **Bug N** — <short title> `FIXED`
  - **Found:** <which step surfaced this>
  - **Fixed:** <brief description of the fix applied>
```

If no bugs were found in a session, write:

```markdown
### Bugs Found

No bugs found.
```