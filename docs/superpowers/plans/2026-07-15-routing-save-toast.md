# Routing Save Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dismissible, three-second success toast after a Routing save completes successfully.

**Architecture:** Keep toast state local to `RoutingSettingsTab`. Trigger it only after the existing save API reports success, manage timer cleanup in a React effect, and render an accessible fixed-position notification without changing API or database code.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, lucide-react, Node test runner.

## Global Constraints

- Modify no API routes, services, database migrations, or other settings tabs.
- Preserve all current validation and error behavior.
- Add no dependency.
- Auto-dismiss duration is exactly 3,000 milliseconds.

---

### Task 1: Add the failing Routing toast regression test

**Files:**
- Modify: `tests/data-refresh-wiring.test.mjs`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: UTF-8 source of `RoutingSettingsTab.js`.
- Produces: assertions for toast state, close handler, 3-second timer, success trigger, and accessible status markup.

- [ ] **Step 1: Write the failing test**

```js
test("Routing save shows a dismissible success toast for three seconds", () => {
  assert.match(routingSettingsSource, /const \[successToast, setSuccessToast\] = useState\(null\)/);
  assert.match(routingSettingsSource, /window\.setTimeout\([\s\S]*3000/);
  assert.match(routingSettingsSource, /setSuccessToast\(\{[\s\S]*บันทึก Routing สำเร็จ/);
  assert.match(routingSettingsSource, /role="status"/);
  assert.match(routingSettingsSource, /onClick=\{dismissSuccessToast\}/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test -- tests/data-refresh-wiring.test.mjs`

Expected: FAIL because `successToast` does not exist.

- [ ] **Step 3: Document the focused test command**

Add `npm run test -- tests/data-refresh-wiring.test.mjs` to the Tests section of `AGENTS.md`.

### Task 2: Implement the Routing success toast

**Files:**
- Modify: `src/features/production-line-settings/components/RoutingSettingsTab.js`

**Interfaces:**
- Consumes: the existing successful `handleSave` path.
- Produces: `successToast`, `dismissSuccessToast`, timer cleanup, and an accessible top-right toast.

- [ ] **Step 1: Add state and close behavior**

```js
const [successToast, setSuccessToast] = useState(null);
const dismissSuccessToast = useCallback(() => setSuccessToast(null), []);
```

- [ ] **Step 2: Add timer cleanup**

```js
useEffect(() => {
  if (!successToast) return undefined;
  const timerId = window.setTimeout(() => {
    setSuccessToast((current) => current?.id === successToast.id ? null : current);
  }, 3000);
  return () => window.clearTimeout(timerId);
}, [successToast]);
```

- [ ] **Step 3: Trigger only after successful save**

```js
setSuccessToast({
  id: Date.now(),
  message: "บันทึก Routing สำเร็จ",
});
```

- [ ] **Step 4: Render the accessible notification**

Render a fixed top-right `role="status"` card with `aria-live="polite"`, a green check icon, the message, a Thai-labeled close button, and a three-second progress bar.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm run test -- tests/data-refresh-wiring.test.mjs`

Expected: all focused tests PASS.

### Task 3: Verify the scoped change

**Files:**
- Verify: `src/features/production-line-settings/components/RoutingSettingsTab.js`
- Verify: `tests/data-refresh-wiring.test.mjs`

**Interfaces:**
- Consumes: completed component and regression test.
- Produces: lint, test, and build evidence.

- [ ] Run focused ESLint and expect exit code 0.
- [ ] Run the full Node test suite and report unrelated failures without modifying them.
- [ ] Run `npm run build` and expect a successful production build.
