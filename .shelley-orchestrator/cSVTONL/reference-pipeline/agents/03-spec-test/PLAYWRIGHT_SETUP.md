# PLAYWRIGHT_SETUP.md — how 03-spec-test builds e2e/UI tests for THIS project

> Read by `03-spec-test` (and referenced by `04-implementation` for
> testability requirements). This is a reference for setting up and writing
> Playwright tests against **whatever real project's `PRD.md` you're
> currently working from** — not against the shipped `src/example/` login
> demo. The demo exists only to prove the mechanics; delete it once you've
> walked through it once (see `src/example/README.md`).

## 1. One-time setup (do this before writing any test)

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium   # add firefox/webkit only if the PRD specifically requires cross-browser coverage
```

`--with-deps` also installs the OS-level libraries the browser needs — skip it
only if you're in a container that already has them (e.g. a prebuilt CI
image). This step requires network access; if you're working in a sandboxed
environment without it, write the tests anyway (they're the spec — RED is
still valid without ever having run them) and note in your handoff that e2e
execution is pending an environment with browser install access.

## 2. `playwright.config.js` — copy this pattern, adapt the `webServer` block

A root-level `playwright.config.js` ships with this scaffold, wired to the
`src/example/` demo. **When you start a real project, change the `webServer`
block to boot your actual app** — that's the only part that's project-specific;
everything else below is a reusable default:

```js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,       // fail CI if someone left a .only() in
  retries: process.env.CI ? 1 : 0,     // one retry in CI absorbs infra flake without hiding real bugs
  reporter: [
    ['list'],
    ['json', { outputFile: 'tests/reports/e2e-report.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',           // full DOM/network trace only when something actually failed
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    // CHANGE THIS to your real project's actual start command, e.g.:
    //   command: 'npm run dev'
    //   command: 'node src/server.js'
    command: 'node src/example/server.js',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

Why `webServer` matters: it makes `npx playwright test` self-contained — it
boots the app, waits for it to respond, runs the suite, and tears it down.
Nobody (a human or another agent) has to remember to start a dev server
first, and CI doesn't need a separate "start app" step that can silently race
the test run.

## 3. Locator strategy — role-based first, always

Use accessibility-tree locators, in this priority order:

1. `page.getByRole('button', { name: 'Sign in' })` — matches what a screen
   reader announces; breaks only if the actual UI changes in a way a user
   would also notice.
2. `page.getByLabel('Email')` — for form fields with a real `<label>`.
3. `page.getByText('Invalid email or password')` — for asserting visible
   copy.
4. `page.getByTestId('...')` — last resort, only when no accessible role/label
   exists (e.g. a decorative element the PRD still requires testing). Every
   `data-testid` you add is also a nudge back to `04-implementation`: if
   something needs a testid to be findable, it may be missing proper
   semantics/ARIA — flag it rather than silently reaching for the escape
   hatch.

Never locate by raw CSS class or DOM structure (`.btn-primary > span`) — it
breaks on any restyle and tells you nothing about whether a real user could
actually find and use the element, which is the entire point of testing at
the UI level instead of the unit level.

## 4. File & naming convention (ties directly to traceability)

- One spec file per screen or logical UI grouping:
  `tests/e2e/<feature-slug>/<screen-slug>.spec.js`.
- Every `test()` title starts with the `UI-###` id it covers, exactly as it
  appears in `PRD.md`, so `05-qa-verification` can machine-match spec titles
  to PRD ids when building `traceability-matrix.json`:
  ```js
  test('UI-003: "Add to cart" button shows quantity badge on success', async ({ page }) => { ... });
  ```
- Cover every state the PRD's UI table lists for that element (default,
  loading, success, error, disabled) — not just the happy path. A `UI-###`
  row with 4 listed states and only 1 test covering it is incomplete
  coverage, not partial credit.

## 5. Test isolation & determinism

- Each Playwright test gets a fresh browser context automatically — don't
  fight this by sharing state between tests.
- If the app needs seeded data (a user account to log in as, an existing
  cart, etc.), seed it deterministically at the start of the test or via a
  `test.beforeEach` — never depend on state left over from a previous test's
  run order.
- Never use raw `page.waitForTimeout(ms)` to "wait for it to load." Use
  `expect(locator).toBeVisible()`, `page.waitForResponse(...)`, or
  `page.waitForURL(...)` — these wait for the actual condition instead of a
  guessed duration, which is both faster and eliminates an entire category of
  flaky-test bug reports.

## 6. What `04-implementation` owes this layer (testability)

Playwright tests are only as good as the semantics they can grab onto.
`04-implementation` should, without being asked case-by-case:
- Use real `<button>`/`<a>`/`<input>` elements with correct roles, not
  `<div onClick>` soup.
- Give every form input a real, associated `<label>` (via `for`/`id` or
  wrapping).
- Reflect async state (loading/success/error) in the accessibility tree —
  e.g. `role="status"` with an accessible name during a loading state — not
  just visually (a spinner with no ARIA role is invisible to
  `getByRole('status', ...)` and to actual screen-reader users).
- Keep routes/URLs predictable and match whatever the PRD's `STEP-###`
  workflow entries describe, since e2e tests assert on `page.url()` after
  multi-step flows.

## 7. CI

See `.github/workflows/pipeline-gate.yml` for a working Playwright job
(browser install with caching, `webServer` auto-boot, trace/video artifacts
uploaded on failure). Adapt the `webServer` command there the same way you
adapt `playwright.config.js`.
