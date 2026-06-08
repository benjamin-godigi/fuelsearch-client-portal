Please review this GitHub PR: $ARGUMENTS.

Use a fresh-review mindset. Do not assume the implementation is correct.

# REVIEW STEPS

1. Use `gh pr view` to inspect the PR details.
2. Use `gh pr diff` to inspect the code changes.
3. Read the linked issue and acceptance criteria.
4. Check whether the PR solves the issue without adding unrelated changes.
5. Look for:
   - broken logic
   - security issues
   - auth / permissions mistakes
   - data leaks
   - missing tests
   - fragile code
   - unnecessary complexity
   - accessibility issues
   - UI regressions
   - performance problems
6. If this is a UI change, use Puppeteer via MCP to inspect the UI locally if possible.
7. Run the relevant checks if the project is available locally.
8. Summarize the review.

# OUTPUT FORMAT

Return:

## Verdict
Approve / Request changes / Comment only

## Summary
Short summary of what changed.

## Issues Found
List issues by severity:
- Blocker
- Important
- Nice to have

## Suggested Fixes
Give specific fixes.

## Test Notes
Mention what was tested and what still needs testing.

Remember:
- Use `gh` for GitHub-related tasks.
- Do not merge the PR.
