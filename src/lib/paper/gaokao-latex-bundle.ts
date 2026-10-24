import { strToU8, zip } from "fflate";
import type { ExamItem } from "./layout";
import type { Figure } from "../problems/types";
import { buildGaokaoLatex, EXAM_ZH_FILES, EXAM_ZH_REVISION, type GaokaoLatexOptions } from "./gaokao-latex";

export async function pictureBytes(figure: Figure): Promise<Uint8Array> {
  if (/^data:image\/(?:png|jpeg);base64,/.test(figure.image ?? "")) {
    return Uint8Array.from(atob(figure.image!.split(",")[1]), c => c.charCodeAt(0));
  }
  const src = figure.image || `data:image/svg+xml;charset=utf-8,${encodeURIComponent(figure.svg)}`;
  if (!src.startsWith("data:image/")) throw new Error("配图必须是题库内保存的图片");
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(3, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法转换配图");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("配图转换失败")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function buildGaokaoLatexBundle(items: ExamItem[], options: GaokaoLatexOptions) {
  const source = buildGaokaoLatex(items, options);
  const files: Record<string, Uint8Array> = { "student.tex": strToU8(source.student) };
  if (source.teacher) files["teacher.tex"] = strToU8(source.teacher);
  for (const asset of source.assets) files[asset.path] = await pictureBytes(asset.figure);
  for (const name of EXAM_ZH_FILES) {
    const response = await fetch(`/vendor/exam-zh/${name}`);
    if (!response.ok) throw new Error(`模板文件读取失败：${name}`);
    const text = await response.text();
    if (text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html")) throw new Error(`模板文件不存在：${name}`);
    files[name] = strToU8(text);
  }
  files["README.txt"] = strToU8([
    "高考数学 LaTeX 组卷（解集 / Moti）",
    "",
    "student.tex：学生试卷，不包含答案、解析文本。",
    ...(source.teacher ? ["teacher.tex：教师版，附题干、答案和完整解析。仅将 student.pdf 发给学生。"] : []),
    "images/：题库配图，保持题干和解析中的位置。",
    "",
    "编译：使用完整 TeX Live 2024 或更新版本的 XeLaTeX。",
    "解压后运行 compile.cmd，或执行：",
    "  xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error student.tex",
    "重复执行一次以更新总页数。teacher.tex 同理。",
    "也可将整个 ZIP 上传至 Overleaf，编译器选择 XeLaTeX，主文件选 student.tex 或 teacher.tex。",
    "需要完整中文、数学、TikZ 和 exam-zh 所依赖的标准宏包；本包不是独立 TeX 安装程序。",
    "",
    "版式：A4、黑白、Fandol 中文字体、TeX Gyre Termes 西文与数学字体。",
    "题目保持组卷顺序；无自定义分节时按相邻题型分节。选项只在 A–D 均可可靠识别时自动分栏。",
    "分值优先采用排版页的分节设置，否则取题库明确记录；缺失不猜测。选考题不直接累计到整卷满分。",
    "网页预览与普通 PDF 仍使用原模板；此 ZIP 中的 LaTeX 是独立排版。",
    "学生卷不含解析文字；勾选解析后 ZIP 还包含教师版和解析配图，不宜直接发给学生。",
    "题库内容未因导出被重新求解；待核对项目请见下方。",
    "",
    "上游：https://github.com/xkwxdyy/exam-zh",
    `版本：${EXAM_ZH_REVISION}（未修改上游文件）`,
    "上游许可证：LPPL 1.3c，见 LICENSE。上游文件清单见 MANIFEST.md。",
    "完整对应源码可由上述仓库的固定版本获取。",
    "",
    "导出提醒：",
    ...(source.warnings.length ? source.warnings : ["无结构转换提醒；不代表已核对所有数学内容。"]),
  ].join("\r\n"));
  files["compile.cmd"] = strToU8([
    "@echo off", "setlocal", 'cd /d "%~dp0"',
    "where xelatex >nul 2>nul", "if errorlevel 1 (", "  echo Please install TeX Live with XeLaTeX first.", "  pause", "  exit /b 1", ")",
    ...["student", ...(source.teacher ? ["teacher"] : [])].flatMap(name => [
      `xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error ${name}.tex`, "if errorlevel 1 goto failed",
      `xelatex -no-shell-escape -interaction=nonstopmode -halt-on-error ${name}.tex`, "if errorlevel 1 goto failed",
    ]),
    "echo PDF files generated.", "pause", "exit /b 0", ":failed", "echo Compilation failed. See the .log file.", "pause", "exit /b 1",
  ].join("\r\n"));
  const data = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)));
  return { blob: new Blob([new Uint8Array(data)], { type: "application/zip" }), warnings: source.warnings };
}
