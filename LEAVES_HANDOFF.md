# 叶间 0.21.0 — implementation / pending visual acceptance

## Scope

- Only the 叶间 view is restyled; shelf, footprints, reading typography and bottom navigation remain unchanged.
- Background stays `#fcfaf7`. Stylized vine SVG scales with each post; both ends share the same x coordinate so adjacent segments meet.
- Main leaves belong to author headers, reply leaves belong to reply rows. Both authors share the same metadata grid; leaf dimensions do not shift text.
- Comfortable body line height stays 1.75; replies use 1.7, with 15px between replies and 48px bottom padding between posts. No reply background or redundant separators.
- No data schema, synchronization, backup or permission changes. Existing post/comment/edit/delete handlers are reused. Reply timestamps remain accessible in the DOM and author tooltip, without a separate visual row.
- Aa labels in both reading entry points are `0.21.0`; service-worker cache advances to `v80`.

## Verification

- `node --test tests/*.test.cjs`: 29 passing tests, including five new rendering/version regressions.
- `git diff --check`: clean.
- Browser acceptance is **not complete**. Local Playwright initially lacked Chromium; the cloud browser refused the localhost preview with `ERR_BLOCKED_BY_CLIENT`. No claim of pixel-perfect or iPhone verification.
- `tests/leaves.browser.cjs` is an optional pending browser regression, not part of the passing Node test count. With an available Playwright/Chromium installation and a local HTTP server, run `node tests/leaves.browser.cjs`; optional `SIDELEAF_TEST_URL` and `SIDELEAF_TEST_SCREENSHOT` configure preview URL and screenshot output. Use a disposable, unpaired browser context only.

## Before merging / deployment

1. Compare the real 390px page to the approved light, botanical concept; inspect vine continuity, main leaf attachment and reply leaf alignment. Check 320px and 430px, empty state, multiline/long content and many posts.
2. Check publishing, editing, commenting, delete confirmation, associated book labels and the composer on mobile. Test Aa displays 0.21.0 and offline update behavior.
3. Keep all fixture conversations out of production storage. Preserve all real content.
4. Merge only after visual acceptance; this draft does not update the live GitHub Pages site.
