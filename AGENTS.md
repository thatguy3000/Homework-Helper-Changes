# Repository agent instructions — ACTIVE

The user approved activation of this repository policy. Its routing and delegation rules apply to this repository.

This file is the active `AGENTS.md` policy for this repository, and its instructions apply immediately.

## Objective

Preserve the user's five-hour Codex allowance by using the smallest capable available model. Prioritize correct, complete results while minimizing expensive reasoning, repeated context, unnecessary agents, and redundant checks.

These instructions guide the coding agents working on this repository. They do not change the model used by Homework Helper's in-app tutor.

## GPT-6's role

- Reserve GPT-6 (currently exposed in this environment as `gpt-6-astra`) for planning major changes: clarify requirements, inspect enough context to make architectural decisions, identify risks, and break the work into bounded implementation tasks with acceptance criteria.
- Delegate implementation, routine investigation, tests, fixes, documentation, and detailed code review to suitable smaller models.
- For small requests, skip a heavyweight plan and route promptly to a smaller model. If the active model is already suitable, let it complete the request directly.
- Keep GPT-6 coordination brief. Use worker summaries and validation results to track completion; do not independently repeat every investigation or test.
- GPT-6 must not take over implementation without an explicit user exception. When a worker is blocked, refine the plan or choose a stronger non-GPT-6 worker first.
- A request to implement a major change includes completing the delegated work after planning, unless the user asks for planning only or requires plan approval.

## What counts as a major change

Use GPT-6 planning for changes involving significant architectural choices, multiple interacting features, a broad migration, unclear requirements with substantial consequences, or sensitive changes to authentication, data ownership, storage, or synchronization.

Examples of smaller work: wording or styling edits, a localized bug with a clear cause, focused tests, documentation, or implementing a component against an established design. Judge complexity and risk, not file count alone. A smaller model can plan ordinary work itself.

## Model routing

Use only model identifiers actually supported by the current agent tools. The following are starting preferences based on the models exposed when this draft was written, not guaranteed pricing or quota rankings:

| Work | Preferred starting model |
| --- | --- |
| Rare fallback for very simple, clearly bounded work | `gpt-5.5` |
| Simple edits, routine implementation, modest debugging, component work, focused tests | `gpt-5.6-luna` |
| More involved implementation or debugging across related components | `gpt-5.6-terra` |
| Difficult implementation or review that exceeds the smaller worker's ability | `gpt-5.6-sol` |
| Major architectural planning and decomposition | `gpt-6-astra` |

- GPT-5.5 is the minimum permitted model version. Do not use GPT-5.4 mini or any model below GPT-5.5. Use GPT-5.5 rarely, only for very simple work with a clear reason to choose it; default to GPT-5.6 Luna for small and routine tasks.
- Within these preferences, choose the smallest capable model likely to finish correctly. Skip an obviously inadequate tier when complexity justifies it.
- Use low reasoning effort for clear, routine tasks and medium for moderate complexity. Increase only when the task warrants it and the chosen tool supports it.
- Set the worker model explicitly when supported so it does not accidentally inherit GPT-6. Supply a short, self-contained brief when needed to enable model selection.
- Escalate based on a concrete blocker, a substantive failed approach, or unresolved correctness risk. Pass along findings and failed attempts instead of restarting discovery.
- Do not claim that delegation changes the model running the parent conversation. If the tools cannot support the required routing, explain the limitation and ask for the smallest necessary user action instead of silently doing extensive implementation with GPT-6.

## Delegation and usage discipline

- This policy requests subagent delegation for suitable bounded work, subject to the environment's available tools and higher-priority constraints.
- Prefer one worker for cohesive work. Use parallel workers only for independent tasks when the benefit justifies the additional usage; default to no more than two workers at once.
- Assign each worker a concrete outcome, relevant files, scope boundaries, acceptance criteria, and appropriate validation. Avoid overlapping edits and duplicated assignments.
- Give workers only the context they need. Reuse a worker for closely related follow-ups when practical.
- Ask workers to return a concise account of changes, checks performed, results, and unresolved issues. Use an implementation worker to handle integration and follow-up fixes.
- Do not create separate user-visible Codex tasks unless the user requests them.
- Avoid repeated broad searches, reading entire repositories, verbose plans for simple requests, frequent polling, and duplicate reviews.
- Run checks appropriate to the actual change. Do not rerun successful checks without a new change or unresolved concern. Never skip necessary validation merely to reduce usage.
- If usage information is available and relevant, use it to guide choices. Do not invent remaining allowance, savings percentages, or model quota multipliers. Delegated work may also consume the account's allowance.
- Never purchase credits, redeem a usage reset, or change account settings without explicit authorization.

## Repository context and validation

Homework Helper is a local-first homework planning and tutoring application using React, TypeScript, and vinext / Next.js conventions. Read the current README and relevant code before making assumptions.

- Preserve existing local data, class boundaries, server-side secrets, and the preview-and-accept scheduling behavior.
- Keep changes within the user's requested scope and preserve unrelated work.
- Available validation commands are `npm run lint`, `npm run build`, and `npm test`. The current `npm test` script already runs the production build; avoid a redundant separate build when it adds no evidence.
- Choose relevant checks for code changes. Documentation-only changes generally need a content review, not an application build.

## Communication and future revisions

- Briefly explain the model choice or delegation approach when useful, without narrating every internal step.
- Ask concise questions only when missing information materially affects the outcome. Make reasonable assumptions for routine choices.
- Finish with what changed, what was checked, and any remaining blocker. Be clear when a requested routing choice was unavailable.
- The user may refine this policy over time. Follow explicit task-specific model preferences and update this document when requested. Do not silently broaden GPT-6's role.
