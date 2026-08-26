import type { ExtractedProblem } from "@/lib/ai/extract";

export type CaptureHold = {
  images: string[];
  text: string;
  collectionId: string;
  jobId: string;
  drafts: Array<ExtractedProblem & { sourceImage?: string }>;
  index: number;
  stage: "idle" | "loading" | "review";
};

const memory: CaptureHold = {
  images: [],
  text: "",
  collectionId: "",
  jobId: "",
  drafts: [],
  index: 0,
  stage: "idle",
};

const META_KEY = "moti-capture-meta";
const CACHE = "moti-capture-blobs";

type Meta = {
  text: string;
  collectionId: string;
  jobId: string;
  index: number;
  stage: CaptureHold["stage"];
  imageCount: number;
  draftCount: number;
};

function blobFromDataUrl(url: string): Promise<Blob> {
  return fetch(url).then((res) => res.blob());
}

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function peekCaptureHold(): CaptureHold {
  return memory;
}

export function writeCaptureHold(patch: Partial<CaptureHold>): CaptureHold {
  Object.assign(memory, patch);
  if (typeof sessionStorage !== "undefined" && memory.jobId) {
    try {
      sessionStorage.setItem("moti-capture-job", memory.jobId);
    } catch {
      /* ignore */
    }
  }
  return memory;
}

export async function persistCaptureHold(): Promise<void> {
  if (typeof sessionStorage === "undefined" || typeof caches === "undefined") return;
  const meta: Meta = {
    text: memory.text,
    collectionId: memory.collectionId,
    jobId: memory.jobId,
    index: memory.index,
    stage: memory.stage,
    imageCount: memory.images.length,
    draftCount: memory.drafts.length,
  };
  try {
    sessionStorage.setItem(META_KEY, JSON.stringify(meta));
    if (memory.jobId) sessionStorage.setItem("moti-capture-job", memory.jobId);
  } catch {
    /* ignore */
  }
  try {
    const cache = await caches.open(CACHE);
    await Promise.all(
      memory.images.map(async (url, i) => {
        const blob = await blobFromDataUrl(url);
        await cache.put(`/img/${i}`, new Response(blob));
      }),
    );
    await Promise.all(
      memory.drafts.map(async (draft, i) => {
        const { sourceImage, ...rest } = draft;
        await cache.put(
          `/draft/${i}`,
          new Response(JSON.stringify(rest), { headers: { "content-type": "application/json" } }),
        );
        if (sourceImage) {
          await cache.put(`/draft-img/${i}`, new Response(await blobFromDataUrl(sourceImage)));
        }
      }),
    );
  } catch {
    /* quota — meta/jobId still in sessionStorage */
  }
}

export async function loadCaptureHold(): Promise<CaptureHold | null> {
  if (memory.images.length || memory.jobId || memory.drafts.length) return memory;
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(META_KEY);
  const jobOnly = sessionStorage.getItem("moti-capture-job") ?? "";
  if (!raw && !jobOnly) return null;
  let meta: Meta | null = null;
  try {
    meta = raw ? (JSON.parse(raw) as Meta) : null;
  } catch {
    meta = null;
  }
  memory.text = meta?.text ?? "";
  memory.collectionId = meta?.collectionId ?? "";
  memory.jobId = meta?.jobId || jobOnly;
  memory.index = meta?.index ?? 0;
  memory.stage = meta?.stage === "review" || meta?.stage === "loading" ? meta.stage : memory.jobId ? "loading" : "idle";
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(CACHE);
      const imageCount = meta?.imageCount ?? 0;
      const images: string[] = [];
      for (let i = 0; i < imageCount; i++) {
        const res = await cache.match(`/img/${i}`);
        if (!res) break;
        images.push(await dataUrlFromBlob(await res.blob()));
      }
      memory.images = images;
      const draftCount = meta?.draftCount ?? 0;
      const drafts: CaptureHold["drafts"] = [];
      for (let i = 0; i < draftCount; i++) {
        const res = await cache.match(`/draft/${i}`);
        if (!res) break;
        const item = (await res.json()) as ExtractedProblem;
        const img = await cache.match(`/draft-img/${i}`);
        drafts.push({
          ...item,
          sourceImage: img ? await dataUrlFromBlob(await img.blob()) : undefined,
        });
      }
      memory.drafts = drafts;
    } catch {
      /* keep meta */
    }
  }
  if (!memory.images.length && !memory.jobId && !memory.drafts.length) return null;
  return memory;
}

export async function clearCaptureHold(): Promise<void> {
  memory.images = [];
  memory.text = "";
  memory.jobId = "";
  memory.drafts = [];
  memory.index = 0;
  memory.stage = "idle";
  try {
    sessionStorage.removeItem(META_KEY);
    sessionStorage.removeItem("moti-capture-job");
  } catch {
    /* ignore */
  }
  try {
    await caches.delete(CACHE);
  } catch {
    /* ignore */
  }
}
