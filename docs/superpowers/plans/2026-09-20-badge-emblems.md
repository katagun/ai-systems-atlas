# Badge Emblems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-pill card badges with tinted, icon-only emblems whose frame shape names a badge family, explained by a styled tooltip and a scope-aware legend strip fixed to the viewport bottom.

**Architecture:** All badge data and pure logic (family registry, glyphs, emblem SVG markup, legend contents) live in `web/app-core.js`, which is unit-tested under Node. `web/app.js` only wires DOM: the badge row, one shared tooltip, the legend strip, and the Taxonomy glossary. Colours come from existing CSS tokens through `[data-family]` selectors, so both dark palettes work with no new literals.

**Tech Stack:** Vanilla JS (UMD core + browser script), hand-written CSS with custom properties, inline SVG, `node --test`, Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-20-badge-emblems-design.md`](../specs/2026-09-20-badge-emblems-design.md)

## Global Constraints

- The badge contract is unchanged: presence-only tests of reviewed fields; no merit, trust, risk, or automated signals; badges are not controls and add **no tab stops**.
- No change to which badges exist, what they test, their names, definitions, or set order.
- Every colour in `web/styles.css` outside the token blocks must be a `var(--token)` or a `color-mix()` of tokens; no `border-radius` literal outside `:root` (use `var(--radius)`, `var(--radius-control)`, `var(--radius-chip)`, `0`, or `50%`). `tests/test_web.js` enforces both.
- User-facing strings are plain language (no "score profiles"-style internal vocabulary).
- One glyph maps to exactly one badge id. Accelerator badges use mono lettering `MTL`, `ROC`, `NPU`.
- `MAX_CARD_BADGES` becomes 6.
- Use Node 22 for every node command: `/usr/local/bin/node` (the default `node` on this machine is v16 and mis-hashes the asset stamp silently). Examples: `/usr/local/bin/node --test tests/test_web.js`, `/usr/local/bin/node scripts/build_asset_version.mjs`. Playwright: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/card-badges.spec.js`.
- Do not edit generated files by hand. After changing `web/app-core.js`, `web/app.js`, `web/styles.css`, or `web/index.html`, run `/usr/local/bin/node scripts/build_asset_version.mjs` before committing so the `?v=` stamps in `web/index.html` change (the pre-commit "asset version freshness" hook fails otherwise).
- Never commit `.superpowers/`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility in this change |
|---|---|
| `web/app-core.js` | `BADGE_FAMILIES`, `family` + `glyph` on each badge, `badgeEmblem()`, `familyEmblem()`, `badgeLegend()`, cap 6, glossary carries `family` |
| `web/app.js` | `badgeRow` markup, tooltip wiring, legend wiring, Taxonomy glossary markup |
| `web/index.html` | static mount points: `#badge-tooltip`, `#badge-legend`, `#badge-legend-chip` |
| `web/styles.css` | emblem, tooltip, legend, chip, taxonomy-emblem styles |
| `tests/test_web.js` | unit tests for the registry, emblem markup, legend contents, cap |
| `tests/e2e/card-badges.spec.js` | emblem row, tooltip |
| `tests/e2e/badge-legend.spec.js` (new) | legend behaviour |
| `docs/WEB.md`, `BACKLOG.md` | contract text, browser matrix step 30, backlog grooming |

---

### Task 1: Badge families, glyphs, emblem markup, and legend contents in the core

**Files:**
- Modify: `web/app-core.js:327-481` (badge block and the export list)
- Test: `tests/test_web.js` (badge tests near lines 835-933; import list on line 6)

**Interfaces:**
- Produces (all exported from `AtlasCore` / `require("../web/app-core.js")`):
  - `BADGE_FAMILIES: { [familyId]: { name: string, meaning: string, token: string, frame: string } }` — insertion order `control`, `capability`, `platform`; `frame` is SVG path data for a `0 0 32 32` viewBox; `token` is a CSS custom property name such as `"--cyan"`.
  - `CARD_BADGES[id].family: string`, `CARD_BADGES[id].glyph: string` (SVG markup).
  - `cardBadges(kind, record) → [{ id, name, definition, family }]`, capped at 6.
  - `cardBadgeGlossary() → [{ id, name, definition, family, scopes }]`.
  - `badgeEmblem(badgeId) → string` — `<svg class="badge-emblem" …>` with frame and glyph.
  - `familyEmblem(familyId) → string` — same SVG with the frame only.
  - `badgeLegend(collection, systemFamily = "") → null | { mode: "badges", badges: [{ id, name, family }] } | { mode: "families", families: [{ id, name, meaning }] }`.

- [ ] **Step 1: Write the failing tests**

In `tests/test_web.js` line 6, add `BADGE_FAMILIES, badgeEmblem, badgeLegend, familyEmblem` to the destructured import.

Replace the test `"agent-system badges follow priority order and stop at four"` with:

```js
test("agent-system badges follow priority order and show every match", () => {
  const record = {
    system_family: "agent_system",
    local_first: true,
    execution_boundaries: ["host", "container"],
    agent_capabilities: ["mcp", "browser_control"],
    deployment: ["self_hosted"],
  };
  assert.deepEqual(badgeNames(cardBadges("system", record)), ["Local-first", "Sandboxed execution", "Browser control", "MCP", "Self-hostable"]);
  assert.deepEqual(cardBadges("system", record).map(badge => badge.family), ["control", "control", "capability", "capability", "control"]);
});

test("no badge set can overflow the card cap of six", () => {
  for (const [key, ids] of Object.entries(CARD_BADGE_SETS)) assert.ok(ids.length <= 6, `${key} lists ${ids.length} badges`);
});
```

Add after the glossary test:

```js
test("every badge belongs to one family and owns a unique glyph", () => {
  assert.deepEqual(Object.keys(BADGE_FAMILIES), ["control", "capability", "platform"]);
  const css = fs.readFileSync(path.join(__dirname, "..", "web", "styles.css"), "utf8");
  for (const [id, family] of Object.entries(BADGE_FAMILIES)) {
    assert.ok(family.name && family.meaning && family.frame, `${id} needs a name, a meaning, and a frame`);
    assert.match(family.token, /^--[a-z-]+$/);
    assert.ok(css.includes(`${family.token}:`), `${family.token} is not a token in styles.css`);
    assert.ok(css.includes(`[data-family="${id}"] { color: var(${family.token}); }`), `styles.css must colour family ${id} with ${family.token}`);
  }
  const glyphs = new Set();
  for (const [id, badge] of Object.entries(CARD_BADGES)) {
    assert.ok(Object.hasOwn(BADGE_FAMILIES, badge.family), `${id} has unknown family ${badge.family}`);
    assert.ok(badge.glyph, `${id} needs a glyph`);
    assert.ok(!glyphs.has(badge.glyph), `${id} reuses another badge's glyph`);
    glyphs.add(badge.glyph);
  }
  for (const [id, text] of [["apple-metal", "MTL"], ["amd-rocm", "ROC"], ["npu", "NPU"]]) assert.ok(CARD_BADGES[id].glyph.includes(`>${text}</text>`), `${id} must be lettered ${text}`);
  assert.equal(cardBadgeGlossary().find(entry => entry.id === "mcp").family, "capability");
});

test("emblems are hidden decorative SVG built from the family frame and the badge glyph", () => {
  const svg = badgeEmblem("local-first");
  assert.match(svg, /^<svg class="badge-emblem" viewBox="0 0 32 32" aria-hidden="true" focusable="false">/);
  assert.ok(svg.includes(`d="${BADGE_FAMILIES.control.frame}"`));
  assert.ok(svg.includes(CARD_BADGES["local-first"].glyph));
  assert.ok(familyEmblem("platform").includes(`d="${BADGE_FAMILIES.platform.frame}"`));
  assert.ok(!familyEmblem("platform").includes("badge-glyph"));
});

test("the legend lists only what the active scope can show", () => {
  const ids = legend => legend.badges.map(badge => badge.id);
  assert.deepEqual(ids(badgeLegend("inference")), ["dedicated-endpoints", "reserved-capacity", "batch"].sort((a, b) =>
    Object.keys(BADGE_FAMILIES).indexOf(CARD_BADGES[a].family) - Object.keys(BADGE_FAMILIES).indexOf(CARD_BADGES[b].family)));
  assert.deepEqual(ids(badgeLegend("systems", "agent_system")), ["local-first", "sandboxed-execution", "self-hostable", "browser-control", "mcp"]);
  const systems = badgeLegend("systems");
  assert.equal(systems.mode, "badges");
  assert.equal(new Set(ids(systems)).size, ids(systems).length, "each badge once");
  assert.deepEqual(new Set(ids(systems)), new Set([...CARD_BADGE_SETS["system:agent_system"], ...CARD_BADGE_SETS["system:memory_system"], ...CARD_BADGE_SETS["system:assistant_system"]]));
  const families = systems.badges.map(badge => Object.keys(BADGE_FAMILIES).indexOf(badge.family));
  assert.deepEqual(families, [...families].sort((a, b) => a - b), "grouped by family in registry order");
  for (const scope of ["all", "packs"]) {
    assert.equal(badgeLegend(scope).mode, "families");
    assert.deepEqual(badgeLegend(scope).families.map(family => family.id), ["control", "capability", "platform"]);
  }
  assert.equal(badgeLegend("models"), null);
  assert.equal(badgeLegend("systems", "constructor"), null);
  assert.equal(badgeLegend("toString"), null);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `/usr/local/bin/node --test tests/test_web.js 2>&1 | tail -30`
Expected: FAIL — `badgeLegend is not a function` / `BADGE_FAMILIES` undefined, and the five-badge assertion fails with four names.

- [ ] **Step 3: Implement in `web/app-core.js`**

Insert above `const CARD_BADGES = {`:

```js
  // A badge's family decides its frame and accent. Frames are path data on a
  // 32-unit viewBox; styles.css colours each family by its token through
  // [data-family]. A new family is one entry here plus its badges' glyphs.
  const BADGE_FAMILIES = {
    control: {
      name: "Control and privacy",
      meaning: "Where your data lives and who can touch it.",
      token: "--cyan",
      frame: "M16 2.5 27 6.5v8.2c0 7-4.6 12.2-11 14.8C9.6 26.9 5 21.7 5 14.7V6.5Z",
    },
    capability: {
      name: "Capabilities",
      meaning: "What it can do.",
      token: "--violet",
      frame: "M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25Z",
    },
    platform: {
      name: "Platform and hardware",
      meaning: "Where it runs and what it runs on.",
      token: "--amber",
      frame: "M9 4h14a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5Z",
    },
  };
  const badgeLettering = text => `<text x="16" y="18.3" text-anchor="middle">${text}</text>`;
```

Add `family` and `glyph` to every `CARD_BADGES` entry (keep `name`, `definition`, `test` exactly as they are):

| id | family | glyph |
|---|---|---|
| `local-first` | `control` | `'<path d="M10.5 16.5 16 11.5l5.5 5M12.3 15.5V21h7.4v-5.5"/>'` |
| `self-hostable` | `control` | `'<rect x="10.5" y="10.5" width="11" height="4.2" rx="1"/><rect x="10.5" y="16.8" width="11" height="4.2" rx="1"/><circle class="badge-dot" cx="13" cy="12.6" r=".8"/><circle class="badge-dot" cx="13" cy="18.9" r=".8"/>'` |
| `sandboxed-execution` | `control` | `'<path d="M16 10 21.5 12.8v6.4L16 22l-5.5-2.800v-6.4ZM10.5 12.8 16 15.6l5.5-2.800M16 15.6V22"/>'` |
| `editable-by-you` | `control` | `'<path d="m11.5 20.5.7-3 6.6-6.6 2.3 2.3-6.6 6.6Z"/>'` |
| `plain-files` | `control` | `'<path d="M12 10h5.5l2.5 2.5V22h-8ZM14.2 15.5h3.6M14.2 18.5h3.6"/>'` |
| `browser-control` | `capability` | `'<path d="m12 10.5 9 4.3-3.9 1.4-1.6 4.3Z"/>'` |
| `mcp` | `capability` | `'<path d="M13.5 9.5v3.5M18.5 9.5v3.5M11.5 13h9v2.5a4.5 4.5 0 0 1-9 0ZM16 20v2.5"/>'` |
| `graph-retrieval` | `capability` | `'<path d="M16 12.5 12.5 19M16 12.5 19.5 19M12.5 19h7"/><circle class="badge-dot" cx="16" cy="11.8" r="1.9"/><circle class="badge-dot" cx="12" cy="19.5" r="1.9"/><circle class="badge-dot" cx="20" cy="19.5" r="1.9"/>'` |
| `time-aware-recall` | `capability` | `'<circle cx="16" cy="16" r="5.8"/><path d="M16 12.8V16l2.3 1.5"/>'` |
| `batch` | `capability` | `'<path d="m10.5 13 5.5-2.8 5.5 2.8-5.5 2.8ZM10.5 16.2 16 19l5.5-2.800M10.5 19.3 16 22l5.5-2.7"/>'` |
| `distributed-serving` | `capability` | `'<rect x="13.8" y="9.8" width="4.4" height="4.4" rx="1"/><rect x="9.8" y="17.8" width="4.4" height="4.4" rx="1"/><rect x="17.8" y="17.8" width="4.4" height="4.4" rx="1"/><path d="M16 14.2v1.8M12 17.8V16h8v1.8"/>'` |
| `desktop-app` | `platform` | `'<rect x="10" y="10.5" width="12" height="8" rx="1"/><path d="M13.5 22h5M16 18.5V22"/>'` |
| `mobile-app` | `platform` | `'<rect x="12.5" y="9.5" width="7" height="13" rx="1.5"/><circle class="badge-dot" cx="16" cy="20" r=".8"/>'` |
| `dedicated-endpoints` | `platform` | `'<circle cx="16" cy="16" r="5.8"/><circle class="badge-dot" cx="16" cy="16" r="1.8"/>'` |
| `reserved-capacity` | `platform` | `'<path d="M11.5 21v-4M16 21V11M20.5 21v-7"/>'` |
| `apple-metal` | `platform` | `badgeLettering("MTL")` |
| `amd-rocm` | `platform` | `badgeLettering("ROC")` |
| `npu` | `platform` | `badgeLettering("NPU")` |

`time-aware-recall` and `dedicated-endpoints` both start with the same circle but differ as whole strings, so the uniqueness test passes.

Change the cap and the two mappers, and add the three functions below `cardBadgeGlossary`:

```js
  const MAX_CARD_BADGES = 6;
```

```js
      .map(id => ({ id, name: CARD_BADGES[id].name, definition: CARD_BADGES[id].definition, family: CARD_BADGES[id].family }));
```

In `cardBadgeGlossary`, the `entries.set` object gains `family: CARD_BADGES[id].family` after `definition`.

```js
  // Emblems are decoration: the card, the legend, and Taxonomy print the badge
  // name as text (visible or visually hidden) beside them.
  function emblemSVG(familyId, glyph) {
    const inner = glyph ? `<g class="badge-glyph">${glyph}</g>` : "";
    return `<svg class="badge-emblem" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path class="badge-frame" d="${BADGE_FAMILIES[familyId].frame}"/>${inner}</svg>`;
  }
  function badgeEmblem(badgeId) {
    return emblemSVG(CARD_BADGES[badgeId].family, CARD_BADGES[badgeId].glyph);
  }
  function familyEmblem(familyId) {
    return emblemSVG(familyId, "");
  }

  // What the Directory legend shows for a scope: the badges its cards can
  // carry, grouped by family, or only the families where cards of every kind
  // mix. null means the scope shows no badges at all.
  function badgeLegend(collection, systemFamily = "") {
    if (collection === "all" || collection === "packs") {
      return { mode: "families", families: Object.entries(BADGE_FAMILIES).map(([id, family]) => ({ id, name: family.name, meaning: family.meaning })) };
    }
    const systemKeys = Object.keys(CARD_BADGE_SETS).filter(key => key.startsWith("system:"));
    const keys = collection === "systems" ? (systemFamily ? [`system:${systemFamily}`] : systemKeys)
      : collection === "inference" ? ["inference"]
      : collection === "runtimes" ? ["runtime"]
      : [];
    const ids = [...new Set(keys.flatMap(key => (Object.hasOwn(CARD_BADGE_SETS, key) ? CARD_BADGE_SETS[key] : [])))];
    if (!ids.length) return null;
    const order = Object.keys(BADGE_FAMILIES);
    ids.sort((a, b) => order.indexOf(CARD_BADGES[a].family) - order.indexOf(CARD_BADGES[b].family));
    return { mode: "badges", badges: ids.map(id => ({ id, name: CARD_BADGES[id].name, family: CARD_BADGES[id].family })) };
  }
```

Add `BADGE_FAMILIES`, `badgeEmblem`, `badgeLegend`, `familyEmblem` to the returned export object, keeping it alphabetical the way the list already is (uppercase constants first).

Add to `web/styles.css`, directly after the `.card-badge::before` rule (Task 2 replaces the surrounding rules; these three lines stay):

```css
[data-family="control"] { color: var(--cyan); }
[data-family="capability"] { color: var(--violet); }
[data-family="platform"] { color: var(--amber); }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `/usr/local/bin/node --test tests/test_web.js 2>&1 | tail -8`
Expected: `# fail 0`.

- [ ] **Step 5: Stamp and commit**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app-core.js web/styles.css web/index.html tests/test_web.js
git commit -m "Give card badges families, glyphs, and scope-aware legend data"
```

The e2e test "shows its first four badges" now fails because five text pills render; Task 2 fixes it in the next commit. If the pre-commit browser hook blocks this commit, fold Task 2 into the same commit instead of skipping the hook.

---

### Task 2: Render badges as tinted emblems

**Files:**
- Modify: `web/app.js:620-627` (`badgeRow`)
- Modify: `web/styles.css` (`.card-badges`, `.card-badge`, `.card-badge::before`, near line 797)
- Test: `tests/e2e/card-badges.spec.js`

**Interfaces:**
- Consumes: `AtlasCore.badgeEmblem(id)`, `cardBadges()` entries with `family`.
- Produces: DOM contract used by Tasks 3 and 4 — `li.card-badge[data-badge="<id>"][data-family="<family>"][data-name][data-definition]` containing `svg.badge-emblem` and `span.visually-hidden` with text `Name: definition`; no `title`.

- [ ] **Step 1: Update the e2e expectations**

In `tests/e2e/card-badges.spec.js`, replace the first test with:

```js
test("an agent-system card shows every matching badge as an emblem in set order", async ({ page }) => {
  const expected = cardBadges("system", openclaw);
  expect(expected.map(badge => badge.name)).toEqual(["Local-first", "Sandboxed execution", "Browser control", "MCP", "Self-hostable"]);

  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(openclaw.name);
  const card = page.locator('#project-grid .project-card:has([data-project="openclaw"])');
  await expect(card.locator(".card-badge")).toHaveText(namePatterns(expected));
  await expect(card.locator(".card-badge svg.badge-emblem")).toHaveCount(expected.length);
  expect(await card.locator(".card-badge").evaluateAll(items => items.map(item => item.dataset.family))).toEqual(expected.map(badge => badge.family));
  // Emblems are icon-only: nothing but the hidden text carries the name.
  const first = card.locator(".card-badge").first();
  expect(await first.evaluate(item => item.innerText.trim())).toBe("");
  await expect(card.locator(".tags")).toHaveCount(0);
});
```

Update the comment above the fixture to `// OpenClaw matches all five agent-system badges, so its card shows the whole set.` In the third test, replace the `title` assertion line with:

```js
  await expect(badges.locator(".card-badge").first()).not.toHaveAttribute("title", /.*/);
```

- [ ] **Step 2: Run and confirm failure**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/card-badges.spec.js`
Expected: first test fails on `svg.badge-emblem` count 0.

- [ ] **Step 3: Implement**

`web/app.js` — replace `badgeRow` and its comment:

```js
// Badges replace the tags row on system, inference-service, and
// local-runtime cards. Each is an icon-only emblem whose frame names its
// family; the name and definition ride in visually hidden text for screen
// readers and in data attributes for the pointer tooltip. Badges are never
// controls and take no tab stop.
function badgeRow(badges) {
  if (!badges.length) return "";
  return `<ul class="card-badges" role="list">${badges.map(badge => `<li class="card-badge" data-badge="${escapeHTML(badge.id)}" data-family="${escapeHTML(badge.family)}" data-name="${escapeHTML(badge.name)}" data-definition="${escapeHTML(badge.definition)}">${AtlasCore.badgeEmblem(badge.id)}<span class="visually-hidden">${escapeHTML(badge.name)}: ${escapeHTML(badge.definition)}</span></li>`).join("")}</ul>`;
}
```

`web/styles.css` — replace the `.card-badge` and `.card-badge::before` rules (keep `.card-badges` and the three `[data-family]` rules):

```css
.card-badge {
  display: inline-flex;
  cursor: help;
}
.badge-emblem {
  display: block;
  width: 1.7rem;
  height: 1.7rem;
}
.badge-frame {
  fill: color-mix(in srgb, currentColor 13%, var(--panel));
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linejoin: round;
}
.badge-glyph {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.badge-glyph .badge-dot,
.badge-glyph text { fill: currentColor; stroke: none; }
.badge-glyph text { font: 700 6.4px var(--font-mono); }
```

- [ ] **Step 4: Run and confirm pass**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/card-badges.spec.js && /usr/local/bin/node --test tests/test_web.js 2>&1 | tail -4`
Expected: 3 passed; `# fail 0` (the colour and radius guards included).

- [ ] **Step 5: Look at it**

Run `uv run python -m http.server 8765 --bind 127.0.0.1 --directory web`, open `http://127.0.0.1:8765/?collection=systems`, and check emblems in light and dark (theme control in the header), plus `?collection=inference` and `?collection=runtimes`. Lettered chips must be legible at card size; if `MTL` crowds the frame, reduce the `text` font to `6px`. Stop the server.

- [ ] **Step 6: Stamp and commit**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/styles.css web/index.html tests/e2e/card-badges.spec.js
git commit -m "Render card badges as tinted family emblems"
```

---

### Task 3: One styled tooltip for hover and tap

**Files:**
- Modify: `web/index.html` (before `<footer>`, after the `#comparison-tray` aside)
- Modify: `web/app.js` (new block after `badgeRow`; one call in the startup wiring near the `#family-filter` listener, line ~2087)
- Modify: `web/styles.css` (after the emblem rules)
- Test: `tests/e2e/card-badges.spec.js`

**Interfaces:**
- Consumes: the `li.card-badge` data attributes from Task 2; `AtlasCore.BADGE_FAMILIES[family].name`.
- Produces: `#badge-tooltip` (hidden when closed) with `.badge-tooltip-family`, `.badge-tooltip-name`, `.badge-tooltip-definition`; `function initBadgeTooltip()`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/card-badges.spec.js`:

```js
test("hovering an emblem explains it and Escape dismisses it", async ({ page }) => {
  const [first] = cardBadges("system", openclaw);
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(openclaw.name);
  const emblem = page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badge').first();
  const tooltip = page.locator("#badge-tooltip");
  await expect(tooltip).toBeHidden();
  await emblem.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator(".badge-tooltip-family")).toHaveText("Control and privacy");
  await expect(tooltip.locator(".badge-tooltip-name")).toHaveText(first.name);
  await expect(tooltip.locator(".badge-tooltip-definition")).toHaveText(first.definition);
  await expect(tooltip).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
});

test("tapping an emblem toggles the tooltip and an outside tap closes it", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  await page.goto("/?collection=systems");
  await page.locator("#project-search").fill(openclaw.name);
  const emblem = page.locator('#project-grid .project-card:has([data-project="openclaw"]) .card-badge').first();
  const tooltip = page.locator("#badge-tooltip");
  await emblem.tap();
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.locator("h1").first().tap();
  await expect(tooltip).toBeHidden();
  await context.close();
});
```

`newContext` does not inherit `baseURL` from the config; if `page.goto("/…")` fails with an invalid URL, pass `baseURL: test.info().project.use.baseURL` into `newContext`.

- [ ] **Step 2: Run and confirm failure**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/card-badges.spec.js`
Expected: the two new tests fail — `#badge-tooltip` not found.

- [ ] **Step 3: Implement**

`web/index.html`, immediately after the closing `</aside>` of `#comparison-tray`:

```html
  <div id="badge-tooltip" class="badge-tooltip" aria-hidden="true" hidden><span class="badge-tooltip-family"></span><strong class="badge-tooltip-name"></strong><span class="badge-tooltip-definition"></span></div>
```

`web/app.js`, after `badgeRow`:

```js
// One tooltip serves every emblem. It is pointer-only help: screen readers
// already get the same words from each badge's hidden text, so the tooltip is
// aria-hidden and emblems stay out of the tab order.
function initBadgeTooltip() {
  const tooltip = $("#badge-tooltip");
  if (!tooltip) return;
  let anchor = null;
  const hide = () => { tooltip.hidden = true; anchor = null; };
  const show = badge => {
    anchor = badge;
    tooltip.dataset.family = badge.dataset.family;
    tooltip.querySelector(".badge-tooltip-family").textContent = AtlasCore.BADGE_FAMILIES[badge.dataset.family]?.name || "";
    tooltip.querySelector(".badge-tooltip-name").textContent = badge.dataset.name;
    tooltip.querySelector(".badge-tooltip-definition").textContent = badge.dataset.definition;
    tooltip.hidden = false;
    const target = badge.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, target.left), window.innerWidth - box.width - margin);
    const below = target.bottom + margin;
    const top = below + box.height > window.innerHeight - margin ? target.top - box.height - margin : below;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
  };
  document.addEventListener("pointerover", event => {
    if (event.pointerType === "touch") return;
    const badge = event.target.closest?.(".card-badge");
    if (badge) show(badge);
    else if (anchor) hide();
  });
  document.addEventListener("click", event => {
    const badge = event.target.closest?.(".card-badge");
    if (badge && badge !== anchor) show(badge);
    else hide();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("resize", hide);
}
```

Call `initBadgeTooltip();` once in the startup wiring, on the line before `$("#family-filter").addEventListener("input", …` (about line 2087).

Setting `style.left/top` from script is positioning, not colour, so the stylesheet guards do not apply. `web/styles.css`, after the emblem rules:

```css
.badge-tooltip {
  position: fixed;
  z-index: 40;
  display: grid;
  gap: .15rem;
  width: min(17rem, calc(100vw - 1rem));
  padding: .6rem .7rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-control);
  background: var(--panel);
  box-shadow: var(--shadow-dialog);
  font-size: .8rem;
  line-height: 1.45;
  pointer-events: none;
}
.badge-tooltip[hidden] { display: none; }
.badge-tooltip-family { font: 600 .6rem var(--font-mono); letter-spacing: .06em; text-transform: uppercase; }
.badge-tooltip-name { color: var(--text); font-size: .86rem; }
.badge-tooltip-definition { color: var(--muted); }
```

`.badge-tooltip` sets no `color` of its own on purpose: `show()` copies the badge's `data-family` onto the tooltip, so the Task 1 `[data-family]` rules tint the family line, while the name and definition set their own colours.

- [ ] **Step 4: Run and confirm pass**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/card-badges.spec.js && /usr/local/bin/node --test tests/test_web.js 2>&1 | tail -4 && npx eslint web/app.js`
Expected: 5 passed; `# fail 0`; eslint silent.

- [ ] **Step 5: Stamp and commit**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/styles.css web/index.html tests/e2e/card-badges.spec.js
git commit -m "Explain badge emblems with one hover and tap tooltip"
```

---

### Task 4: Scope-aware legend strip with a collapsed Key chip

**Files:**
- Modify: `web/index.html` (after `#badge-tooltip`)
- Modify: `web/app.js` (new block after `initBadgeTooltip`; calls in `setDirectoryCollection` line ~545, `activateView` line ~2048, `renderComparisonControls` line ~296, the `#family-filter` listener line ~2087, and after every programmatic `$("#family-filter").value =` assignment: lines ~332, ~478, ~526, ~1256)
- Modify: `web/styles.css`
- Create: `tests/e2e/badge-legend.spec.js`

**Interfaces:**
- Consumes: `AtlasCore.badgeLegend(collection, systemFamily)`, `AtlasCore.badgeEmblem(id)`, `AtlasCore.familyEmblem(id)`, `state.directoryCollection`, `#comparison-tray[hidden]`, `activateView("taxonomy")`.
- Produces: `#badge-legend` (aside), `#badge-legend-items` (ul), `#badge-legend-close`, `#badge-legend-more`, `#badge-legend-chip`; `function syncBadgeLegend()`; localStorage key `atlas.badgeLegend` with values `"open"` / `"closed"`; `body.has-badge-legend` while the strip is open.

- [ ] **Step 1: Write the failing tests**

Create `tests/e2e/badge-legend.spec.js`:

```js
const { test, expect } = require("@playwright/test");
const { badgeLegend } = require("../../web/app-core.js");

const names = legend => legend.badges.map(badge => badge.name);
const legend = page => page.locator("#badge-legend");
const items = page => page.locator("#badge-legend-items > li");

test("the legend lists the active scope's badges and follows the scope", async ({ page }) => {
  await page.goto("/?collection=inference");
  await expect(legend(page)).toBeVisible();
  await expect(items(page)).toHaveText(names(badgeLegend("inference")));

  await page.locator('[data-directory-collection="runtimes"]').click();
  await expect(items(page)).toHaveText(names(badgeLegend("runtimes")));

  await page.locator('[data-directory-collection="systems"][data-directory-family="memory_system"]').click();
  await expect(items(page)).toHaveText(names(badgeLegend("systems", "memory_system")));

  await page.locator('[data-directory-collection="systems"]:not([data-directory-family])').click();
  await expect(items(page)).toHaveText(names(badgeLegend("systems")));
});

test("mixed scopes show only the families, and badge-less views show nothing", async ({ page }) => {
  await page.goto("/");
  await expect(items(page)).toHaveCount(3);
  await expect(items(page).first()).toContainText("Control and privacy");
  await expect(items(page).first()).toContainText("Where your data lives");

  await page.locator('[data-tab="models"]').click();
  await expect(legend(page)).toBeHidden();
  await expect(page.locator("#badge-legend-chip")).toBeHidden();

  await page.locator('[data-tab="taxonomy"]').click();
  await expect(legend(page)).toBeHidden();
});

test("closing the legend leaves a Key chip and the choice survives a reload", async ({ page }) => {
  await page.goto("/?collection=systems");
  const chip = page.locator("#badge-legend-chip");
  await expect(chip).toBeHidden();
  await page.locator("#badge-legend-close").click();
  await expect(legend(page)).toBeHidden();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-expanded", "false");

  await page.reload();
  await expect(legend(page)).toBeHidden();
  await expect(chip).toBeVisible();

  await chip.click();
  await expect(legend(page)).toBeVisible();
  await expect(chip).toBeHidden();
});

test("the legend yields to the comparison tray", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(legend(page)).toBeVisible();
  await page.locator("#project-grid [data-compare-id]").first().click();
  await expect(page.locator("#comparison-tray")).toBeVisible();
  await expect(legend(page)).toBeHidden();
  await expect(page.locator("#badge-legend-chip")).toBeVisible();
});

test("the open legend never covers the site footer, and phones start collapsed", async ({ page, browser }) => {
  await page.goto("/?collection=inference");
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const footer = await page.locator("footer").boundingBox();
  const strip = await legend(page).boundingBox();
  expect(footer.y + footer.height).toBeLessThanOrEqual(strip.y + 1);

  const phone = await browser.newContext({ viewport: { width: 390, height: 800 }, baseURL: test.info().project.use.baseURL });
  const small = await phone.newPage();
  await small.goto("/?collection=inference");
  await expect(small.locator("#badge-legend")).toBeHidden();
  await expect(small.locator("#badge-legend-chip")).toBeVisible();
  await phone.close();
});

test("All badges opens the Taxonomy glossary without a tab stop on any emblem", async ({ page }) => {
  await page.goto("/?collection=systems");
  await expect(legend(page).locator("svg [tabindex], li[tabindex]")).toHaveCount(0);
  await page.locator("#badge-legend-more").click();
  await expect(page.locator("#taxonomy")).toHaveClass(/is-active/);
});
```

Before relying on the selectors, confirm them: `grep -n 'data-compare-id\|data-tab="models"\|id="taxonomy"' web/index.html web/app.js | head`. If the compare button or the Taxonomy view uses a different attribute or id, use the real one in the tests.

- [ ] **Step 2: Run and confirm failure**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/badge-legend.spec.js`
Expected: all fail — `#badge-legend` not found.

- [ ] **Step 3: Implement**

`web/index.html`, after `#badge-tooltip`:

```html
  <aside id="badge-legend" class="badge-legend" aria-label="Badge key" hidden>
    <h2 class="badge-legend-title">Key</h2>
    <ul id="badge-legend-items" class="badge-legend-items" role="list"></ul>
    <a id="badge-legend-more" class="badge-legend-more" href="?view=taxonomy">All badges</a>
    <button id="badge-legend-close" class="badge-legend-close" type="button" aria-label="Hide badge key">&times;</button>
  </aside>
  <button id="badge-legend-chip" class="badge-legend-chip" type="button" aria-controls="badge-legend" aria-expanded="false" hidden>Key</button>
```

`web/app.js`, after `initBadgeTooltip`:

```js
// The legend explains the emblems of whatever Directory scope is showing. The
// reader's open/closed choice is remembered; without one it starts open on
// wide viewports and closed on phones. It always steps aside for the
// comparison tray, which owns the same edge of the viewport.
const BADGE_LEGEND_STORAGE_KEY = "atlas.badgeLegend";
function badgeLegendPreference() {
  try {
    const stored = localStorage.getItem(BADGE_LEGEND_STORAGE_KEY);
    if (stored === "open" || stored === "closed") return stored;
  } catch {}
  return window.matchMedia("(max-width: 720px)").matches ? "closed" : "open";
}
function setBadgeLegendPreference(value) {
  try { localStorage.setItem(BADGE_LEGEND_STORAGE_KEY, value); } catch {}
  state.badgeLegendPreference = value;
  syncBadgeLegend();
}
function syncBadgeLegend() {
  const strip = $("#badge-legend");
  const chip = $("#badge-legend-chip");
  if (!strip || !chip) return;
  const inDirectory = $(".view.is-active")?.id === "directory";
  const family = state.directoryCollection === "systems" ? $("#family-filter").value : "";
  const legend = inDirectory ? AtlasCore.badgeLegend(state.directoryCollection, family) : null;
  const trayOpen = !$("#comparison-tray").hidden;
  const open = Boolean(legend) && !trayOpen && (state.badgeLegendPreference || badgeLegendPreference()) === "open";
  if (legend) {
    $("#badge-legend-items").innerHTML = legend.mode === "families"
      ? legend.families.map(family => `<li data-family="${escapeHTML(family.id)}">${AtlasCore.familyEmblem(family.id)}<span><strong>${escapeHTML(family.name)}</strong> ${escapeHTML(family.meaning)}</span></li>`).join("")
      : legend.badges.map(badge => `<li data-family="${escapeHTML(badge.family)}">${AtlasCore.badgeEmblem(badge.id)}<span>${escapeHTML(badge.name)}</span></li>`).join("");
  }
  strip.hidden = !open;
  chip.hidden = !legend || open;
  chip.setAttribute("aria-expanded", String(open));
  chip.classList.toggle("is-above-tray", trayOpen);
  document.body.classList.toggle("has-badge-legend", open);
}
function initBadgeLegend() {
  $("#badge-legend-close").addEventListener("click", () => setBadgeLegendPreference("closed"));
  $("#badge-legend-chip").addEventListener("click", () => setBadgeLegendPreference("open"));
  $("#badge-legend-more").addEventListener("click", event => { event.preventDefault(); activateView("taxonomy"); });
  syncBadgeLegend();
}
```

The inner `family` arrow parameter shadows the outer `family` constant; rename the outer one to `systemFamily` if eslint's `no-shadow` is on (`npx eslint web/app.js` tells you).

Add `badgeLegendPreference: null,` to the `state` object literal (line ~21, beside `directoryCollection`).

Wire the calls:

1. `initBadgeLegend();` right after `initBadgeTooltip();`.
2. Last line of `setDirectoryCollection`: `syncBadgeLegend();`
3. In `activateView`, after the `if (id === "directory" || id === "models") renderComparisonControls(); else $("#comparison-tray").hidden = true;` pair: `syncBadgeLegend();`
4. In `renderComparisonControls`, directly after `tray.hidden = records.length === 0;`: `syncBadgeLegend();`
5. In the `#family-filter` `input` listener, as its last statement: `syncBadgeLegend();`
6. Run `grep -n '\$("#family-filter").value =' web/app.js`. For each assignment, check whether `setDirectoryCollection` or `renderComparisonControls` runs afterwards in the same flow; where neither does, add `syncBadgeLegend();` after the assignment. The first e2e test (the Memory switcher click) is the proof.

`web/styles.css`, after the tooltip rules:

```css
.badge-legend {
  position: fixed;
  inset: auto 0 0;
  z-index: 25;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .45rem 1.1rem;
  padding: .55rem max(1.5rem, calc((100% - 1360px) / 2));
  border-top: 1px solid var(--line-strong);
  background: var(--panel-glass);
  backdrop-filter: blur(10px);
  font-size: .78rem;
}
.badge-legend[hidden], .badge-legend-chip[hidden] { display: none; }
.badge-legend-title { margin: 0; color: var(--muted); font: 600 .62rem var(--font-mono); letter-spacing: .08em; text-transform: uppercase; }
.badge-legend-items { display: flex; flex-wrap: wrap; gap: .4rem 1rem; margin: 0; padding: 0; list-style: none; }
.badge-legend-items li { display: inline-flex; align-items: center; gap: .4rem; }
.badge-legend-items span { color: var(--muted); }
.badge-legend-items strong { color: var(--text); font-weight: 600; }
.badge-legend-items li > span:only-of-type { color: var(--text); font-weight: 600; }
.badge-legend .badge-emblem { width: 1.35rem; height: 1.35rem; flex: none; }
.badge-legend-more { margin-left: auto; color: var(--cyan); font-weight: 600; }
.badge-legend-close { border: 0; background: transparent; color: var(--muted); font-size: 1.2rem; line-height: 1; cursor: pointer; }
.badge-legend-close:hover { color: var(--text); }
.badge-legend-chip {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  z-index: 25;
  padding: .4rem .7rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-control);
  background: var(--panel);
  box-shadow: var(--shadow-dialog);
  color: var(--text);
  font: 600 .72rem var(--font-body);
  cursor: pointer;
}
.badge-legend-chip.is-above-tray { bottom: 8.5rem; }
body.has-badge-legend footer { margin-bottom: 4.5rem; }
```

Then check three things in a browser and adjust numbers, not structure: (a) `.badge-legend-items li > span:only-of-type` — in families mode the `li` holds one `span` too, so if the meaning text turns bold, scope the bold rule to badges mode by adding a `data-mode` attribute to `#badge-legend-items` in `syncBadgeLegend` and selecting `[data-mode="badges"] li span`; (b) `4.5rem` must be at least the strip's real height at 1280px and when it wraps at 800px — raise it if the footer test fails; (c) `8.5rem` must clear the comparison tray's real height at 390px.

- [ ] **Step 4: Run and confirm pass**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/badge-legend.spec.js tests/e2e/card-badges.spec.js tests/e2e/footer.spec.js && /usr/local/bin/node --test tests/test_web.js 2>&1 | tail -4 && npx eslint web`
Expected: all pass; `# fail 0`; eslint silent.

- [ ] **Step 5: Run the whole browser suite**

Run: `PATH=/usr/local/bin:$PATH npm run test:e2e`
Expected: all pass. A fixed strip can intercept clicks near the viewport bottom in other specs (pagination, compare buttons). If one fails with "element intercepts pointer events", the fix is in the product, not the test: the strip is covering a control, so increase the Directory's bottom padding (`body.has-badge-legend main { padding-bottom: 4.5rem; }`) rather than hiding the legend in tests.

- [ ] **Step 6: Stamp and commit**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/styles.css web/index.html tests/e2e/badge-legend.spec.js
git commit -m "Add a scope-aware badge legend that collapses to a Key chip"
```

---

### Task 5: Taxonomy glossary grouped by family, with emblems

**Files:**
- Modify: `web/app.js:1274-1309` (`renderTaxonomy`)
- Modify: `web/styles.css` (after `.taxonomy-item p`, line ~893)
- Test: `tests/e2e/card-badges.spec.js`

**Interfaces:**
- Consumes: `AtlasCore.cardBadgeGlossary()` entries with `family`; `AtlasCore.BADGE_FAMILIES`; `AtlasCore.badgeEmblem(id)`.
- Produces: in `#taxonomy-content`, a `section.taxonomy-group[data-badge-family="<id>"]` per family, headed `Card badges · <family name>`, whose items show the emblem.

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/card-badges.spec.js` (and add `BADGE_FAMILIES` to the `require` on line 4):

```js
test("Taxonomy lists every badge under its family with its emblem", async ({ page }) => {
  await page.goto("/?view=taxonomy");
  const glossary = cardBadgeGlossary();
  for (const [id, family] of Object.entries(BADGE_FAMILIES)) {
    const group = page.locator(`#taxonomy-content [data-badge-family="${id}"]`);
    await expect(group.locator("h2")).toHaveText(`Card badges · ${family.name}`);
    await expect(group.locator(".taxonomy-lede")).toHaveText(family.meaning);
    const expected = glossary.filter(entry => entry.family === id);
    await expect(group.locator(".taxonomy-item strong")).toHaveText(expected.map(entry => entry.name));
    await expect(group.locator(".taxonomy-item svg.badge-emblem")).toHaveCount(expected.length);
  }
  await expect(page.locator('#taxonomy-content [data-badge-family="control"] .taxonomy-item').first()).toContainText("Shown on: Agent systems, Memory systems, Assistant systems.");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/card-badges.spec.js -g Taxonomy`
Expected: FAIL — no `[data-badge-family]` element.

- [ ] **Step 3: Implement**

In `renderTaxonomy`, replace the single `["Card badges", …]` group entry with a spread of one group per family, and teach the template three optional fields (`emblem`, `family`, and a group-level `lede`/`badgeFamily`):

```js
  const glossary = AtlasCore.cardBadgeGlossary();
  const badgeGroups = Object.entries(AtlasCore.BADGE_FAMILIES).map(([id, family]) => [
    `Card badges · ${family.name}`,
    glossary.filter(entry => entry.family === id).map(entry => ({
      name: entry.name,
      definition: `${entry.definition} Shown on: ${entry.scopes.join(", ")}.`,
      emblem: AtlasCore.badgeEmblem(entry.id),
      family: id,
    })),
    { lede: family.meaning, badgeFamily: id },
  ]);
```

Put `...badgeGroups,` where the old entry was, and replace the final `innerHTML` assignment with:

```js
  $("#taxonomy-content").innerHTML = groups.map(([name, items, extra = {}]) => `<section class="taxonomy-group"${extra.badgeFamily ? ` data-badge-family="${escapeHTML(extra.badgeFamily)}"` : ""}><h2>${escapeHTML(name)}</h2>${extra.lede ? `<p class="taxonomy-lede">${escapeHTML(extra.lede)}</p>` : ""}<div class="taxonomy-grid">${items.map(item => `<article class="taxonomy-item"${item.family ? ` data-family="${escapeHTML(item.family)}"` : ""}>${item.emblem || ""}<strong>${escapeHTML(item.name)}</strong><p>${escapeHTML(item.definition || item.note || "An explicit comparison trait.")}</p></article>`).join("")}</div></section>`).join("");
```

`web/styles.css`:

```css
.taxonomy-lede { margin: -.3rem 0 .8rem; color: var(--muted); font-size: .9rem; }
.taxonomy-item .badge-emblem { float: right; margin-left: .6rem; }
```

`.taxonomy-item[data-family]` inherits the family colour, which would tint nothing but the emblem because `strong` and `p` set their own colours.

- [ ] **Step 4: Run and confirm pass**

Run: `PATH=/usr/local/bin:$PATH npx playwright test tests/e2e/card-badges.spec.js && /usr/local/bin/node --test tests/test_web.js 2>&1 | tail -4`
Expected: 6 passed; `# fail 0`. If a `test_web.js` test asserts the literal heading `"Card badges"`, update it to the per-family headings.

- [ ] **Step 5: Stamp and commit**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
git add web/app.js web/styles.css web/index.html tests/e2e/card-badges.spec.js
git commit -m "Group the Taxonomy badge glossary by family with emblems"
```

---

### Task 6: Contract text, backlog, and full verification

**Files:**
- Modify: `docs/WEB.md:35-37` ("Card badges") and browser-matrix step 30 (line ~195)
- Modify: `BACKLOG.md` (line ~78 and the badges area near line ~112)
- Modify: `web/app-core.js:327-333` (the comment above `CARD_BADGES`)

- [ ] **Step 1: Rewrite `docs/WEB.md` "Card badges"**

Keep every rule that still holds, verbatim where possible (scanning only; never merit, trust, evidence state, automated signals, or rank; presence-only tests; never repeat a printed fact; shared names test the same field and value; the 10–75% guide; no badges on specifications and models, with the models.dev plain-text attribution; a badge-less card omits the row; `BOOT_FIELDS`; the data-guard instruction). Change or add:

- "up to four badges" → "up to six badges, which today means every match, since no set lists more than five".
- Badges render as icon-only emblems. Each badge has one `family` in `BADGE_FAMILIES` in `web/app-core.js` — Control and privacy (shield, `--cyan`), Capabilities (hexagon, `--violet`), Platform and hardware (rounded square, `--amber`) — and the family decides the frame and accent; `styles.css` colours a family through `[data-family]`.
- One glyph maps to exactly one badge; glyphs are hand-drawn 1.5-unit strokes on a 32-unit viewBox; accelerator badges are lettered `MTL`, `ROC`, `NPU` rather than drawn or borrowed from a vendor mark.
- Replace the sentence about `title`: badges are not controls and take no tab stop; each carries its name and definition in visually hidden text; one shared, `aria-hidden` tooltip shows family, name, and definition on hover and on tap and closes on Escape, scroll, or an outside tap; there is no `title`.
- The legend: a strip fixed to the viewport bottom in the Directory lists the active scope's badges (the union across families in Systems, narrowed by the Family filter), only the three families in All and Agent packs, and nothing elsewhere; it collapses to a Key chip, remembers the choice in `localStorage` under `atlas.badgeLegend`, starts collapsed under 720px, and always yields to the comparison tray. `badgeLegend()` in `web/app-core.js` decides the contents.
- Taxonomy lists badges grouped by family with their emblems.
- Reserved: a triangle frame is held for a possible reviewed-flags tier (for example cyber-capable systems). Flags are judgments, not presence tests, so they need a reviewed field, an evidence bar, and an ADR amending this contract before any data or UI work.

Browser-matrix step 30 becomes: confirm emblems on a system from each family, an inference service, and a local runtime, in both palettes; confirm reviewed and imported models and specifications show none; confirm a badge-less card keeps its footer at the bottom; hover and tap an emblem for its tooltip and dismiss it with Escape; confirm Tab never lands on an emblem; confirm the legend's contents in All, Systems, each Family filter value, Inference services, Local runtimes, and Agent packs, and its absence in Models, Finder, and Taxonomy; close it, reload, and reopen it from the Key chip; select a record for comparison and confirm the legend yields to the tray; scroll to the page footer with the legend open; and find every badge under its family in Taxonomy in both palettes.

- [ ] **Step 2: Update the core comment and the backlog**

In `web/app-core.js`, extend the comment above `CARD_BADGES` with one sentence: `Each badge also names its family (frame and accent) and owns one glyph.`

In `BACKLOG.md`: delete the "Stop card-badge definitions from being announced twice" item (the `title` is gone, so the definition is announced once). Beside the click-to-filter item add:

```markdown
- [ ] Decide whether Atlas should carry reviewed flags, such as cyber-capable systems or systems with advanced, dangerous capabilities, drawn as a triangle-framed emblem beside the badges. Flags are judgments rather than presence tests, so start with an ADR that defines the reviewed field, the evidence bar, and who decides, and that amends the "Card badges" contract in [`docs/WEB.md`](docs/WEB.md); only then design data and UI. The emblem design ([spec](docs/superpowers/specs/2026-09-20-badge-emblems-design.md)) reserves the frame and needs only a new `BADGE_FAMILIES` entry.
```

- [ ] **Step 3: Full local verification**

```bash
/usr/local/bin/node scripts/build_asset_version.mjs
PATH=/usr/local/bin:$PATH pre-commit run --all-files
```

Expected: every hook `Passed`. Fix what fails; do not skip hooks.

- [ ] **Step 4: Browser matrix**

Serve `web/` (`uv run python -m http.server 8765 --bind 127.0.0.1 --directory web`) and walk the rewritten step 30 plus the neighbouring steps the legend can disturb: collection filters, comparison tray and dialog, URL/history restoration, pagination at the bottom of each grid, the theme cycle (step 22), and one record dialog per collection. Do it at 1280px and 390px, in light and dark. Record exactly which steps you ran.

- [ ] **Step 5: Commit**

```bash
git add docs/WEB.md BACKLOG.md web/app-core.js web/index.html
git commit -m "Document badge emblems, the legend, and the reserved flags frame"
```

- [ ] **Step 6: Report**

List the checks actually run with their results, anything that could not run, and any number adjusted from this plan (legend padding, chip offset, lettering size).
