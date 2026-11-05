# kiro-qa-testing

The KIRO quality system: browser tests of the website, POS app and shop (screens, workflows, motion, zoom, 15 screen sizes, accessibility, visual, performance, XSS), unit suites of every repo, security scan, k6 load test, reports.

Part of KIRO (Kitchen Intelligence & Restaurant Operations). Owner: @kirotick. Migrated with full history from `kirotick/KIRO_POS` (commit `252de09`), see kiro-documentation/governance/REPOSITORY_MIGRATION_PLAN.md.

## What this repository owns
- Playwright suites (`tests/`), runners (`scripts/`), load test (`load/`), reports (`reports/`)
- Release acceptance: `npm run qa` must pass before a release tag

Nothing here may be copied into another KIRO repository; other repositories use it by version or through its API.

## Depends on
- Every KIRO repository, checked out side by side (`scripts/workspace.mjs`)

## Build
`npm ci && npx playwright install chromium firefox webkit`.

## Test
Clone the KIRO repositories into one folder, then here: `npm run qa` (everything) or `npm run qa:e2e`, `qa:motion`, `qa:mobile`, `qa:a11y`, `qa:visual`, `qa:perf`, `qa:security`, `qa:load`. See TESTING_GUIDE.md.

## Branches, reviews and releases
`main` is production and protected: changes arrive only by pull request with passing checks (see CONTRIBUTING.md). Versions follow semantic versioning; every release is a git tag `vMAJOR.MINOR.PATCH` with notes in CHANGELOG.md, so each deployment maps to one exact commit. Rollback = redeploy the previous tag.

## Security
See SECURITY.md. Never commit secrets: `.env` files are ignored, and secret scanning with push protection plus gitleaks in CI block them.
