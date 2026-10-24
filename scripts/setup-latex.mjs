import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { buildGaokaoLatex } from "../src/lib/paper/gaokao-latex.ts";
import { buildKnowledgeLatex } from "../src/lib/ai/knowledge-pdf-template.ts";

const root = path.resolve(".local-tools/tectonic");
const executable = process.env.MOTI_TECTONIC_PATH || path.join(root, process.platform === "win32" ? "tectonic.exe" : "tectonic");
try { await access(executable); }
catch {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Install Tectonic 0.17 and set MOTI_TECTONIC_PATH to its absolute path.");
  console.log("Downloading the pinned Tectonic 0.17.0 compiler...");
  const response = await fetch("https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-x86_64-pc-windows-msvc.zip");
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const zip = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(zip).digest("hex") !== "f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f") throw new Error("Compiler checksum mismatch");
  const files = unzipSync(zip);
  const binary = Object.entries(files).find(([name]) => path.basename(name) === "tectonic.exe")?.[1];
  if (!binary) throw new Error("Compiler missing in archive");
  await mkdir(root, { recursive: true });
  await writeFile(executable, binary);
}
const directory = await mkdtemp(path.join(tmpdir(), "moti-latex-setup-"));
try {
  // First-run setup may download TeX resources. Normal requests are cache-only.
  for (const name of await readdir("public/vendor/exam-zh")) {
    if (/\.(cls|sty)$/.test(name)) await writeFile(path.join(directory, name), await readFile(path.join("public/vendor/exam-zh", name)));
  }
  const source = buildGaokaoLatex([{
    kind: "problem", role: "practice", number: 1, label: "1.", blankLines: 5,
    problem: { id: "setup", title: "Setup", tags: ["单选题"], figures: [], notes: "",
      stem: String.raw`求 $x^2$。 A. $1$ B. $2$ C. $3$ D. $4$`,
      correctAnswer: "$1$", analysis: "代入计算。",
    },
  }], { title: "数学", withAnswers: true });
  console.log("Preparing Chinese fonts and TeX packages (first run can take several minutes)...");
  const notes = buildKnowledgeLatex({
    generatedAt: 0, fingerprint: "setup", sources: [{ id: "setup", title: "排版检查" }],
    content: {
      title: "数学方法笔记", takeaway: "读懂条件，整理思路。", uncertainties: [],
      concepts: [{ title: "整数条件", explanation: String.raw`$n\in\mathbb Z$，$n\equiv1\pmod 2$。`, problemIds: ["setup"] }],
      methods: [{ title: "因式分解", signal: "观察结构", idea: "化为乘积", steps: ["提取公因式"],
        example: String.raw`$$x^2+2x+1=(x+1)^2$$`, pitfalls: "检查范围", problemIds: ["setup"] }],
      checklist: ["检查定义域"], selfChecks: [{ question: "为什么要检查分母？", answer: String.raw`分母不能为零，如 $\frac1x$ 要求 $x\ne0$。` }],
      coverage: [{ problemId: "setup", takeaway: "先看结构" }],
    },
  });
  for (const tex of [source.student, source.teacher, notes]) {
    await writeFile(path.join(directory, "setup.tex"), tex);
    execFileSync(executable, ["--untrusted", "setup.tex"], {
      cwd: directory, stdio: "inherit", windowsHide: true, timeout: 900_000,
      env: { ...process.env, TECTONIC_CACHE_DIR: path.join(root, "cache") },
    });
  }
  console.log("LaTeX PDF compiler is ready.");
} finally { await rm(directory, { recursive: true, force: true }); }
