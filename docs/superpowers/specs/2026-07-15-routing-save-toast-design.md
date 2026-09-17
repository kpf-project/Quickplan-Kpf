# Routing Save Toast Design

## Goal

Give users clear confirmation after a successful save on `/production-line/settings/routing` without interrupting their work.

## Behavior

- Show the toast only after `saveProductionRoutingComponents` returns a successful result.
- Display “บันทึก Routing สำเร็จ” in a green success treatment at the top-right of the viewport.
- Include a visible close button with an accessible Thai label.
- Auto-dismiss after 3,000 milliseconds.
- A repeated successful save replaces the current toast and restarts the timer.
- Preserve the existing validation and error-message behavior.

## Visual direction

Use a compact industrial success card that matches the page’s navy, gold, and green palette: a green check icon, strong Thai heading, concise supporting text, elevated shadow, and a thin countdown bar. The toast must remain readable on mobile and must not block the Routing table.

## Scope

- Modify only `RoutingSettingsTab.js`, its focused regression test, and the repository test-command documentation.
- Add no dependency, API, schema, or unrelated UI changes.

## Verification

- A source-wiring regression test proves the success state, 3-second timer, close action, and success trigger exist.
- Run focused ESLint and the production build after the test passes.
