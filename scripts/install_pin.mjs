// The one place a generator checks that node_modules is what CI will install.
//
// Two generators copy bytes out of installed packages rather than reading the
// repository: build_logos.mjs vendors card marks from @lobehub/icons-static-svg and
// simple-icons, and build_fonts.mjs vendors @font-face blocks and woff2 files from
// three @fontsource packages. Their output is committed and their `--check` mode
// compares that output against a fresh computation, so the whole check rests on one
// unstated assumption: that the packages installed here are the packages CI installs.
//
// That assumption failed on 2026-09-30 and it failed quietly, which is the part worth
// remembering. A local node_modules held simple-icons 16.32.0 while package.json and
// package-lock.json both pinned 16.33.0. Every local `--check` passed, twice, and the
// committed logos.json was rejected by CI's freshness hook on two consecutive runs,
// because logos.json records the version that produced it and 16.32.0 was the truth
// locally and nowhere else. Nothing in the repository contradicted a stale install: the
// lockfile said 16.33.0, the artifact said 16.32.0, and no check compared them.
//
// So a generator that reads node_modules states its packages here first and refuses to
// run when the install has drifted, naming the fix. That moves the failure from CI to
// the author's machine, before a wrong artifact exists, instead of after one is merged
// or force-pushed twice. A version bump is a deliberate act in this repository; the bump
// procedure in docs/RUNBOOKS.md runs the full verification, and now the first thing
// that verification can say is that the install is not the one it is about to bless.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readLock() {
  return JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
}

/** The version `npm ci` installs, which is package-lock.json's to decide. */
export function pinnedVersion(name, lock = readLock()) {
  const entry = lock.packages?.[`node_modules/${name}`];
  if (!entry?.version) throw new Error(`${name} is not a declared dependency in package-lock.json`);
  return entry.version;
}

/** The version actually on disk, or null when the package is not installed at all. */
export function installedVersion(name) {
  const manifest = join(root, "node_modules", name, "package.json");
  if (!existsSync(manifest)) return null;
  return JSON.parse(readFileSync(manifest, "utf8")).version;
}

/**
 * Every named package whose installed version is not the pinned one. Pure, so a test can
 * hand it versions that cannot occur on this machine and assert the diagnosis without
 * breaking the real install. A name the lockfile never declared is not drift and is not
 * caught here: that is a repository defect `npm ci` cannot fix, and `pinnedVersion`
 * throws for it with a message that says so.
 */
export function installDrift(names, { pinned = pinnedVersion, installed = installedVersion } = {}) {
  return names.flatMap(name => {
    const locked = pinned(name);
    const found = installed(name);
    if (found === locked) return [];
    return [{
      name,
      installed: found,
      locked,
      problem: found === null ? "not installed" : `installed ${found}, pinned ${locked}`,
    }];
  });
}

/**
 * Throw unless every named package is installed at its pinned version. Call this at the
 * top of any generator that reads node_modules, before it writes or compares anything.
 */
export function assertPinnedInstall(names, resolvers = {}) {
  const drift = installDrift(names, resolvers);
  if (!drift.length) return;
  const detail = drift.map(item => `  ${item.name}: ${item.problem}`).join("\n");
  throw new Error(
    `node_modules does not match package-lock.json:\n${detail}\n\n` +
      "A generator reads these packages, so their bytes end up in a committed file that " +
      "CI regenerates from the pinned versions. Generating from a different install " +
      "produces an artifact the freshness hook will reject, however correct it looks " +
      "here. Run `npm ci --ignore-scripts`, then run this generator again.",
  );
}
