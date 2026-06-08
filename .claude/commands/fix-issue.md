Please analyze and fix the GitHub issue: $ARGUMENTS.

Follow these steps:

# 1. PLAN

1. Use `gh issue view` to get the issue details.
2. Understand the problem described in the issue.
3. Ask clarifying questions if necessary.
4. Understand the prior art for this issue:
   - Search the `scratchpads/` folder for previous thoughts related to the issue.
   - Search PRs to see if you can find history on this issue.
   - Search the codebase for relevant files.
5. Think harder about how to break the issue down into a series of small, manageable tasks.
6. Document your plan in a new scratchpad:
   - Include the issue name in the filename.
   - Include a link to the issue in the scratchpad.
   - Include acceptance criteria.
   - Include files likely to change.
   - Include test plan.

Before coding, show me:
- your understanding of the issue
- relevant files you found
- the implementation plan
- the test plan

# 2. CREATE CODE

1. Create a new branch for the issue.
2. Solve the issue in small, manageable steps, according to your plan.
3. Commit your changes after each meaningful step.
4. Keep changes focused on the issue only.
5. Do not make unrelated refactors unless they are required to complete the issue safely.
6. Update the scratchpad as you discover new information.

Branch naming convention:
- `issue-<number>-short-description`

Commit message convention:
- `issue <number>: short description`

# 3. TEST

1. If UI changes were made, use Puppeteer via MCP to test the changes in the browser.
2. Write or update tests to describe the expected behavior of your code.
3. Run the project checks:
   - install/check dependencies if needed
   - lint
   - typecheck
   - unit/integration tests
   - build
4. If tests are failing, fix them.
5. Ensure all tests are passing before moving on to the next step.
6. Add a short test summary to the scratchpad and PR description.

For Vite / React / TypeScript projects, prefer:
- `npm run lint`
- `npm run typecheck` if available
- `npm test` if available
- `npm run build`

For Rails projects, prefer:
- `bundle exec rspec`
- `bin/rails test` if applicable
- `bundle exec rubocop` if available

For Django projects, prefer:
- `python manage.py test`
- `ruff check .` if available
- `python manage.py check`

# 4. DEPLOY / PR

1. Push the branch to GitHub.
2. Open a PR and request review.
3. The PR description must include:
   - issue link
   - summary of changes
   - screenshots if UI changed
   - test results
   - known risks
   - deployment notes
4. Do not merge the PR automatically unless I explicitly ask you to.
5. After the PR is merged, remind me to run `/clear` before starting the next issue.

Remember:
- Use the GitHub CLI (`gh`) for all GitHub-related tasks.
- Work one issue at a time.
- Keep the issue atomic.
- Prefer simple, maintainable code over clever code.
