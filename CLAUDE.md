# Project AI Workflow Rules

Use this file as the standing instruction set for Claude Code / Codex when working in this repository.

## Core Workflow

Work through GitHub issues using:

1. Plan
2. Create code
3. Test
4. Open PR
5. Review
6. Merge only when approved
7. Clear context before next issue

## Rules

- Use GitHub CLI (`gh`) for GitHub-related tasks.
- Work one issue at a time.
- Never commit secrets, API keys, service-role keys, or passwords.
- Never make unrelated changes.
- Prefer small, atomic commits.
- Keep changes readable and maintainable.
- Update or create tests when behavior changes.
- Run the project checks before opening a PR.
- Do not merge without explicit approval from Benjamin.

## Scratchpads

Use the `scratchpads/` folder for planning.

Each issue should get a scratchpad named:

```text
scratchpads/issue-<number>-short-title.md
```

Each scratchpad should include:

- Issue link
- Problem summary
- Relevant files
- Prior art / related PRs
- Implementation plan
- Testing plan
- Notes discovered during implementation
- Final test results

## Suggested Commands

For a Vite / React / TypeScript app:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Not every project has every script. If a script is missing, report it and use the closest available check.

## Security Notes

For apps using Supabase, Firebase, Clerk, Auth.js, Stripe, or similar:

- Check Row Level Security / permission boundaries.
- Do not expose service-role keys on the client.
- Test both allowed and blocked user actions.
- Confirm environment variables are documented but not committed.
