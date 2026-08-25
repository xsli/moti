import type { Problem } from "./types";

const now = Date.UTC(2026, 7, 18, 8, 0, 0);

export const SEED_PROBLEMS: Problem[] = [
  {
    id: "sample-median",
    createdAt: now,
    updatedAt: now,
    sourceKind: "sample",
    title: "直角三角形斜边上的中线",
    stem: "如图，在 $\\triangle ABC$ 中，$\\angle C = 90^\\circ$，$M$ 为斜边 $AB$ 的中点。求证：$CM = \\dfrac{1}{2}AB$。",
    figures: [
      {
        id: "fig-median",
        title: "直角三角形与斜边中线",
        caption: "直角在 C，M 为 AB 中点",
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 320">
  <polygon points="72,52 72,248 348,248" fill="#1F3A4D" fill-opacity="0.05" stroke="#1F3A4D" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M72,228 L92,228 L92,248" fill="none" stroke="#1F3A4D" stroke-width="1.5"/>
  <line x1="72" y1="248" x2="210" y2="150" stroke="#9B2C1A" stroke-width="1.7"/>
  <circle cx="72" cy="52" r="2.8" fill="#1A1814"/>
  <circle cx="72" cy="248" r="2.8" fill="#1A1814"/>
  <circle cx="348" cy="248" r="2.8" fill="#1A1814"/>
  <circle cx="210" cy="150" r="2.8" fill="#9B2C1A"/>
  <text x="58" y="44" font-family="Times New Roman, serif" font-size="16" fill="#1A1814">A</text>
  <text x="54" y="272" font-family="Times New Roman, serif" font-size="16" fill="#1A1814">C</text>
  <text x="356" y="272" font-family="Times New Roman, serif" font-size="16" fill="#1A1814">B</text>
  <text x="220" y="144" font-family="Times New Roman, serif" font-size="16" fill="#9B2C1A">M</text>
</svg>`,
      },
    ],
    subject: "geometry",
    tags: ["直角三角形", "中线", "证明"],
    difficulty: 2,
    myAnswer: "误把中线当成高，写成 $CM \\perp AB$。",
    correctAnswer: "$CM = \\dfrac{1}{2}AB$。",
    analysis:
      "补全以 $AB$ 为直径的圆。因 $\\angle C=90^\\circ$，点 $C$ 在该圆上，圆心即 $M$，故半径 $CM=MA=MB=\\dfrac{1}{2}AB$。也可取 $AB$ 中点坐标直接计算。",
    notes: "直角三角形斜边中线等于斜边一半，是固定结论。",
    errorReason: "concept",
    mastery: "reviewing",
    reviewCount: 1,
    nextReviewAt: now,
  },
  {
    id: "sample-parabola",
    createdAt: now + 3600_000,
    updatedAt: now + 3600_000,
    sourceKind: "sample",
    title: "二次函数的顶点与交点",
    stem: "已知函数 $f(x)=x^2-2x-3$。\n\n(1) 求其顶点坐标与对称轴；\n(2) 求它与 $x$ 轴、$y$ 轴的交点。",
    figures: [
      {
        id: "fig-parabola",
        title: "抛物线 y = x² − 2x − 3",
        caption: "顶点 (1, −4)，与 x 轴交于 (−1, 0) 与 (3, 0)",
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 320">
  <defs>
    <marker id="ax" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L7,3 L0,6 Z" fill="#1F3A4D"/>
    </marker>
  </defs>
  <g stroke="#C9C2B4" stroke-width="0.6" fill="none">
    <line x1="40" y1="40" x2="40" y2="280"/>
    <line x1="80" y1="40" x2="80" y2="280"/>
    <line x1="120" y1="40" x2="120" y2="280"/>
    <line x1="160" y1="40" x2="160" y2="280"/>
    <line x1="200" y1="40" x2="200" y2="280"/>
    <line x1="240" y1="40" x2="240" y2="280"/>
    <line x1="280" y1="40" x2="280" y2="280"/>
    <line x1="320" y1="40" x2="320" y2="280"/>
    <line x1="360" y1="40" x2="360" y2="280"/>
    <line x1="20" y1="60" x2="400" y2="60"/>
    <line x1="20" y1="100" x2="400" y2="100"/>
    <line x1="20" y1="140" x2="400" y2="140"/>
    <line x1="20" y1="180" x2="400" y2="180"/>
    <line x1="20" y1="220" x2="400" y2="220"/>
    <line x1="20" y1="260" x2="400" y2="260"/>
  </g>
  <line x1="20" y1="140" x2="400" y2="140" stroke="#1F3A4D" stroke-width="1.4" marker-end="url(#ax)"/>
  <line x1="160" y1="300" x2="160" y2="28" stroke="#1F3A4D" stroke-width="1.4" marker-end="url(#ax)"/>
  <path d="M48,220 Q160,300 272,220 Q328,180 384,84" fill="none" stroke="#1F3A4D" stroke-width="2"/>
  <line x1="200" y1="28" x2="200" y2="300" stroke="#9B2C1A" stroke-width="1.2" stroke-dasharray="4 4"/>
  <circle cx="200" cy="220" r="3" fill="#9B2C1A"/>
  <circle cx="120" cy="140" r="2.6" fill="#1A1814"/>
  <circle cx="280" cy="140" r="2.6" fill="#1A1814"/>
  <circle cx="160" cy="180" r="2.6" fill="#1A1814"/>
  <text x="388" y="132" font-family="Times New Roman, serif" font-size="14" fill="#1F3A4D">x</text>
  <text x="170" y="36" font-family="Times New Roman, serif" font-size="14" fill="#1F3A4D">y</text>
  <text x="208" y="236" font-family="Times New Roman, serif" font-size="13" fill="#9B2C1A">(1,−4)</text>
  <text x="100" y="128" font-family="Times New Roman, serif" font-size="13" fill="#1A1814">−1</text>
  <text x="284" y="128" font-family="Times New Roman, serif" font-size="13" fill="#1A1814">3</text>
</svg>`,
      },
    ],
    subject: "function",
    tags: ["二次函数", "顶点", "交点"],
    difficulty: 2,
    myAnswer: "对称轴写成 $x=-1$，顶点算成 $(−1,−4)$。",
    correctAnswer:
      "顶点 $(1,-4)$，对称轴 $x=1$；与 $x$ 轴交于 $(-1,0)$、$(3,0)$，与 $y$ 轴交于 $(0,-3)$。",
    analysis:
      "$f(x)=(x-1)^2-4$。顶点为 $(1,-4)$，对称轴 $x=1$。$f(x)=0 \\Rightarrow (x-3)(x+1)=0$。$f(0)=-3$。",
    notes: "配方时一次项系数减半，不要把符号弄反。",
    errorReason: "calc",
    mastery: "new",
    reviewCount: 0,
    nextReviewAt: now,
  },
  {
    id: "sample-circle",
    createdAt: now + 7200_000,
    updatedAt: now + 7200_000,
    sourceKind: "sample",
    title: "圆周角与圆心角",
    stem: "如图，点 $O$ 为圆心，$A$、$B$、$C$ 在圆上。若 $\\angle AOB = 80^\\circ$，求 $\\angle ACB$。",
    figures: [
      {
        id: "fig-circle",
        title: "圆心角与圆周角",
        caption: "同弧 AB 所对：圆心角是圆周角的两倍",
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 340">
  <circle cx="210" cy="170" r="118" fill="#1F3A4D" fill-opacity="0.04" stroke="#1F3A4D" stroke-width="1.8"/>
  <path d="M210,170 L108.7,109.6 A118,118 0 0 1 311.3,109.6 Z" fill="#9B2C1A" fill-opacity="0.08" stroke="none"/>
  <line x1="210" y1="170" x2="108.7" y2="109.6" stroke="#1F3A4D" stroke-width="1.6"/>
  <line x1="210" y1="170" x2="311.3" y2="109.6" stroke="#1F3A4D" stroke-width="1.6"/>
  <line x1="108.7" y1="109.6" x2="210" y2="278" stroke="#9B2C1A" stroke-width="1.6"/>
  <line x1="311.3" y1="109.6" x2="210" y2="278" stroke="#9B2C1A" stroke-width="1.6"/>
  <path d="M186,155 A28,28 0 0 1 234,155" fill="none" stroke="#1F3A4D" stroke-width="1.3"/>
  <path d="M196,256 A22,22 0 0 1 224,256" fill="none" stroke="#9B2C1A" stroke-width="1.3"/>
  <circle cx="210" cy="170" r="2.8" fill="#1A1814"/>
  <circle cx="108.7" cy="109.6" r="2.8" fill="#1A1814"/>
  <circle cx="311.3" cy="109.6" r="2.8" fill="#1A1814"/>
  <circle cx="210" cy="278" r="2.8" fill="#9B2C1A"/>
  <text x="218" y="166" font-family="Times New Roman, serif" font-size="15" fill="#1A1814">O</text>
  <text x="86" y="104" font-family="Times New Roman, serif" font-size="15" fill="#1A1814">A</text>
  <text x="320" y="104" font-family="Times New Roman, serif" font-size="15" fill="#1A1814">B</text>
  <text x="218" y="300" font-family="Times New Roman, serif" font-size="15" fill="#9B2C1A">C</text>
  <text x="204" y="148" font-family="Times New Roman, serif" font-size="12" fill="#1F3A4D">80°</text>
</svg>`,
      },
    ],
    subject: "geometry",
    tags: ["圆", "圆周角", "圆心角"],
    difficulty: 1,
    myAnswer: "写成与圆心角相等，$\\angle ACB=80^\\circ$。",
    correctAnswer: "$\\angle ACB = 40^\\circ$。",
    analysis:
      "同弧所对的圆周角等于圆心角的一半。$\\overset{\\frown}{AB}$ 所对圆心角为 $80^\\circ$，故圆周角 $\\angle ACB=40^\\circ$。",
    notes: "看清角所对的是哪一条弧。",
    errorReason: "concept",
    mastery: "new",
    reviewCount: 0,
    nextReviewAt: now,
  },
];
