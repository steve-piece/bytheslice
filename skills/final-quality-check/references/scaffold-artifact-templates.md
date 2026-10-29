<!-- skills/final-quality-check/references/scaffold-artifact-templates.md -->
<!-- Canonical file templates for every artifact final-quality-check writes: husky pre-push, PR template, ci.yml, e2e.yml, e2e-coverage.yml, design-system-compliance.yml, db-schema-drift.yml, regex sweep script, eslint config additions, stylelint config, branch-protection script, and Playwright specs, plus the lean-tier variants at the end. Lift verbatim and adjust paths for the detected stack. -->

# CI/CD Scaffold Artifact Templates

Lift these verbatim into the repo, adjusting only:
- Package manager (`pnpm` → `npm` / `yarn` / `bun` if detected).
- App paths (`apps/web` → detected app dir).
- Node version (default 20, override if repo specifies).

All templates assume a Turborepo-style monorepo with `apps/**` and `packages/**`. For single-app repos, drop the `apps/**` prefix.

---

## `.husky/pre-push`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Slice tier (gate tier 2): lint, typecheck, unit tests, build, and DB tests only
# when this push touches the schema or migrations. The full suite (@feature,
# @regression-core, @visual, audit, db-schema-drift, design-system-compliance)
# runs once in CI at the PR (gate tier 4).
# --no-verify is never the answer: a red hook is fixed, not skipped.
set -e

pnpm lint
pnpm typecheck
pnpm test
pnpm build

BASE=$(git merge-base HEAD origin/main 2>/dev/null || true)
if [ -n "$BASE" ] && git diff --name-only "$BASE" HEAD | grep -Eq '(^|/)(migrations|supabase/migrations|prisma|drizzle)/|(^|/)schema\.(sql|prisma|ts)$'; then
  pnpm run --if-present test:db
fi
```

Make executable: `chmod +x .husky/pre-push`.

This hook is the **slice tier**, not the full CI chain: it runs on every task push inside the delivery loop, so it stays cheap. Adjust the schema/migration path pattern to the detected DB tooling, and swap `pnpm` for the detected package manager (`npm run --if-present` works the same; for yarn use a `test:db` guard). Never add the e2e suites or `check:design-system` here: those are CI's (tier 4) and `slice-verifier`'s (tier 3).

---

## `.github/pull_request_template.md`

```markdown
## Changes

[description]

## CI/CD checklist

- [ ] E2E test added or updated for every changed behavior
- [ ] `@regression-core` suite green (CI runs it at the PR)
- [ ] `@visual` baselines reviewed (approve or update before merge)
- [ ] No design-system-compliance violations (`pnpm check:design-system` green)
- [ ] No existing CI workflow jobs removed or weakened
- [ ] Husky `pre-push` hook ran green locally
- [ ] If any DB code touched: `db/schema.sql` (or equivalent declarative schema) updated first
```

---

## `.github/workflows/ci.yml`

Job order: typecheck → lint → design-system-compliance → unit-tests → integration-tests → @feature E2E → @regression-core E2E → @visual E2E → db-schema-drift (conditional) → build.

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  typecheck:
    name: typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  lint:
    name: lint
    needs: typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  design-system-compliance:
    name: design-system-compliance
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Regex sweep on changed files
        run: bash scripts/check-design-system-tokens.sh
      - name: ESLint token-aware check
        run: pnpm exec eslint --config .eslintrc.design-system.json --ext .ts,.tsx $(git diff --name-only origin/main...HEAD | grep -E '\.(ts|tsx)$' | tr '\n' ' ') || true
      - name: Stylelint CSS check
        run: pnpm exec stylelint "**/*.css" --config .stylelintrc.json

  unit-tests:
    name: unit-tests
    needs: design-system-compliance
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  integration-tests:
    name: integration-tests
    needs: unit-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:integration

  build:
    name: build
    needs:
      - unit-tests
      - integration-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

---

## `.github/workflows/design-system-compliance.yml`

Standalone workflow for design-system checks. Can be invoked independently of the main CI run.

```yaml
name: Design System Compliance

on:
  pull_request:
    branches: [main]
    paths:
      - '**.ts'
      - '**.tsx'
      - '**.css'

concurrency:
  group: design-system-${{ github.ref }}
  cancel-in-progress: true

jobs:
  compliance:
    name: design-system-compliance
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Regex sweep: token violations in changed files
        run: bash scripts/check-design-system-tokens.sh

      - name: ESLint: token-aware Tailwind check
        run: |
          CHANGED=$(git diff --name-only origin/main...HEAD | grep -E '\.(ts|tsx)$' | tr '\n' ' ')
          if [ -n "$CHANGED" ]; then
            pnpm exec eslint --config .eslintrc.design-system.json --ext .ts,.tsx $CHANGED
          else
            echo "No TS/TSX files changed: skipping ESLint step."
          fi

      - name: Stylelint: CSS file checks
        run: pnpm exec stylelint "**/*.css" --config .stylelintrc.json
```

---

## `scripts/check-design-system-tokens.sh`

Regex sweep script. Run locally via `pnpm check:design-system` or in CI. Scans changed files (PR context) or all product files (local). Fails with line-level violations on any token escape.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Determine files to scan
if [ -n "${GITHUB_BASE_REF:-}" ]; then
  # CI: only changed files in the PR
  FILES=$(git diff --name-only "origin/$GITHUB_BASE_REF"...HEAD | grep -E '\.(ts|tsx|css)$' || true)
else
  # Local: all product source files
  FILES=$(find apps packages src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) 2>/dev/null || true)
fi

if [ -z "$FILES" ]; then
  echo "No files to scan."
  exit 0
fi

VIOLATIONS=0

# Patterns that indicate a design-system escape
# 1. Hex/rgb/hsl/oklch literals in className or style props
# 2. Raw Tailwind color utilities (bg-red-X, text-blue-X, border-green-X, etc.)
# 3. Inline style={{ }} objects with hardcoded color / font / spacing values
# 4. New .css files created outside globals.css

COLOR_PATTERN='(className|style)=["\x27][^"]*?(#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(|hsla\(|oklch\()'
RAW_TW_PATTERN='(bg|text|border|ring|fill|stroke|shadow|outline|decoration|caret|accent|from|to|via)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)-[0-9]+'
INLINE_STYLE_PATTERN='style=\{\{[^}]*(color|background|fontFamily|font-family|fontSize|padding|margin):[^}]*["\x27][^"]+["\x27]'

echo "Scanning ${#FILES[@]} files for design-system violations..."

while IFS= read -r file; do
  [ -z "$file" ] && continue
  [ ! -f "$file" ] && continue

  # Check for hex/rgb/hsl/oklch literals in classNames or style
  if grep -PnH "$COLOR_PATTERN" "$file" 2>/dev/null; then
    echo "::error file=$file::Hardcoded color literal in className or style. Use a design token instead."
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Check for raw Tailwind color utilities
  if grep -PnH "$RAW_TW_PATTERN" "$file" 2>/dev/null; then
    echo "::error file=$file::Raw Tailwind color utility detected. Map to a token-backed semantic class."
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Check for inline style with hardcoded values
  if grep -PnH "$INLINE_STYLE_PATTERN" "$file" 2>/dev/null; then
    echo "::error file=$file::Inline style with hardcoded value. Use a CSS variable or Tailwind token class."
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Check for new .css files outside globals.css
  if [[ "$file" == *.css ]] && [[ "$file" != *globals.css ]]; then
    echo "::error file=$file::New CSS file outside globals.css. Add tokens to globals.css instead."
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done <<< "$FILES"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "Design-system compliance failed with $VIOLATIONS violation(s)."
  echo "Fix all violations before pushing. See docs/design-system.md for the token catalog."
  exit 1
fi

echo "Design-system compliance check passed."
```

Make executable: `chmod +x scripts/check-design-system-tokens.sh`.

---

## `.eslintrc.design-system.json`

ESLint config additions for token-aware linting. Add `eslint-plugin-tailwindcss` to devDependencies first.

```json
{
  "extends": ["./.eslintrc.json"],
  "plugins": ["tailwindcss"],
  "rules": {
    "tailwindcss/no-custom-classname": "error",
    "tailwindcss/classnames-order": "warn",
    "tailwindcss/no-contradicting-classname": "error",
    "tailwindcss/enforces-negative-arbitrary-values": "error",
    "tailwindcss/enforces-shorthand": "warn",
    "no-restricted-syntax": [
      "error",
      {
        "selector": "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression > Property[key.name=/color|background|fontFamily|fontSize/]",
        "message": "Inline style with hardcoded color/font value. Use a design token or Tailwind class instead."
      }
    ]
  },
  "settings": {
    "tailwindcss": {
      "config": "./tailwind.config.ts",
      "callees": ["cn", "clsx", "cva", "tv"]
    }
  }
}
```

To install the plugin:

```bash
pnpm add -D eslint-plugin-tailwindcss
```

---

## `.stylelintrc.json`

Stylelint configuration for CSS file token compliance.

```json
{
  "extends": ["stylelint-config-standard"],
  "plugins": ["stylelint-value-no-unknown"],
  "rules": {
    "color-no-invalid-hex": true,
    "color-named": "never",
    "color-no-hex": [true, {
      "message": "Use a CSS custom property (design token) instead of a hardcoded hex value."
    }],
    "declaration-property-value-no-unknown": true,
    "function-no-unknown": [true, {
      "ignoreFunctions": ["theme", "oklch", "var", "calc", "env"]
    }],
    "custom-property-pattern": "^(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?$",
    "rule-selector-property-disallowed-list": {
      ":root": ["font-family", "font-size", "color", "background-color"],
      "message": "Set typography and color via design tokens, not naked :root properties."
    }
  }
}
```

To install stylelint:

```bash
pnpm add -D stylelint stylelint-config-standard
```

---

## `package.json` Script Additions

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:feature": "playwright test --project=feature",
    "test:e2e:regression": "playwright test --project=regression-core",
    "test:e2e:visual": "playwright test --project=visual",
    "check:design-system": "bash scripts/check-design-system-tokens.sh"
  }
}
```

---

## `.github/workflows/e2e.yml`

```yaml
name: E2E

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  feature:
    name: feature
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e:feature
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-feature
          path: playwright-report/
          retention-days: 7

  regression-core:
    name: regression-core
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e:regression
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-regression
          path: playwright-report/
          retention-days: 7

  visual:
    name: visual
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - name: Run visual tests (Vizzly)
        run: pnpm test:e2e:visual
      - name: Upload visual diff report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: visual-diff-report
          path: tests/visual/diffs/
          retention-days: 14
      - name: Fail if unreviewed visual diffs detected
        run: |
          if ls tests/visual/diffs/*.png 2>/dev/null | head -1 | grep -q .; then
            echo "::error::Unreviewed visual diffs detected. Review and approve or update baselines before merge."
            exit 1
          fi
          echo "No unreviewed visual diffs. Visual check passed."
```

---

## `.github/workflows/e2e-coverage.yml`

```yaml
name: E2E

on:
  pull_request:
    branches: [main]

jobs:
  coverage-check:
    name: coverage-check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Detect changed product files
        id: changed
        run: |
          BASE=${{ github.event.pull_request.base.sha }}
          HEAD=${{ github.event.pull_request.head.sha }}
          CHANGED=$(git diff --name-only "$BASE" "$HEAD")
          PRODUCT=$(echo "$CHANGED" | grep -E '^(apps|packages)/' | grep -vE '\.(md|css|png|jpg|jpeg|gif|svg|webp|woff2?|ttf)$' | grep -vE '\.json$' || true)
          TESTS=$(echo "$CHANGED" | grep -E '\.(spec|e2e)\.ts$' || true)
          VISUAL_DIFFS=$(find tests/visual/diffs -name '*.png' 2>/dev/null | head -1 || true)

          echo "product<<EOF" >> $GITHUB_OUTPUT
          echo "$PRODUCT" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

          echo "tests<<EOF" >> $GITHUB_OUTPUT
          echo "$TESTS" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

          echo "visual_diffs=$VISUAL_DIFFS" >> $GITHUB_OUTPUT

      - name: Enforce E2E coverage
        run: |
          if [ -n "${{ steps.changed.outputs.product }}" ] && [ -z "${{ steps.changed.outputs.tests }}" ]; then
            echo "::error::Product files changed without any *.spec.ts or *.e2e.ts changes."
            echo "Changed product files:"
            echo "${{ steps.changed.outputs.product }}"
            exit 1
          fi
          echo "E2E coverage check passed."

      - name: Block on unreviewed visual diffs
        run: |
          if [ -n "${{ steps.changed.outputs.visual_diffs }}" ]; then
            echo "::error::Unreviewed visual diffs present in tests/visual/diffs/. Review, approve, or update baselines before merging."
            exit 1
          fi
          echo "No unreviewed visual diffs."
```

---

## `.github/workflows/db-schema-drift.yml`

**Conditional: add ONLY if project has a database (Supabase, Prisma, Drizzle, or equivalent).**

Rule: any feature stage that touches DB code must update `db/schema.sql` (or equivalent declarative schema source) FIRST. This job enforces that rule by comparing the declarative schema against what migrations would produce.

```yaml
name: DB Schema Drift

on:
  pull_request:
    branches: [main]
    paths:
      - 'db/**'
      - 'supabase/**'
      - 'prisma/**'
      - 'apps/**/db/**'

jobs:
  drift-check:
    name: db-schema-drift
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # --- Supabase variant ---
      # Uncomment if using Supabase:
      # - uses: supabase/setup-cli@v1
      #   with:
      #     version: latest
      # - name: Check schema drift (Supabase)
      #   run: |
      #     supabase db diff --schema public | tee /tmp/drift.sql
      #     if [ -s /tmp/drift.sql ]; then
      #       echo "::error::Schema drift detected. Run 'supabase db diff' locally, update db/schema.sql, and commit before pushing."
      #       cat /tmp/drift.sql
      #       exit 1
      #     fi
      #     echo "No schema drift detected."

      # --- Prisma variant ---
      # Uncomment if using Prisma:
      # - uses: pnpm/action-setup@v3
      # - uses: actions/setup-node@v4
      #   with:
      #     node-version: 20
      #     cache: pnpm
      # - run: pnpm install --frozen-lockfile
      # - name: Check schema drift (Prisma)
      #   run: |
      #     DIFF=$(pnpm exec prisma migrate diff \
      #       --from-migrations ./prisma/migrations \
      #       --to-schema-datamodel ./prisma/schema.prisma \
      #       --script 2>&1 || true)
      #     if [ -n "$DIFF" ]; then
      #       echo "::error::Prisma schema drift detected. Run 'prisma migrate dev --name <name>' locally, update db/schema.sql, and commit."
      #       echo "$DIFF"
      #       exit 1
      #     fi
      #     echo "No Prisma schema drift detected."

      - name: Verify declarative schema committed
        run: |
          if [ ! -f db/schema.sql ] && [ ! -f prisma/schema.prisma ] && [ ! -f supabase/schema.sql ]; then
            echo "::error::No declarative schema file found (expected db/schema.sql, prisma/schema.prisma, or supabase/schema.sql). Any DB work must maintain a declarative schema source."
            exit 1
          fi
          echo "Declarative schema file present."
```

---

## `scripts/setup-branch-protection.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
BRANCH="${2:-main}"

echo "Configuring branch protection on $REPO@$BRANCH..."

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/$REPO/branches/$BRANCH/protection" \
  -f required_status_checks.strict=true \
  -f required_status_checks.contexts[]='CI / typecheck' \
  -f required_status_checks.contexts[]='CI / lint' \
  -f required_status_checks.contexts[]='CI / design-system-compliance' \
  -f required_status_checks.contexts[]='CI / unit-tests' \
  -f required_status_checks.contexts[]='E2E / feature' \
  -f required_status_checks.contexts[]='E2E / regression-core' \
  -f required_status_checks.contexts[]='E2E / visual' \
  -f required_status_checks.contexts[]='E2E / coverage-check' \
  -f enforce_admins=false \
  -f required_pull_request_reviews.required_approving_review_count=1 \
  -f required_pull_request_reviews.dismiss_stale_reviews=true \
  -f restrictions= \
  -f allow_force_pushes=false \
  -f allow_deletions=false

echo "Branch protection configured. Required checks:"
gh api "/repos/$REPO/branches/$BRANCH/protection/required_status_checks" \
  --jq '.contexts[]'
```

Make executable: `chmod +x scripts/setup-branch-protection.sh`.

---

## Baseline Playwright Specs

### `e2e/feature/smoke.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test.describe('@feature smoke', () => {
  test('home page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
    expect(errors, `console/page errors: ${errors.join(', ')}`).toHaveLength(0);
  });
});
```

### `e2e/regression/sentinel.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test.describe('@regression-core sentinel', () => {
  test('app responds with 200 on /', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
  });
});
```

### `tests/visual/canary.spec.ts`

Canary `@visual` tests: one per standard viewport. Uses Vizzly CLI for diff output (JSON, AI-friendly). Baselines are committed to `tests/visual/baselines/` and regenerated with `pnpm test:e2e:visual --update-snapshots`.

```ts
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'wide', width: 1920, height: 1080 },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`@visual canary: ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(`home page visual baseline (${viewport.width}px)`, async ({ page }) => {
      await page.goto('/');
      // Wait for fonts and images to load
      await page.waitForLoadState('networkidle');
      // Full-page screenshot: do NOT scroll-and-stitch
      await expect(page).toHaveScreenshot(
        `home-${viewport.name}.png`,
        {
          fullPage: true,
          maxDiffPixelRatio: 0.02,
          animations: 'disabled',
        }
      );
    });
  });
}
```

### `playwright.config.ts` (root)

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'feature', testDir: 'e2e/feature', grep: /@feature/ },
    { name: 'regression-core', testDir: 'e2e/regression', grep: /@regression-core/ },
    {
      name: 'visual',
      testDir: 'tests/visual',
      grep: /@visual/,
      snapshotDir: 'tests/visual/baselines',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

---

## `.gitignore` Additions

```gitignore
# Playwright
playwright-report/
test-results/
.playwright/

# Visual diff artifacts (diffs are transient; baselines are committed)
tests/visual/diffs/
```

---

## Vizzly Integration Notes

The `@visual` suite uses Playwright's built-in screenshot comparison by default (baseline images committed to `tests/visual/baselines/`). For richer AI-friendly diff output, install Vizzly CLI:

```bash
pnpm add -D @vizzly/cli
```

Then update `test:e2e:visual` to pipe results through Vizzly:

```json
{
  "scripts": {
    "test:e2e:visual": "playwright test --project=visual --reporter=json | vizzly diff --output tests/visual/diffs/"
  }
}
```

Vizzly outputs JSON diffs that can be read by AI agents without image decoding. Diff images are stored in `tests/visual/diffs/` (gitignored). Baselines in `tests/visual/baselines/` are committed and updated by running `pnpm test:e2e:visual --update-snapshots`.

---

## Lean tier

Used when `quality.tier` resolves to `lean` (see the SKILL's "Quality tier"). These replace their standard counterparts; every other standard template is simply not written, except the design-system ones, which are written only when a design system exists. The same substitution rules apply (package manager, app paths, Node version).

### `.husky/pre-push` (lean)

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Lean tier: the same set CI runs (lint, typecheck, unit tests, build, one smoke
# spec), plus DB tests only when this push touches the schema or migrations.
# --no-verify is never the answer: a red hook is fixed, not skipped.
set -e

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm run --if-present test:e2e:smoke

BASE=$(git merge-base HEAD origin/main 2>/dev/null || true)
if [ -n "$BASE" ] && git diff --name-only "$BASE" HEAD | grep -Eq '(^|/)(migrations|supabase/migrations|prisma|drizzle)/|(^|/)schema\.(sql|prisma|ts)$'; then
  pnpm run --if-present test:db
fi
```

### `.github/pull_request_template.md` (lean)

```markdown
## Changes

[description]

## CI/CD checklist

- [ ] Unit tests added or updated for every changed behavior
- [ ] `@smoke` spec still walks the main flow (updated if the flow changed)
- [ ] No existing CI workflow jobs removed or weakened
- [ ] Husky `pre-push` hook ran green locally
- [ ] If any DB code touched: `db/schema.sql` (or equivalent declarative schema) updated first
```

Add `- [ ] No design-system-compliance violations (`pnpm check:design-system` green)` only when a design system exists.

### `.github/workflows/ci.yml` (lean)

Job order: lint → typecheck → unit-tests → build → e2e-smoke. When a design system exists, insert the standard `design-system-compliance` job (verbatim from the standard `ci.yml`) after `lint` and point `typecheck`'s `needs` at it. When `framework-detector` returned skip-E2E, drop the `e2e-smoke` job.

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    name: typecheck
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  unit-tests:
    name: unit-tests
    needs: typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  build:
    name: build
    needs: unit-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

  e2e-smoke:
    name: e2e-smoke
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e:smoke
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-smoke
          path: playwright-report/
          retention-days: 7
```

The local gates (Phase 4, and `slice-verifier` at each slice end) run this same command list in this order, so a green local run predicts a green CI run.

### `package.json` script additions (lean)

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:smoke": "playwright test --project=smoke"
  }
}
```

Add `"check:design-system": "bash scripts/check-design-system-tokens.sh"` only when a design system exists.

### `playwright.config.ts` (lean)

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'smoke', grep: /@smoke/ }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

The `webServer` block lets the hook and the CI job start the app themselves; swap `pnpm dev` and the port for the detected framework's dev command.

### `e2e/smoke.spec.ts` (lean)

ONE spec over the app's main flow. Start from this skeleton and replace the steps with the main flow named in PRD Section 2 (or the first pie's `**User flow:**` block in the master checklist): open the entry route, do the one thing the app exists for, and assert the result is visible. Keep the console-error guard.

```ts
import { test, expect } from '@playwright/test';

test.describe('@smoke main flow', () => {
  test('main flow works end to end', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
    // Main flow steps go here: one action per step, one visible assertion at the end.

    expect(errors, `console/page errors: ${errors.join(', ')}`).toHaveLength(0);
  });
});
```

### `scripts/setup-branch-protection.sh` (lean)

The standard script with its `contexts[]` lines replaced by the lean required checks:

```bash
  -f required_status_checks.contexts[]='CI / lint' \
  -f required_status_checks.contexts[]='CI / typecheck' \
  -f required_status_checks.contexts[]='CI / unit-tests' \
  -f required_status_checks.contexts[]='CI / build' \
  -f required_status_checks.contexts[]='CI / e2e-smoke' \
```

Add `CI / design-system-compliance` only when a design system exists, and drop `CI / e2e-smoke` when E2E was skipped.

### `.gitignore` additions (lean)

```gitignore
# Playwright
playwright-report/
test-results/
.playwright/
```
