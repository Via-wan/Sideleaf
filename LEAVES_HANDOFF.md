# 叶间 0.21.4 — measured connected botanical SVG / pending visual acceptance

## Latest correction

The user explicitly wants decorative leaves retained. 0.21.3 incorrectly interpreted visual clutter as a request to remove them. Approved visual reference: `56AD767D-926F-4664-BF13-B95758B60A65.jpeg`. The target has slender connected petioles, varied sage/coral leaves, fine veins and a quiet continuous stem. Do not simplify by deleting decoration.

`sideleaf-vine.js` now measures actual header/reply rows and draws a single sibling SVG. Every petiole endpoint is exactly the leaf origin; decorations are sampled on the same cubic stem in sufficiently spacious intervals. Resize, font loading and feed mutations schedule recalculation. The old per-row SVGs are hidden as a fallback implementation detail. No data or network access occurs in this renderer. Reference fidelity and iPhone visual acceptance remain to be checked; tests are not a substitute for that.

## Scope

- Only the 叶间 view is restyled; shelf, footprints, reading typography and bottom navigation remain unchanged.
- Background stays `#fcfaf7`. One measured SVG spans the feed; all stem segments and leaves use a shared coordinate system.
- Main leaves belong to author headers, reply leaves belong to reply rows. Both authors share the same metadata grid; leaf dimensions do not shift text.
- Comfortable body line height stays 1.75; replies use 1.7, with 15px between replies and 48px bottom padding between posts. No reply background or redundant separators.
- No data schema, synchronization, backup or permission changes. Existing post/comment/edit/delete handlers are reused. Reply timestamps remain accessible in the DOM and author tooltip, without a separate visual row.
- In 0.21.1 the action menu was absolutely anchored under the top-right ellipsis, so opening it no longer altered card or vine height. The header rule became a shallow SVG curve.
- In 0.21.2 any blank-area pointer press dismisses the action menu, while presses on the ellipsis/menu remain interactive. Composer contents become hidden immediately on close, before the container shrinks, and the plus waits to return until the morph is nearly complete. The clipped pseudo-element sprout is replaced with a stemmed SVG leaf.
- 0.21.3 removed decorative leaves, contrary to the user's intended design. 0.21.4 restores them and replaces independent node positioning with measured connected geometry (see Latest correction).
- Aa labels in both reading entry points are `0.21.4`; service-worker cache advances to `v84`.

## Verification

- `node --test tests/*.test.cjs`: 34 passing tests, including measured multi-post geometry, decoration retention, exact branch/leaf endpoint equality and hidden/empty states.
- `git diff --check`: clean.
- User recording `ScreenRecording_09-09-2026 18-04-21_1.mp4` exposed three 0.21.0 defects addressed in 0.21.1. Recording `ScreenRecording_09-09-2026 18-22-37_1.mp4` then exposed the crooked ear-like sprout and delayed composer-content fade addressed in 0.21.2. The iPhone screenshot `2D885896-5AFE-4FDC-9743-E16872DDFD26.png` confirmed those interaction fixes and exposed a sharp segment junction, detached main-leaf roots, overlapping decorative leaves and loop-like reply branches; 0.21.4 addresses that left-rail clutter. Final visual acceptance still depends on the next live screenshot.
- `tests/leaves.browser.cjs` is an optional pending browser regression, not part of the passing Node test count. With an available Playwright/Chromium installation and a local HTTP server, run `node tests/leaves.browser.cjs`; optional `SIDELEAF_TEST_URL` and `SIDELEAF_TEST_SCREENSHOT` configure preview URL and screenshot output. Use a disposable, unpaired browser context only.

## Before merging / deployment

1. Compare the real 390px page to the approved light, botanical concept; inspect vine continuity, main leaf attachment and reply leaf alignment. Check 320px and 430px, empty state, multiline/long content and many posts.
2. Check publishing, editing, commenting, delete confirmation, associated book labels and the composer on mobile. Test Aa displays 0.21.4 and offline update behavior.
3. Keep all fixture conversations out of production storage. Preserve all real content.
4. User has authorized publishing iterative UI changes. Verify the deployed version, and distinguish geometry tests from visual acceptance on the user's real data.
