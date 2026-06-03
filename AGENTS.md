# Agent Instructions

## Workflow: Iterative Prototyping

Never do a "waterfall" — never write large amounts of code in a single step.
Follow this cycle for every piece of work:

### Cycle

1. **Plan** — Analyze the task. Define a small, concrete mini-step.
2. **Pick the simplest part** — Start with the easiest piece. Build on solid ground.
3. **Write code** — Implement only that small piece.
4. **Read your own code** — Review what you wrote before running anything.
5. **Verify** — Run the full verification pipeline, in order:
   - `npm run lint`
   - `npm run build`
   - Playwright — open the app and visually inspect the result
   - **Look at how it works** — visual verification is not optional
6. **Fix or commit:**
   - If something is broken → fix it and go back to step 5.
   - If everything works → commit with a conventional commit message.
7. **Repeat** — Pick the next small piece. Improve the prototype toward the final version.

### Key Principles

- **A commit is a reward for working code**, not for written code.
- **Every commit must be a working state** of the application.
- **Verification is the heart of the process** — code that compiles but looks wrong is still broken.
- **Small steps prevent compounding errors** — never build on an unverified foundation.

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

### Format

```plaintext
<type>(scope): <description>
```

### Types

- `feat` — new feature
- `fix` — bug fix
- `style` — visual/CSS changes (not code style)
- `refactor` — code restructuring without behavior change
- `docs` — documentation
- `chore` — tooling, dependencies, config
- `test` — adding or updating tests

## Safety & Communication

- **Never `git add .` or `git add -A`** — always review changed files first (`git status`, `git diff`) and stage only the files relevant to the current task.
- **Be careful and deliberate** — double-check actions before executing them, especially destructive ones.
- **Ask before deleting** — never remove files, components, or significant code without asking the user first.
- **Discuss before acting** — explain what you plan to do and wait for confirmation. Exception: trivial, low-risk changes (e.g., fixing a typo) can proceed without asking.

## Code Hygiene

- **No new dependencies without asking** — never add new npm packages or libraries without the user's approval.
- **Comments are welcome** — add meaningful comments where they help understand the code; avoid obvious or redundant ones.
- **Don't refactor unrelated code** — only touch code that is part of the current task. Don't "improve" or reorganize things that already work.
- **Don't write tests unless asked** — you may suggest writing tests, but don't create them on your own.
- **Read before writing** — always read existing code before modifying it. Understand conventions, patterns, and context first.
- **Don't over-engineer** — do exactly what was asked. Don't add extra features, abstractions, or "improvements" that weren't requested.

## Project Language

- UI language: Polish
- Code (variables, components, comments): English
