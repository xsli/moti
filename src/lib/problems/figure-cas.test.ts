import { test } from "node:test";
import assert from "node:assert/strict";
import { isFlatRedrawSvg, replaceFigureMedia } from "./figure-cas.ts";
const original = "data:image/png;base64,YQ==";
const f = { id: "a", title: "A", image: original, svg: "", subproblem: 2 };
test("flat SVG permits normal font-style but rejects active content", () => {
  assert.equal(isFlatRedrawSvg('<svg><text font-style="italic">A</text><path d="M1 2 L3 4"/></svg>'), true);
  for (const s of ['<svg onload="bad()"/>', '<svg><style>text{}</style></svg>', '<svg><script/></svg>',
    '<svg><text style="fill:red">A</text></svg>', '<svg><path href="https://example.com"/></svg>',
    '<svg><path fill="url(https://example.com)"/></svg>', '<!ENTITY x SYSTEM "file:///x"><svg/>']) {
    assert.equal(isFlatRedrawSvg(s), false);
  }
});
test("CAS preserves earliest raster and all non-media and sibling fields", () => {
  const other = { id: "b", image: "other" };
  const current = [{ ...f, originalImage: original, image: "old-redraw" }, other];
  const out = replaceFigureMedia(current, { ...current[0] }, "new-redraw")!;
  assert.equal(out[0].originalImage, original);
  assert.equal(out[0].title, "A");
  assert.equal(out[0].subproblem, 2);
  assert.equal(out[1], other);
  assert.equal(current[0].image, "old-redraw");
});
test("CAS rejects edited/deleted/duplicate target and stale original", () => {
  assert.equal(replaceFigureMedia([{ ...f, title: "edited" }], f, "new"), null);
  assert.equal(replaceFigureMedia([], f, "new"), null);
  assert.equal(replaceFigureMedia([f, f], f, "new"), null);
  assert.equal(replaceFigureMedia([{ ...f, originalImage: "different" }], f, "new"), null);
});
