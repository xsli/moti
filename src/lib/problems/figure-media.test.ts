import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFigureRedraw, restoreFigureOriginal, cleanOriginalImage } from "./figure-media.ts";
import { renderRedrawScene } from "../ai/redraw-schema.ts";
import { abortable } from "../image/abortable.ts";

const original = "data:image/png;base64,aGVsbG8=";
const figure = { id: "figure-1", image: original, svg: "", title: "图1", subproblem: 2 };
test("redraw changes displayed image without losing original or subquestion", () => {
  const first = applyFigureRedraw(figure, "redraw-1");
  assert.equal(first.originalImage, original);
  assert.equal(first.image, "redraw-1");
  assert.equal(first.subproblem, 2);
  const second = applyFigureRedraw(first, "redraw-2");
  assert.equal(second.originalImage, original);
  assert.equal(second.image, "redraw-2");
  assert.equal(figure.image, original);
  assert.equal(restoreFigureOriginal(second).image, original);
  assert.equal(restoreFigureOriginal(second).originalImage, undefined);
});
test("image-less figures are never replaced and original payload limits are enforced", () => {
  const missing = { title: "missing", svg: "" };
  assert.equal(applyFigureRedraw(missing, "new"), missing);
  assert.equal(cleanOriginalImage(original), original);
  assert.equal(cleanOriginalImage("https://external/image.png"), undefined);
  assert.equal(cleanOriginalImage("data:image/png;base64," + "a".repeat(16_000_000)), undefined);
});
const ellipse = { kind: "ellipse", d: "", x: 200, y: 180, rx: 100, ry: 100,
  text: "", fontSize: 24, italic: false, fill: "none", stroke: "black", strokeWidth: 2, dash: "" };
const scene = { approved: true, reason: "", width: 520, height: 400, elements: [ellipse] };
test("circle, shading, dashes and original dimensions survive vector rendering", () => {
  const { svg } = renderRedrawScene({ ...scene, elements: [{ ...ellipse, fill: "#dddddd", dash: "6 4" }] });
  assert.match(svg, /viewBox="0 0 520 400"/);
  assert.match(svg, /rx="100" ry="100"/);
  assert.match(svg, /fill="#dddddd"/);
  assert.match(svg, /stroke-dasharray="6 4"/);
});
test("uncertain, empty and clipped results cannot become the displayed image", () => {
  assert.equal(renderRedrawScene({ ...scene, approved: false, reason: "点名模糊" }).svg, "");
  assert.throws(() => renderRedrawScene({ ...scene, elements: [] }));
  assert.throws(() => renderRedrawScene({ ...scene, elements: [{ ...ellipse, rx: 600 }] }));
});
test("positioned counting labels render without invented geometry, but blank or coincident text does not", () => {
  const labels = Array.from({ length: 10 }, (_, i) => ({ ...ellipse, kind: "text",
    x: 260 + 130 * Math.sin(i * Math.PI / 5), y: 190 - 130 * Math.cos(i * Math.PI / 5),
    rx: 0, ry: 0, text: String(i + 1), fill: "black", stroke: "none" }));
  const { svg } = renderRedrawScene({ ...scene, elements: labels });
  assert.equal((svg.match(/<text /g) || []).length, 10);
  assert.ok(!svg.includes("<path") && !svg.includes("<ellipse"));
  assert.throws(() => renderRedrawScene({ ...scene, elements: labels.map(e => ({ ...e, text: " " })) }));
  assert.throws(() => renderRedrawScene({ ...scene, elements: labels.map(e => ({ ...e, x: 100, y: 100 })) }));
  assert.throws(() => renderRedrawScene({ ...scene, elements: labels.map(e => ({ ...e, fill: "white" })) }));
  assert.equal(renderRedrawScene({ ...scene, approved: false, elements: labels }).svg, "");
});
test("model strings cannot inject SVG, CSS or external references", () => {
  assert.throws(() => renderRedrawScene({ ...scene, elements: [{ ...ellipse, fill: "url(https://example.com)" }] }));
  assert.throws(() => renderRedrawScene({ ...scene, elements: [{ ...ellipse, kind: "path", d: '<script>bad</script>' }] }));
  const { svg } = renderRedrawScene({ ...scene, elements: [ellipse, { ...ellipse, kind: "text", text: '<script>alert("x")</script>' }] });
  assert.ok(!svg.includes("<script>"));
  assert.match(svg, /&lt;script&gt;/);
});
test("skipping a slow redraw rejects immediately, without accepting its late result", async () => {
  const controller = new AbortController();
  let finish!: (s: string) => void;
  const pending = abortable(new Promise<string>((resolve) => { finish = resolve; }), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  finish("late result");
});
