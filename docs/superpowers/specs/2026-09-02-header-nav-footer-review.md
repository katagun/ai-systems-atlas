# Review: header, primary navigation, and footer

**Date:** 2026-09-02
**Status:** Implemented on 2026-09-02; recommendations A, B, and C landed as three commits with e2e and unit guards
**Scope:** tighten and make consistent; no redesign, no markup changes beyond one optional footer span

## Method

Three read-only audits rendered `web/` with Playwright at 390, 768, and 1280 pixels in both colour schemes, dumped computed styles and bounding boxes, and inventoried every radius, border, and shadow declaration in `web/styles.css`. Line numbers below refer to `web/styles.css` at commit `9d96ad8` unless another file is named.

## Findings

### 1. Primary navigation is styled as a widget, not as chrome

- `.tabs` (`:296-304`) is a 999px capsule with its own border and glass background. `.tab.is-active` (`:318`) fills solid ink and adds `--shadow-small` on top. A filled pill nested inside a bordered pill is a segmented control; it gives global navigation the same visual weight as the in-page collection switcher directly below it.
- The header alone mixes three corner treatments: the 999px nav pill, the 8px squares of the theme toggle and GitHub link (`:327`, `:344`), and the 12px/9px pair on the collection switcher beneath (`:509`, `:520`). The nav is the only capsule shape in the region, which is the inconsistency the owner noticed.
- At phone width the override at `:1107` flattens the bar to 10px but never touches `.tab`, so a stadium-shaped active chip sits inside a barely rounded rectangle. That is a patch on the pill, not a decision.
- At 390px all four tabs fit with zero slack: `scrollWidth` equals `clientWidth` at 364px. Any larger OS text size or font fallback tips the bar into `overflow-x: auto` with no visual cue, silently clipping "Taxonomy". Removing the pill padding buys back the margin.
- With `gap: .65rem` (`:1104`) the phone header stacks the wordmark, two bordered icon buttons, and the bordered nav bar inside about 120px. Three bordered surfaces read as three cards.
- The header is the only user of `--line-soft` (`:247`, `:301`). Every other bordered surface uses `--line` or `--line-strong`.

### 2. The GitHub link already renders as an icon

`web/index.html:46` carries an inline SVG with `aria-label="GitHub"`; `.github-link` has empty text content at every width and scheme, and `tests/test_web.js:468` guards it. The live site at the canonical URL serves the same markup. Seeing the word "GitHub" means a cached `index.html` or stylesheet from before PR #64. Nothing to change in code; hard-refresh and confirm the asset query strings match the current content hashes.

### 3. The footer relies on `space-between` for spacing it never gets

- `footer` (`:1074-1084`) is a single flex row with no `gap`. The four spans shrink until they wrap and fill the track exactly, so `space-between` inserts zero pixels. At 768px the wordmark runs into the wrapped second line of the score sentence and reads as one word; the date column ladders onto three lines.
- `align-items: center` against a fixed `min-height: 92px` centres the one-line wordmark between the two lines of its neighbours, so no baselines align.
- One row holds four unrelated kinds of content, a brand, two policy sentences, and a machine-written date, all at the same size, weight, and colour.
- Below 720px (`:1143`) the stack is centred. Centred multi-line policy text is the only centred prose on the site and produces ragged lines.
- The bare wordmark span duplicates the styled header mark and is the fragment that gets swallowed. It serves no purpose as a sibling of the sentences.
- Edges are correct. Footer, `main`, and the header all resolve to the same left and right edge at every width because of the shared width rule at `:1103`. Preserve it.

### 4. Corner radii have drifted across the stylesheet

One token exists, `--radius: 14px` (`:62`), used five times. The remaining declarations use fourteen distinct literal values (999, 16, 14, 12, 11, 10, 9, 8, 7, 6, 5, 4 px and 50%). Shadows are disciplined: every one routes through `--shadow-small`, `--shadow`, or `--shadow-dialog`. Borders are 1px everywhere except two intentional accents. Clear drift, not intent:

| Selector | Line | Value | Why it is an outlier |
|---|---|---|---|
| `.comparison-tray` | `:985` | `14px` literal | same value as `--radius`, bypasses the token |
| `.notice` | `:845` | `5px` | alone between the 6px chip tier and 8px control tier |
| `.finder-choice` | `:904` | `11px` | alone between 9px and 14px; sibling `.finder-result` uses the token |
| `.card-mark`, `.score-ring`, `.status-badge` | `:692`, `:716`, `:726` | 9, 8, 7px | three small squares in one card header, three radii |
| `dialog`, `.atlas-map` | `:969`, `:405` | `16px` literal | match each other by accident, not the token |
| `.tabs` phone override | `:1107` | `10px` | see finding 1 |

Glass surfaces use three blur strengths (20, 18, 16px at `:255`, `:545`, `:988`). Control labels in the mono tier use thirteen font sizes between .47rem and .78rem. Both are real but out of scope for this pass; they are noted for a later typography item.

## Recommendations

### A. Make the primary navigation plain text with an underline, at every width

Keep the markup. Change the base rules so phone and desktop share one language instead of a pill on desktop and a patched pill on phone.

```css
/* :296-304 */
.tabs { display: flex; align-self: center; gap: 1.4rem; padding: 0; border: 0; border-radius: 0; background: none; }
/* :305-319 */
.tab { position: relative; padding: .3rem .05rem .5rem; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted); cursor: pointer; border-radius: 0; font-size: .78rem; font-weight: 600; }
.tab:hover { color: var(--text); }
.tab.is-active { background: none; color: var(--text); box-shadow: none; border-bottom-color: var(--text); }
.tab:focus-visible { outline-offset: 2px; }
/* :1107-1108, layout only */
.tabs { order: 3; width: 100%; gap: 1.1rem; overflow-x: auto; }
.tab { flex: 0 0 auto; font-size: .7rem; }
```

Result: one quiet global nav, one loud in-page control (the collection switcher keeps its filled segmented style because it is a scope picker), and square 8px tool buttons that now match inputs, selects, and buttons (`:607`, `:635`). Change the header's two `--line-soft` borders (`:247`, `:301`; the second disappears with the pill) to `--line` so the header uses the same rule colour as everything else, or keep `--line-soft` on the header bottom only as a deliberate lighter rule and say so in `docs/WEB.md`.

Optional: reduce `.wm-a` (`:284`) from `2.2em` to about `1.7em` inside the 720px block. The mark is intentional, so this is taste, not a defect.

### B. Rebuild the footer as a two-zone grid on the existing column

```css
/* :1074-1084 */
footer {
  width: min(1360px, calc(100% - 3rem));
  margin: 0 auto;
  padding: 1.75rem 0 2rem;
  border-top: 1px solid var(--line-strong);
  display: grid;
  grid-template-columns: minmax(0, 62ch) auto;
  justify-content: space-between;
  align-items: start;
  column-gap: 2rem;
  row-gap: .35rem;
  color: var(--muted);
  font-size: .76rem;
}
footer #data-date { font: 500 .68rem var(--font-mono); letter-spacing: .08em; text-transform: uppercase; text-align: right; }
/* :1143 */
footer { padding: 1.5rem 0 1.75rem; grid-template-columns: 1fr; text-align: left; }
footer #data-date { text-align: left; margin-top: .5rem; }
```

Remove `min-height`, `align-items: center`, `flex-direction: column`, and `text-align: center`. In `web/index.html:235` either drop the wordmark span or move it after the date as a mono colophon line; the two policy sentences occupy the left column as stacked body text and the date sits right in the mono metadata voice the rest of the site uses. Every edge stays pinned to the `main` column.

### C. Collapse corner radii onto three tokens

Add to `:root` (`:62` area):

```css
--radius: 14px;          /* containers: cards, panels, shells, tray, map, hero stats, switcher */
--radius-control: 8px;   /* controls: inputs, selects, buttons, icon buttons, switcher buttons, finder choices, table wrap, detail blocks, taxonomy items */
--radius-chip: 6px;      /* badges, tags, status and licence chips, notice, card mark, score ring */
```

Edits: `:985` → `var(--radius)`; `:405`, `:483`, `:509`, `:969` → `var(--radius)`; `:393`, `:440`, `:520`, `:607`, `:635`, `:834`, `:904`, `:1024`, `:1064` → `var(--radius-control)`; `:692`, `:716`, `:726`, `:739`, `:762`, `:783`, `:813`, `:845` → `var(--radius-chip)`. Keep `50%` on dots and rings and `4px` on the skip link. The 999px role-badge pill at `:739` is the one judgment call; `--radius-chip` makes it match the other chips, which is the consistent answer. Extend the literal-colour guard in `tests/test_web.js` to fail on a `border-radius` literal outside `:root`, so the drift cannot return.

## Constraints on implementation

- `tests/e2e/header.spec.js` pins the theme toggle and GitHub link to the brand row at 390 and 900 wide, the header to 88px tall at 900, and the tools' right edge to `main`'s right edge at 1280. Recommendation A keeps all three.
- `tests/e2e/page-health.spec.js` forbids horizontal overflow at 390 in every view. The plain nav reduces width; verify after the change.
- `tests/test_web.js` fails on any colour literal outside the token blocks and on any drift between the two dark palettes. Derive tints with `color-mix()`.
- Run `node scripts/build_asset_version.mjs` after touching `web/styles.css` so the content hash and query strings change; a fresh browser context cannot see a cache-buster collision.
- Update `docs/WEB.md` "Visual language" with one sentence on the nav's underline state and the footer's two-zone layout, and add the radius tokens beside the colour-token rule.

## Sequencing

1. Recommendation A with its header e2e run, one pull request.
2. Recommendation B, one pull request; it touches one markup line.
3. Recommendation C plus the test guard, one pull request; it is mechanical and wide.

Screenshots and computed-style dumps from the audits are not committed; they were captured under the session scratch directory and can be regenerated with the Playwright suite.
