// Reads cited pages the way a reader's browser shows them, so a review quotes
// the page itself rather than a search-engine extract of it. The 2026-09-25 lab
// re-read (docs/LAB_REREAD_2026-09-25.md) found claims no page made and a
// filing that was another company's annual report, all read through extracts.
//
//   node scripts/read_page.mjs [options] URL...
//
// Each URL is saved to --out as <slug>.txt, headed by URL, FINAL, STATUS, and
// TITLE lines; a PDF response is saved as <slug>.pdf for text extraction.
//   --headed          use a full browser window; run under `xvfb-run -a` when
//                     there is no display. Some pages render only this way.
//   --full-text       save textContent instead of innerText, which keeps text
//                     in collapsed sections and very long filings.
//   --from PAGE       open PAGE first and follow its link to each URL, for a
//                     document its host serves only to a reader arriving from it.
//   --user-agent UA   declare the client, as SEC EDGAR asks automated tools to.
//   --wait MS         extra settle time after load (default 2500).
//
// The browser goes through HTTPS_PROXY when it is set, and CHROMIUM_PATH names a
// browser binary when Playwright's own download is not installed. The script never solves
// a challenge or disguises the browser: a page it cannot read is recorded as
// unreadable and replaced with a first-party page that can be read.
/* global document */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

function parse(argv) {
  const options = { headed: false, fullText: false, from: null, userAgent: null, wait: 2500, out: "page-reads", urls: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--headed") options.headed = true;
    else if (arg === "--full-text") options.fullText = true;
    else if (arg === "--from") options.from = argv[++i];
    else if (arg === "--user-agent") options.userAgent = argv[++i];
    else if (arg === "--wait") options.wait = Number(argv[++i]);
    else if (arg === "--out") options.out = argv[++i];
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else options.urls.push(arg);
  }
  if (!options.urls.length) throw new Error("usage: node scripts/read_page.mjs [options] URL...");
  return options;
}

const slug = url => url.replace(/^https?:\/\//, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);

async function read(context, url, options) {
  const page = await context.newPage();
  // Capture the body of a PDF before the browser's viewer takes it over.
  const client = await context.newCDPSession(page);
  let pdf = null;
  client.on("Fetch.requestPaused", async event => {
    const type = (event.responseHeaders || []).find(h => h.name.toLowerCase() === "content-type");
    if (event.responseStatusCode === 200 && type && /pdf/i.test(type.value)) {
      const body = await client.send("Fetch.getResponseBody", { requestId: event.requestId });
      pdf = Buffer.from(body.body, body.base64Encoded ? "base64" : "utf8");
    }
    await client.send("Fetch.continueRequest", { requestId: event.requestId }).catch(() => {});
  });
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Response", resourceType: "Document" }] });
  let status = null;
  try {
    if (options.from) {
      await page.goto(options.from, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(options.wait);
      await page.evaluate(target => {
        const link = document.createElement("a");
        link.href = target;
        document.body.appendChild(link);
        link.click();
      }, url);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    } else {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      status = response ? response.status() : null;
    }
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(options.wait);
  } catch (error) {
    if (!pdf) throw error;
  }
  const base = join(options.out, slug(url));
  if (pdf) {
    writeFileSync(`${base}.pdf`, pdf);
    console.log(`${url}\tPDF\t${pdf.length} bytes\t${base}.pdf`);
  } else {
    const title = await page.title();
    const text = await page.evaluate(full => (full ? document.body.textContent : document.body.innerText), options.fullText);
    writeFileSync(`${base}.txt`, `URL: ${url}\nFINAL: ${page.url()}\nSTATUS: ${status}\nTITLE: ${title}\n\n${text}`);
    console.log(`${url}\t${status}\t${text.length} chars\t${JSON.stringify(title.slice(0, 80))}\t${base}.txt`);
  }
  await page.close();
}

async function main() {
  const options = parse(process.argv.slice(2));
  mkdirSync(options.out, { recursive: true });
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const executable = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const browser = await chromium.launch({ headless: !options.headed, ...executable, ...(proxy ? { proxy: { server: proxy } } : {}) });
  const context = await browser.newContext({ locale: "en-US", ...(options.userAgent ? { userAgent: options.userAgent } : {}) });
  let failures = 0;
  for (const url of options.urls) {
    try {
      await read(context, url, options);
    } catch (error) {
      failures += 1;
      console.log(`${url}\tERROR\t${String(error.message).split("\n")[0]}`);
    }
  }
  await browser.close();
  process.exitCode = failures ? 1 : 0;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 2;
});
