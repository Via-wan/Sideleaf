# 叶间 0.22.5 — matching menus and keyboard layout

## 0.22.5

Post menus now match comment menus: borderless warm-paper surface, 12px corners, shared shadow/padding/button typography, no divider lines or backdrop blur. Composer textarea is 16px to avoid iPhone small-input zoom. Opening freezes the background leaf region at the pre-keyboard height and hides navigation; visualViewport offset is compensated on the shelf while the composer alone follows the keyboard. No-keyboard focus keeps the default bottom position; dismissal restores default styles, and closing blurs the editor. Short viewports cap composer height. Tests exercise keyboard opening/panning/dismissal, no-keyboard focus, pinch zoom and short viewport geometry. 39 Node tests pass; Aa 0.22.5, cache v91. iOS keyboard behavior requires real-device acceptance; these are calculation regressions, not a claim of iPhone browser testing.

## 0.22.4

叶间 heading increases from 32px to 38px. Name ink is independent of leaf pigment: zheng names use mist blue #6f8489 (same as the existing selected 峥 footprint label), wish names retain #bd8b76, botanical leaves remain sage/coral. Footprint volume now includes is-author-wish/zheng so book labels across notes/likes/reviews and expanded-detail borders follow the selected reader. Neutral reading text and functional bookmark colors remain intact. Aa version 0.22.4, cache v90; 37 existing tests pass and git diff --check is clean.

## 0.22.3

User approved the subtitle “书读到一半，想和你说句话。” Title uses bundled ZCOOL XiaoWei (400, 32px), subtitle Noto Serif SC (400, 13px). Only needed characters are subsetted, embedded in sideleaf-heading-fonts.css (about 12KB raw font data combined), with OFL notices in vendor/LEAF-FONTS-LICENSE.txt. No runtime Google Fonts request or full CJK font download. Body/comment typography and botanical layout remain as in 0.22.2. Both Aa labels are 0.22.3, cache v89. Font subsets decoded with fontTools and visually rendered; 37 Node tests pass. This note records implementation, not a claim of iPhone visual acceptance.

## 0.22.2 current checkpoint

PR #37 merged to main at 8697a159e5df5c38b3f265e7792c1b1efa76c057. Reply arrows are now inline stroked SVG, avoiding iPhone emoji substitution. The leaf feed and measured SVG share a relative content wrapper inside a fixed-height scroll region; upper/lower masks fade both together. Heading and bottom controls stay outside that region. Body scroll locking applies only to the leaves view. The content wrapper preserves the vine's feed-relative coordinates without scroll-time redraws. Reader Aa version is 0.22.2, cache v88.

37 Node tests and diff whitespace checks pass. Publish run 34347824351 succeeded for PR #37's merge. Live read.html confirmed 0.22.2. In the unpaired desktop QA browser, a temporary 30-line post produced a 669px scroll viewport with 1136px content. Scrolling 330px left heading y=48 unchanged and moved text/vine together; screenshot confirmed upper/lower fading. Menu opened and blank-heading click dismissed it. The generated long post was removed, leaving the pre-existing QA post. Returning to the shelf restored normal body positioning. User data/Core were not connected or modified. iPhone final visual acceptance remains for the user; desktop QA is not an iOS keyboard/viewport test.

Below are earlier implementation notes; their version/test counts are historical.

## Latest correction

0.22.1 adds comment menus, own-comment edit/delete with confirmation, and flat chronological reply-to-comment display (`愿 ↪ 峥：`). Targets use stable comment IDs plus author snapshots, not text parsing. Core PR #13 / 0.5.1 adds nullable reply fields and optional MCP replyToId; backend must be healthy before frontend publication. Target deletion preserves descendants. The comment leaf and petiole move up 6px. Frontend tests: 37 passing; additional Core tests exercise real SQLite sync/edit/delete/reply serialization and ownership. Railway has unrelated staged variables: do not accept those changes.

0.22.1 reference: user screenshot `0029139C-B5D6-48D6-9DC8-C355367CC690.png`. Consecutive replies were fixed at x=29, producing long vertical stretches. Stem anchors now follow a header-relative wave with shared Hermite tangents. Leaves have fuller asymmetrical silhouettes and increased main/reply/decoration sizes; short petioles remain connected. The book quote icon is now a real open-book SVG with curved facing pages, central spine and small page strokes, replacing the rectangle pseudo-element. Test both multi-line replies and the book chip on iPhone; do not claim pixel-perfect reference matching from unit tests.

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
- 0.21.3 removed decorative leaves, contrary to the user's intended design. 0.22.1 restores them and replaces independent node positioning with measured connected geometry (see Latest correction).
- Aa labels in both reading entry points are `0.22.1`; service-worker cache advances to `v87`.

## Verification

- `node --test tests/*.test.cjs`: 34 passing tests, including measured multi-post geometry, decoration retention, exact branch/leaf endpoint equality and hidden/empty states.
- `git diff --check`: clean.
- User recording `ScreenRecording_09-09-2026 18-04-21_1.mp4` exposed three 0.21.0 defects addressed in 0.21.1. Recording `ScreenRecording_09-09-2026 18-22-37_1.mp4` then exposed the crooked ear-like sprout and delayed composer-content fade addressed in 0.21.2. The iPhone screenshot `2D885896-5AFE-4FDC-9743-E16872DDFD26.png` confirmed those interaction fixes and exposed a sharp segment junction, detached main-leaf roots, overlapping decorative leaves and loop-like reply branches; 0.22.1 addresses that left-rail clutter. Final visual acceptance still depends on the next live screenshot.
- `tests/leaves.browser.cjs` is an optional pending browser regression, not part of the passing Node test count. With an available Playwright/Chromium installation and a local HTTP server, run `node tests/leaves.browser.cjs`; optional `SIDELEAF_TEST_URL` and `SIDELEAF_TEST_SCREENSHOT` configure preview URL and screenshot output. Use a disposable, unpaired browser context only.

## Before merging / deployment

1. Compare the real 390px page to the approved light, botanical concept; inspect vine continuity, main leaf attachment and reply leaf alignment. Check 320px and 430px, empty state, multiline/long content and many posts.
2. Check publishing, editing, commenting, delete confirmation, associated book labels and the composer on mobile. Test Aa displays 0.22.1 and offline update behavior.
3. Keep all fixture conversations out of production storage. Preserve all real content.
4. User has authorized publishing iterative UI changes. Verify the deployed version, and distinguish geometry tests from visual acceptance on the user's real data.
