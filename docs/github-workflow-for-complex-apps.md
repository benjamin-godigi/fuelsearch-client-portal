# GitHub Workflow for Complex Apps

This workflow is designed for building complex apps with Claude Code, Codex, or another AI coding assistant.

The goal is to stop asking the AI to “just build the app” and instead manage the work like a proper software project.

## The Four Phases

1. Plan
2. Create code
3. Test
4. Deploy / PR

## 1. Plan

Start with a detailed GitHub issue.

The AI assistant should:

- read the issue with `gh issue view`
- understand the current problem
- ask clarifying questions when needed
- search previous scratchpads
- search previous PRs
- search the codebase
- break the work into small tasks
- write the plan into a scratchpad

The planning step is the most important step. Better planning usually means fewer broken changes.

## 2. Create Code

The AI assistant should:

- create a new branch for the issue
- implement the issue in small steps
- commit after each meaningful step
- avoid unrelated changes
- keep the scratchpad updated

## 3. Test

The AI assistant should:

- write or update tests
- run linting
- run type checks
- run the full test suite
- run the build
- use Puppeteer MCP for UI changes
- fix failures before opening a PR

## 4. Deploy / PR

The AI assistant should:

- push the branch
- open a PR
- include a clear PR description
- include screenshots for UI work
- include test results
- request review
- wait for approval before merge

## After Merge

After a PR is merged:

```text
/clear
```

This clears the context window so the next issue starts fresh.

## Recommended Repository Structure

```text
.claude/
  commands/
    fix-issue.md
    review-pr.md

.github/
  ISSUE_TEMPLATE/
    complex-app-task.md
  workflows/
    ci.yml
  pull_request_template.md

scratchpads/
  README.md

CLAUDE.md
```

## Daily Usage

```bash
# Start work on an issue in Claude Code
/fix-issue 12

# Review a PR in a separate/fresh session
/review-pr 18
```

## Best Practices

- Keep issues small.
- Give every issue acceptance criteria.
- Use one branch per issue.
- Open one PR per issue.
- Run tests before review.
- Never merge unreviewed AI code.
- Clear context after every merged PR.
