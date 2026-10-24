// Bundle Adobe character maps with the app; no CDN or browser font fallback.
const maps = import.meta.glob<string>("/node_modules/pdfjs-dist/cmaps/*.bcmap", {
  query: "?url", import: "default",
});

export class PdfCMapReader {
  async fetch({ name }: { name: string }) {
    const load = maps[`/node_modules/pdfjs-dist/cmaps/${name}.bcmap`];
    if (!load) throw new Error(`PDF 字符映射缺失：${name}`);
    const url = await load();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PDF 字符映射读取失败：${name}`);
    return { cMapData: new Uint8Array(await response.arrayBuffer()), isCompressed: true };
  }
}
