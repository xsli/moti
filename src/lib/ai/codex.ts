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
}: {
  prompt: string;
  images?: string[];
  outputSchema: unknown;
  signal?: AbortSignal;
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

    const thread = codex.startThread({
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
    const turn = await thread.run(input, { outputSchema, signal });
    return JSON.parse(turn.finalResponse) as T;
  } finally {
    await rm(requestDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
