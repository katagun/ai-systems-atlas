// Vendors card logos into web/logos.json from two icon packages:
//   lobe:   @lobehub/icons-static-svg (MIT) — AI-native product and operator marks
//   simple: simple-icons (CC0-1.0) — general developer-tool marks
// Run `npm ci` first, then `node scripts/build_logos.mjs` whenever RECORD_MARKS
// changes. Records absent from RECORD_MARKS render a monogram fallback instead;
// map a record only to a mark that identifies the product itself or the
// maintainer/operator named in its published data.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const RECORD_MARKS = {
  // Systems — agent
  "amazon-quick": "lobe:aws",
  autogen: "lobe:microsoft",
  "bedrock-agentcore": "lobe:bedrock",
  chatgpt: "lobe:openai",
  claude: "lobe:claude",
  "claude-agent-sdk": "lobe:claude",
  "claude-code": "lobe:claudecode",
  "claude-cowork": "lobe:claude",
  cline: "lobe:cline",
  codex: "lobe:codex",
  crewai: "lobe:crewai",
  deepseek: "lobe:deepseek",
  "deepseek-harness": "lobe:deepseek",
  devin: "lobe:devin",
  dify: "lobe:dify",
  "gemini-apps": "lobe:gemini",
  "gemini-cli": "lobe:geminicli",
  "gemini-enterprise-agent-platform": "lobe:gemini",
  genkit: "simple:firebase",
  "google-adk": "lobe:google",
  goose: "lobe:goose",
  grok: "lobe:grok",
  haystack: "simple:haystack",
  "hermes-agent": "lobe:hermesagent",
  "kilo-code": "lobe:kilocode",
  kiro: "lobe:kiro",
  langchain: "lobe:langchain",
  langflow: "simple:langflow",
  langgraph: "lobe:langgraph",
  llamaindex: "lobe:llamaindex",
  mastra: "lobe:mastra",
  "meta-ai": "lobe:metaai",
  "meta-business-agent-platform": "lobe:meta",
  "microsoft-365-copilot": "lobe:copilot",
  "microsoft-agent-framework": "lobe:microsoft",
  "microsoft-copilot": "lobe:copilot",
  "microsoft-copilot-studio": "lobe:copilot",
  "microsoft-foundry-agent-service": "lobe:azureai",
  "mistral-vibe": "lobe:mistral",
  "muse-code": "lobe:meta",
  "openai-agents-sdk": "lobe:openai",
  opencode: "lobe:opencode",
  openhands: "lobe:openhands",
  perplexity: "lobe:perplexity",
  "perplexity-computer": "lobe:perplexity",
  "pydantic-ai": "lobe:pydanticai",
  "replit-agent": "lobe:replit",
  "semantic-kernel": "lobe:microsoft",
  smolagents: "lobe:huggingface",
  "strands-agents-sdk": "lobe:aws",
  "venice-ai": "lobe:venice",
  warp: "simple:warp",
  "watsonx-orchestrate": "lobe:ibm",
  "z-ai": "lobe:zai",
  // Systems — memory
  joplin: "simple:joplin",
  langmem: "lobe:langchain",
  logseq: "simple:logseq",
  milvus: "simple:milvus",
  qdrant: "simple:qdrant",
  siyuan: "simple:siyuan",
  trilium: "simple:trilium",
  // Inference services
  "ai21-studio": "lobe:ai21",
  "alibaba-cloud-model-studio": "lobe:alibabacloud",
  "amazon-bedrock": "lobe:bedrock",
  "anthropic-api": "lobe:anthropic",
  "azure-ai-foundry-models": "lobe:azureai",
  "baidu-qianfan-modelbuilder": "lobe:baiducloud",
  baseten: "lobe:baseten",
  "byteplus-modelark": "simple:bytedance",
  "cerebras-inference": "lobe:cerebras",
  "cloudflare-ai-gateway": "lobe:cloudflare",
  "cloudflare-workers-ai": "lobe:workersai",
  "cohere-api": "lobe:cohere",
  "databricks-foundation-model-apis": "simple:databricks",
  "deepseek-api": "lobe:deepseek",
  deepinfra: "lobe:deepinfra",
  "fireworks-ai": "lobe:fireworks",
  "google-gemini-api": "lobe:gemini",
  groqcloud: "lobe:groq",
  "hugging-face-inference-endpoints": "lobe:huggingface",
  "hugging-face-inference-providers": "lobe:huggingface",
  "ibm-watsonx-ai": "lobe:ibm",
  "meta-model-api": "lobe:meta",
  "minimax-open-platform": "lobe:minimax",
  "mistral-ai-studio": "lobe:mistral",
  "moonshot-ai-open-platform": "lobe:moonshot",
  "nebius-token-factory": "lobe:nebius",
  "nvidia-api-catalog": "lobe:nvidia",
  "ollama-cloud": "lobe:ollama",
  "openai-api": "lobe:openai",
  openrouter: "lobe:openrouter",
  "perplexity-api": "lobe:perplexity",
  "qiniu-ai-inference": "lobe:qiniu",
  replicate: "lobe:replicate",
  "sambanova-cloud": "lobe:sambanova",
  "siliconflow-cn": "lobe:siliconcloud",
  "siliconflow-international": "lobe:siliconcloud",
  "stability-ai-developer-platform": "lobe:stability",
  "stepfun-open-platform": "lobe:stepfun",
  "stepfun-open-platform-global": "lobe:stepfun",
  "tencent-cloud-tokenhub": "lobe:tencentcloud",
  "together-ai": "lobe:together",
  "venice-api": "lobe:venice",
  "vercel-ai-gateway": "lobe:vercel",
  "vertex-ai-generative-ai": "lobe:vertexai",
  "volcengine-ark": "lobe:volcengine",
  "xai-api": "lobe:xai",
  "zai-model-api": "lobe:zai",
  "zhipu-bigmodel": "lobe:zhipu",
  // Local runtimes
  geniex: "simple:qualcomm",
  "lm-studio": "lobe:lmstudio",
  "mlx-lm": "lobe:apple",
  ollama: "lobe:ollama",
  "onnxruntime-genai": "simple:onnx",
  "openvino-model-server": "simple:intel",
  "tensorflow-serving": "simple:tensorflow",
  "tensorrt-llm": "lobe:nvidia",
  vllm: "lobe:vllm",
  xinference: "lobe:xinference",
};

const ALLOWED_TAGS = new Set(["path", "g", "circle", "rect", "ellipse", "polygon"]);

function sanitizeBody(svg, key) {
  const inner = svg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<title>[^<]*<\/title>/g, "")
    .trim();
  for (const [, tag] of inner.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)) {
    if (!ALLOWED_TAGS.has(tag)) throw new Error(`${key}: disallowed <${tag}> — pick a plain mark`);
  }
  if (/\son[a-z]+=|href=|url\(/i.test(inner)) throw new Error(`${key}: disallowed attribute content`);
  return inner;
}

function loadLobe(slug) {
  const file = join(root, "node_modules/@lobehub/icons-static-svg/icons", `${slug}.svg`);
  const svg = readFileSync(file, "utf8");
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (viewBox !== "0 0 24 24") throw new Error(`lobe:${slug}: unexpected viewBox ${viewBox}`);
  if (!svg.includes('fill="currentColor"')) throw new Error(`lobe:${slug}: not a currentColor mark`);
  return sanitizeBody(svg, `lobe:${slug}`);
}

const simpleIcons = await import("simple-icons");
const simpleBySlug = new Map(Object.values(simpleIcons).map(icon => [icon.slug, icon]));

function loadSimple(slug) {
  const icon = simpleBySlug.get(slug);
  if (!icon) throw new Error(`simple:${slug}: no such icon`);
  return `<path d="${icon.path}"/>`;
}

function packageInfo(name) {
  const pkg = JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8"));
  return { package: name, version: pkg.version, license: pkg.license };
}

const knownIds = new Set();
for (const [file, listKey] of [
  ["web/projects.json", "projects"],
  ["web/inference-services.json", "services"],
  ["web/local-runtimes.json", "runtimes"],
]) {
  for (const record of JSON.parse(readFileSync(join(root, file), "utf8"))[listKey]) knownIds.add(record.id);
}

const icons = {};
const records = {};
for (const [recordId, key] of Object.entries(RECORD_MARKS)) {
  if (!knownIds.has(recordId)) throw new Error(`${recordId}: not a published directory record`);
  if (!key) continue;
  const [source, slug] = key.split(":");
  if (!icons[key]) icons[key] = { source, body: source === "lobe" ? loadLobe(slug) : loadSimple(slug) };
  records[recordId] = key;
}

const output = {
  note: "Marks identify third-party products for directory navigation; they remain trademarks of their owners and imply no affiliation or endorsement. Regenerate with scripts/build_logos.mjs.",
  sources: { lobe: packageInfo("@lobehub/icons-static-svg"), simple: packageInfo("simple-icons") },
  icons,
  records,
};
writeFileSync(join(root, "web/logos.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(`web/logos.json: ${Object.keys(records).length} records mapped to ${Object.keys(icons).length} marks; ${knownIds.size - Object.keys(records).length} records fall back to monograms.`);

const unmapped = [...knownIds].filter(id => !(id in RECORD_MARKS)).sort();
if (unmapped.length) console.log(`monogram fallback: ${unmapped.join(", ")}`);
