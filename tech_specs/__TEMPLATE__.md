# Feature Tech Spec for AI Agents

This is a guide on how to write a tech spec for AI agents to be able to iterate on a feature that is broken down over many sessions.

**If you are a tech spec writer AI agent:**
- You are a tech architect tasked with writing a tech spec based on the user's request
- Read this guide on how to write a proper tech spec for AI agents to code on
- Write the initial tech spec, put it in `/tech_specs/__agents__` and reference back to this document so the AI agent knows how to implement against this style of tech spec

**If you are a coding/implementation AI agent:**
- You are a senior engineer tasked with working on 1 section of this tech spec
- Read the "What are we building?" section to understand the feature at a high level
- Scan section headers + Completed lists to find the **first section with incomplete Asks** — that is your section
- Read the Completed and resolved Blocking Questions from all previous sections to determine if you need to make changes to Asks before you begin
- Do NOT explore the codebase broadly upfront. Read only the files you think are needed to fulfill the current section's Asks.
- You may check git history or read prior code if you need more context on previous section Completed and resolved Blocking Questions
- **HARD STOP RULE: You may only work on ONE section per invocation. After finishing a section's Asks and Post Changes Checklist, you MUST edit this spec file directly (Completed + Blocking Questions), report to the user, and stop — even if the next section looks small or related. Do not proceed to the next section under any circumstances.**

A spec should cover:

1. A "What are we building?" section
2. A breakdown of the changes we need to make (separated by natural git commit breakpoints)

## Instructions

This section should be copy and pasted to every tech spec written and show contain the following:

> IMPORTANT: If you are an implementor agent, first read `tech_specs/__AI_TEMPLATE__.md` and fully understand how to work with this tech spec before doing anything else.

## What are we building?

Describe the functionality we're trying to achieve, and roughly outline all the changes we'll need to make to get there. Some rules:

- Think like a product manager
- Describe the user flow
- Avoid verbose code examples

## Feature Sections

### Section Name (same as git commit name)

If a feature is large enough to warrant multiple commits/sections of work, it will need to be iterated over by many agents, here you will divide the work up into logic chunks of changes. Some rules:

- 1 section = 1 git commit
- Order the sections chronologically based on dependancy
- Group contextually related changes together
- Keep your chunks small and easy to review

Each section should have the following:

#### Asks

A list of TODO tasks that must be done in this section. This is initially filled out when creating the tech spec. For any backend changes, remind the AI agent to write tests

How AI agents interact with Asks:

1. First review the Completed and Blocking Questions of all previous sections to determine if this section's Asks need to be updated. You can also check git history or read more code if you feel you need more context.
2. If the AI agent determines the Asks need to be updated, it will prompt the user with a set of suggested updates and explain why.
3. Once the Asks are fully updated, it will begin to execute on them.
4. After all Asks in this section are done, it  **must edit the spec file directly** to check off the Post Changes Checklist, fill in Completed, and write Blocking Questions — then stop and report to the user. Do not just describe what you did in your reply; the spec file itself must be updated. It will not continue to the next section.

#### Post Changes Checklist

A checklist of tasks to go through each time an AI agent finishes working on a section. This is always copied to the tech spec as/is:

1. If any GQL schema changes, run `mix dump_graphql_schema`, otherwise just check this item completed
1. Run `mix format` (fix any warning/errors if they appear)
2. Run `make fix-js` (fix any errors if they appear)
3. Run `yarn check-types` (diagnose and fix type issues caused by changes)
4. Run `yarn test` (diagnose and fix cause of failing tests)
5. Run `MIX_ENV=test mix test.full ...` for all new tests added and any related tests that could have been affected. You may need to run this many times if there are multiple test files affected (diagnose and fix cause of failing tests)

#### Completed

A list of actually completed tasks. This will always be blank to start.

How AI agents interact with Completed:

1. As an AI agent finishes a task in Ask, it will fill it in here in Completed
2. If the work the AI agent did was the same as the Ask, it will mirror the Ask here
3. If the work the AI agent did differed, it will write the original ask here, and then note down what differed and why

#### Blocking Questions

Any questions that requires user input that blocks the AI from continuing this ection is recorded here. This will always be blank to start.

How AI agents interact with Blocking Questions:

1. As an AI agent comes across a blocking question in Asks, it will note the Ask item that is blocked, the progress it made so far, and write a description of why its blocked and what input it needs from the user to continue.
2. The AI will also write a few suggested routes for the user and select its recommendation
3. The AI will then stop all work until the user has resolved the question in the tech spec
4. When the AI picks up the tech spec again, it will scan for resolved questions, and rework Asks to note the user's preference before continuing

If there are no blocking questions, the AI agent should still just write "No blocking questions" to indicate clearly to the user that it has thought about it.

## QA Checklist

A manual QA checklist for an AI agent to use the Playwright MCP to go through the app to verify everything works. Leave this blank to start.

How AI agents interact with QA Checklist:

1. The agent reads the entire tech spec again to understand the full functionality
2. The agent comes up with a list of happy path and edge case scenarios based on the implementation. It also re-QAs any Bugs found and fixed from previous QA sections
3. The agent runs the Playwright MCP to do the QA
4. The agent notes down bugs in the Bugs section

## Bugs

A list of bugs that found during QA.


