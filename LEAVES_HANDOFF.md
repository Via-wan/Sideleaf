# 叶间 0.21.3 — calm continuous vine / pending visual acceptance

## Scope

- Only the 叶间 view is restyled; shelf, footprints, reading typography and bottom navigation remain unchanged.
- Background stays `#fcfaf7`. Stylized vine SVG scales with each post; both ends share the same x coordinate so adjacent segments meet.
- Main leaves belong to author headers, reply leaves belong to reply rows. Both authors share the same metadata grid; leaf dimensions do not shift text.
- Comfortable body line height stays 1.75; replies use 1.7, with 15px between replies and 48px bottom padding between posts. No reply background or redundant separators.
- No data schema, synchronization, backup or permission changes. Existing post/comment/edit/delete handlers are reused. Reply timestamps remain accessible in the DOM and author tooltip, without a separate visual row.
- In 0.21.1 the action menu was absolutely anchored under the top-right ellipsis, so opening it no longer altered card or vine height. The header rule became a shallow SVG curve.
- In 0.21.2 any blank-area pointer press dismisses the action menu, while presses on the ellipsis/menu remain interactive. Composer contents become hidden immediately on close, before the container shrinks, and the plus waits to return until the morph is nearly complete. The clipped pseudo-element sprout is replaced with a stemmed SVG leaf.
- In 0.21.3 adjacent post-vine segments use matching endpoint tangents, so they read as one continuous stem instead of meeting in a sharp kink. Random pseudo-element leaves are removed; only the post leaf and reply leaves remain. The post leaf root is moved onto the stem, and each reply uses a compact SVG twig instead of the tall loop-shaped CSS border.
- Aa labels in both reading entry points are `0.21.3`; service-worker cache advances to `v83`.

## Verification

- `node --test tests/*.test.cjs`: 32 passing tests, including the 0.21.3 vine-structure regression.
- `git diff --check`: clean.
- User recording `ScreenRecording_09-09-2026 18-04-21_1.mp4` exposed three 0.21.0 defects addressed in 0.21.1. Recording `ScreenRecording_09-09-2026 18-22-37_1.mp4` then exposed the crooked ear-like sprout and delayed composer-content fade addressed in 0.21.2. The iPhone screenshot `2D885896-5AFE-4FDC-9743-E16872DDFD26.png` confirmed those interaction fixes and exposed a sharp segment junction, detached main-leaf roots, overlapping decorative leaves and loop-like reply branches; 0.21.3 addresses that left-rail clutter. Final visual acceptance still depends on the next live screenshot.
- `tests/leaves.browser.cjs` is an optional pending browser regression, not part of the passing Node test count. With an available Playwright/Chromium installation and a local HTTP server, run `node tests/leaves.browser.cjs`; optional `SIDELEAF_TEST_URL` and `SIDELEAF_TEST_SCREENSHOT` configure preview URL and screenshot output. Use a disposable, unpaired browser context only.

## Before merging / deployment

1. Compare the real 390px page to the approved light, botanical concept; inspect vine continuity, main leaf attachment and reply leaf alignment. Check 320px and 430px, empty state, multiline/long content and many posts.
2. Check publishing, editing, commenting, delete confirmation, associated book labels and the composer on mobile. Test Aa displays 0.21.3 and offline update behavior.
3. Keep all fixture conversations out of production storage. Preserve all real content.
4. Merge only after visual acceptance; this draft does not update the live GitHub Pages site.
