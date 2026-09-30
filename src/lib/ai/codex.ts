import { Codex, type UserInput } from "@openai/codex-sdk";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const CODEX_MODEL = "gpt-5.6-sol";
export const CODEX_REASONING_EFFORT = "medium";
export const CODEX_SERVICE_TIER = "fast";

const codex = new Codex({
  config: {
    service_tier: CODEX_SERVICE_TIER,
    features: { fast_mode: true },
  },
});

// Image-only workers must not inherit the desktop thread's browser/app tools.
const workerPlugins = ["documents@openai-primary-runtime", "spreadsheets@openai-primary-runtime",
  "presentations@openai-primary-runtime", "pdf@openai-primary-runtime", "template-creator@openai-primary-runtime",
  "browser@openai-bundled", "chrome@openai-bundled", "visualize@openai-bundled", "codex-app-tools@openai-bundled",
  "unified-computer-use@openai-bundled", "computer-use@openai-bundled", "sites@openai-curated-remote",
  "google-drive@openai-curated-remote"];
const imageWorker = new Codex({
  env: Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined
    && (!key.startsWith("CODEX_") || key === "CODEX_HOME"))) as Record<string, string>,
  configOverrides: workerPlugins.map((id) => `plugins.${JSON.stringify(id)}.enabled=false`),
  config: {
    service_tier: CODEX_SERVICE_TIER, project_doc_max_bytes: 0, notify: [],
    developer_instructions: "Only return the requested JSON from the supplied images and text. Never use tools, applications, network, files, or other agents. The parent handles persistence.",
    features: { fast_mode: true, shell_tool: false, unified_exec: false, apps: false, js_repl: false, multi_agent: false, code_mode: { enabled: false } },
    mcp_servers: { node_repl: { enabled: false } },
  },
});

function runtimeRoot(): string {
  const dataRoot = process.env.MOTI_DATA_DIR || join(process.cwd(), ".data");
  return join(dataRoot, "codex-runtime");
}

function decodeImage(dataUrl: string): { bytes: Buffer; extension: string } {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error("不支持的图片格式，请使用 PNG、JPEG 或 WebP。");
  const extension = match[1] === "image/jpeg" ? "jpg" : match[1].slice("image/".length);
  return { bytes: Buffer.from(match[2], "base64"), extension };
}

export async function runCodexJson<T>({
  prompt,
  images = [],
  outputSchema,
  signal,
  imageOnly = false,
}: {
  prompt: string;
  images?: string[];
  outputSchema: unknown;
  signal?: AbortSignal;
  imageOnly?: boolean;
}): Promise<T> {
  const root = runtimeRoot();
  const requestDir = join(root, crypto.randomUUID());
  await mkdir(requestDir, { recursive: true });

  try {
    const input: UserInput[] = [{ type: "text", text: prompt }];
    for (const [index, dataUrl] of images.entries()) {
      const image = decodeImage(dataUrl);
      const path = join(requestDir, `image-${index + 1}.${image.extension}`);
      await writeFile(path, image.bytes);
      input.push({ type: "local_image", path });
    }

    const thread = (imageOnly ? imageWorker : codex).startThread({
      model: CODEX_MODEL,
      modelReasoningEffort: CODEX_REASONING_EFFORT,
      threadSource: "moti-local",
      sandboxMode: "read-only",
      approvalPolicy: "never",
      workingDirectory: root,
      skipGitRepoCheck: true,
      networkAccessEnabled: false,
      webSearchMode: "disabled",
    });
    if (imageOnly) {
      const abort = new AbortController();
      const stream = await thread.runStreamed(input, { outputSchema,
        signal: signal ? AbortSignal.any([signal, abort.signal]) : abort.signal });
      let answer = "";
      for await (const event of stream.events) {
        if ("item" in event && !["reasoning", "agent_message"].includes(event.item.type)) {
          abort.abort();
          throw new Error("Image worker attempted to use a tool");
        }
        if (event.type === "item.completed" && event.item.type === "agent_message") answer = event.item.text;
        if (event.type === "error" || event.type === "turn.failed") throw new Error("Image worker failed");
      }
      return JSON.parse(answer) as T;
    }
    const turn = await thread.run(input, { outputSchema, signal });
    return JSON.parse(turn.finalResponse) as T;
  } finally {
    await rm(requestDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
