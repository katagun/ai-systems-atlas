// Stamps every local asset reference in web/index.html with a query string
// derived from that file's content, so a browser that cached styles.css or
// app.js under the previous version can never pair it with a newer page. A
// hand-maintained `?v=` failed exactly that way once: two changes shipped
// under the same number and readers saw the new markup with the old
// stylesheet and script. Run `node scripts/build_asset_version.mjs` after
// changing any file under web/ that index.html references; `--check`
// recomputes in memory and fails when the committed page differs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = join(root, "web", "index.html");
const REFERENCE = /((?:href|src)=")([\w./-]+)\?v=[^"]*(")/g;

// The catalog files app.js fetches. They are content-addressed the same way as
// the stylesheet and the scripts, so the app can drop `cache: "no-store"` and
// let the browser keep 261 KB of gzipped JSON between visits: a change to any
// of them changes its URL, so a stale copy can never be served under it.
const DATA_FILES = [
  "projects.json", "taxonomy.json", "license-evidence.json", "specifications.json",
  "inference-services.json", "local-runtimes.json", "logos.json",
];
const DATA_VERSIONS = /(<script type="application\/json" id="data-versions">)[^<]*(<\/script>)/;

export function assetVersion(contents) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 12);
}

export function stampAssetVersions(html, readAsset) {
  const stamped = html.replace(
    REFERENCE,
    (_, open, file, close) => `${open}${file}?v=${assetVersion(readAsset(file))}${close}`,
  );
  const versions = Object.fromEntries(
    DATA_FILES.map(file => [file, assetVersion(readAsset(file))]),
  );
  return stamped.replace(DATA_VERSIONS, (_, open, close) => `${open}${JSON.stringify(versions)}${close}`);
}

export { DATA_FILES };

const committed = readFileSync(indexPath, "utf8");
const stamped = stampAssetVersions(committed, file => readFileSync(join(root, "web", file)));
if (process.argv.includes("--check")) {
  if (stamped !== committed) {
    console.error("web/index.html references an asset under a stale version; run node scripts/build_asset_version.mjs");
    process.exit(1);
  }
  console.log("asset versions match their file contents");
} else if (stamped === committed) {
  console.log("asset versions already current");
} else {
  writeFileSync(indexPath, stamped);
  console.log("stamped asset versions in web/index.html");
}
