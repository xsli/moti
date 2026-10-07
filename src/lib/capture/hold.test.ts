import assert from "node:assert/strict";
import { test } from "node:test";
import { clearCaptureHold, loadCaptureHold, persistCaptureHold, writeCaptureHold } from "./hold.ts";

test("text drafts and input modes restore without image caches", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  try {
    await clearCaptureHold();
    writeCaptureHold({ text: "计算 1+1", inputMode: "text", collectionId: "chapter-a", mergePdfPages: false });
    await persistCaptureHold();
    writeCaptureHold({ text: "", inputMode: "image", collectionId: "", mergePdfPages: true });
    const restored = await loadCaptureHold();
    assert.equal(restored?.text, "计算 1+1");
    assert.equal(restored?.inputMode, "text");
    assert.equal(restored?.collectionId, "chapter-a");
    assert.equal(restored?.mergePdfPages, false);
    await clearCaptureHold();
    writeCaptureHold({ inputMode: "pdf", sourceMode: "image" });
    await persistCaptureHold();
    writeCaptureHold({ inputMode: "image" });
    assert.equal((await loadCaptureHold())?.inputMode, "pdf");
    await clearCaptureHold();
    assert.equal(await loadCaptureHold(), null);
  } finally {
    await clearCaptureHold();
    if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
