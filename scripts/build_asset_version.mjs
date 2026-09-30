// The one implementation of the `?v=` stamp, run at deploy time.
//
// Committed pages carry the PLACEHOLDER below and never a content hash. A hash
// in a committed file is a line that changes whenever any referenced asset
// changes, so two branches that touched *different* assets each rewrote the
// same line and conflicted on nothing else. Resolving that cost a rebase, a
// regeneration, a second commit, and a force-push; the force-push then tripped
// the deploy workflow's `cancel-in-progress` and threw away the verification
// run it started. A placeholder cannot be written by an ordinary branch, so
// that conflict can no longer be expressed. This script replaces the
// placeholder with real hashes in the published artifact, and deploy-pages.yml
// runs it after checkout.
//
//     node scripts/build_asset_version.mjs           # stamp in place, for deploy
//     node scripts/build_asset_version.mjs --check   # the committed tree is unstamped
//
// `--check` is the inverse of the old freshness check, and that inversion is the
// point rather than a loss. It can no longer fail because an asset changed,
// since there is nothing left to restamp. What it does catch is the three ways
// the new convention can be broken: a deploy build that was committed by
// mistake, a reference whose file no longer exists, and a page that dropped the
// token. The coverage the old check gave up — that each stamp really is its
// file's hash — now lives in tests/test_web.js, which calls this module and
// checks the stamped output rather than a committed file.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = join(root, "web");

// What a committed page carries in place of a hash. One token, chosen so a
// reader debugging a cache misses immediately sees that no content hash was
// baked in, and so a stamped page is greppable by its absence.
export const PLACEHOLDER = "BUILD";

const REFERENCE = /((?:href|src)=")([\w./-]+)\?v=[^"]*(")/g;
const REFERENCE_PROBE = /(?:href|src)="([\w./-]+)\?v=([^"]*)"/g;
const DATA_VERSIONS = /(<script type="application\/json" id="data-versions">)[^<]*(<\/script>)/;
const DATA_VERSIONS_PROBE = /<script type="application\/json" id="data-versions">([^<]*)<\/script>/;

// The catalog files app.js fetches. They are content-addressed the same way as
// the stylesheet and the scripts, so the app can drop `cache: "no-store"` and
// let the browser keep 261 KB of gzipped JSON between visits: a change to any
// of them changes its URL, so a stale copy can never be served under it.
const DATA_FILES = [
  "projects.json", "taxonomy.json", "license-evidence.json", "specifications.json",
  "inference-services.json", "local-runtimes.json", "models.json", "models-dev.json", "logos.json",
  "exclusions.json",
  "app/systems.json", "app/inference.json", "app/runtimes.json", "app/specifications.json",
  "app/models.json", "app/packs.json", "app/labs.json", "app/robots.json",
  "app/model-source-details.json",
  "app/search/systems.json", "app/search/inference.json",
  "app/search/runtimes.json", "app/search/specifications.json", "app/search/models.json",
  "app/search/packs.json", "app/search/labs.json", "app/search/robots.json",
];

// 271 detail files would put 8-10 KB of hashes in index.html to save it, so they
// share one stamp over the whole tree. A change to any record busts them all,
// which is the right trade for files fetched on demand and rarely. The name each
// file is hashed under is its slash-separated path *relative to the detail root*,
// so two records swapping contents still move the stamp while a second checkout —
// a CI runner, a worktree whose path carries the branch name — reproduces it byte
// for byte. Hashing the absolute path made `--check` fail everywhere but here.
const DETAIL_VERSION_KEY = "app/detail";

export function assetVersion(contents) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 12);
}

/**
 * Replace every placeholder stamp in one page with its asset's content hash.
 * `readAsset` resolves a page-relative reference, because the app shell and a
 * blog post reach the same stylesheet by different paths.
 */
export function stampAssetVersions(html, readAsset, readDetailTree = () => []) {
  const stamped = html.replace(
    REFERENCE,
    (_, open, file, close) => `${open}${file}?v=${assetVersion(readAsset(file))}${close}`,
  );
  if (!DATA_VERSIONS.test(html)) return stamped;
  // Only the app shell carries a data-versions block, and it sits at the root of
  // web/, so these paths resolve the same way the page's own references do.
  const versions = Object.fromEntries(
    DATA_FILES.map(file => [file, assetVersion(readAsset(file))]),
  );
  const detailFiles = readDetailTree();
  versions[DETAIL_VERSION_KEY] = assetVersion(
    Buffer.concat(detailFiles.flatMap(([name, contents]) => [Buffer.from(name), contents])),
  );
  return stamped.replace(DATA_VERSIONS, (_, open, close) => `${open}${JSON.stringify(versions)}${close}`);
}

export { DATA_FILES, DETAIL_VERSION_KEY };

/** Every committed page carrying the token: the app shell and the whole blog. */
export function pageFiles() {
  const pages = [join(webRoot, "index.html")];
  const blogRoot = join(webRoot, "blog");
  if (existsSync(blogRoot)) {
    for (const name of readdirSync(blogRoot, { recursive: true }).sort()) {
      const file = join(blogRoot, name);
      if (name.endsWith("index.html") && statSync(file).isFile()) pages.push(file);
    }
  }
  return pages;
}

export const readDetailTree = () => {
  const detailRoot = join(webRoot, "app", "detail");
  if (!existsSync(detailRoot)) return [];
  return readdirSync(detailRoot, { recursive: true })
    .filter(name => statSync(join(detailRoot, name)).isFile())
    .map(name => name.split(sep).join("/"))
    .sort()
    .map(name => [name, readFileSync(join(detailRoot, name))]);
};

export const readPageAsset = (pagePath) => (file) => readFileSync(join(dirname(pagePath), file));

/**
 * Everything wrong with a page, judged against `expected`: the placeholder for a
 * committed page, a 12-hex hash for a stamped one. The same walk serves both, so the
 * two halves of the invariant cannot drift into disagreeing about what a good page
 * looks like.
 */
export function violations(pagePath, html, isExpected = (value) => value === PLACEHOLDER) {
  const found = [];
  for (const [, file, value] of html.matchAll(REFERENCE_PROBE)) {
    if (!isExpected(value)) {
      found.push(`?v=${value}, which is not the expected stamp for this tree`);
    } else if (!existsSync(join(dirname(pagePath), file))) {
      found.push(`${file} is referenced but does not exist`);
    }
  }
  const data = html.match(DATA_VERSIONS_PROBE);
  if (data) {
    for (const [file, value] of Object.entries(JSON.parse(data[1]))) {
      if (!isExpected(value)) found.push(`data-versions stamps ${file} as ${value}`);
    }
  }
  return found.map(problem => `${pagePath.slice(root.length + 1)}: ${problem}`);
}

const isPlaceholder = (value) => value === PLACEHOLDER;
const isHash = (value) => /^[0-9a-f]{12}$/.test(value);

function main() {
  const pages = pageFiles();
  // The two checks are opposite halves of one invariant. `--check` is the pre-commit
  // gate and demands placeholders, so a deploy build can never be committed; `--stamped`
  // is the deploy gate and demands hashes, so a placeholder can never be published.
  const check = process.argv.includes("--check");
  const problems = pages.flatMap(page => violations(page, readFileSync(page, "utf8"), check ? isPlaceholder : isHash));
  if (check) {
    if (problems.length) {
      console.error("committed pages must carry the unstamped placeholder:");
      for (const problem of problems) console.error(`  ${problem}`);
      process.exit(1);
    }
    console.log(`no committed page carries a content hash (${pages.length} pages); the deploy job stamps them`);
    return;
  }
  if (process.argv.includes("--stamped")) {
    if (problems.length) {
      console.error("published pages are not fully stamped:");
      for (const problem of problems) console.error(`  ${problem}`);
      process.exit(1);
    }
    console.log(`every reference in ${pages.length} published pages resolved to a content hash`);
    return;
  }
  let stamped = 0;
  for (const page of pages) {
    const committed = readFileSync(page, "utf8");
    const output = stampAssetVersions(committed, readPageAsset(page), readDetailTree);
    if (output !== committed) {
      writeFileSync(page, output);
      stamped += 1;
    }
  }
  console.log(stamped ? `stamped ${stamped} of ${pages.length} pages for deploy` : "pages already stamped");
}

// Only when run as a command. tests/test_web.js imports this module to check the
// stamped output, and an import must not rewrite a working tree.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
