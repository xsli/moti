import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const USER = "dev-user";
const now = Date.now();

const problems = [
  {
    id: "a1-safe-heap",
    title: "最大安全数堆",
    subject: "algebra",
    tags: ["组合", "无和集", "极值"],
    difficulty: 4,
    stem: "从自然数 $1,2,3,\\ldots,2025$ 中选取若干数构成安全数堆，要求数堆内任意两个不同数之和都不属于该数堆。那么最多可选取多少个数？",
    correctAnswer: "$1013$",
    analysis:
      "集合 $\\{1,2,\\ldots,n\\}$（$n=2025$）的最大无和子集大小为 $\\left\\lceil\\dfrac{n}{2}\\right\\rceil$。\n取所有奇数：$1,3,\\ldots,2025$，共 $1013$ 个，任意两奇数之和为偶数，不在集合中。\n或取上半段 $\\{1013,1014,\\ldots,2025\\}$，也有 $1013$ 个数，且任意两数之和 $>2025$。\n故最多选取 $1013$ 个数。",
  },
  {
    id: "a2-bo-shu",
    title: "写出所有博数",
    subject: "algebra",
    tags: ["整除", "最小公倍数", "自然数"],
    difficulty: 4,
    stem: "如果一个不小于 $10$ 的自然数 $n$ 能被不超过 $\\dfrac{n}{5}$ 的所有非零自然数整除，这样的自然数 $n$ 叫作“博数”。请写出所有的博数。",
    correctAnswer: "$10,12,14,18,24$",
    analysis:
      "设 $m=\\left\\lfloor\\dfrac{n}{5}\\right\\rfloor$，则 $n$ 必须是 $L=\\operatorname{lcm}(1,2,\\ldots,m)$ 的倍数，且 $5m\\le n<5(m+1)$。\n- $m=2$（$10\\le n<15$）：$L=2$，得 $10,12,14$；\n- $m=3$（$15\\le n<20$）：$L=6$，得 $18$；\n- $m=4$（$20\\le n<25$）：$L=12$，得 $24$；\n- $m\\ge5$ 时 $L\\ge60$，区间长度仅 $5$，无倍数。\n故所有博数为 $10,12,14,18,24$。",
  },
  {
    id: "a3-gauss-alt",
    title: "含高斯函数的交替求和",
    subject: "algebra",
    tags: ["高斯函数", "求和", "分组"],
    difficulty: 4,
    stem: "计算 $\\left[\\dfrac{2025}{3}\\right]-\\left[\\dfrac{2024}{3}\\right]+\\left[\\dfrac{2023}{3}\\right]-\\left[\\dfrac{2022}{3}\\right]+\\cdots+\\left[\\dfrac{3}{3}\\right]-\\left[\\dfrac{2}{3}\\right]+\\left[\\dfrac{1}{3}\\right]$ 的值，其中 $[x]$ 表示不超过 $x$ 的最大自然数。",
    correctAnswer: "$338$",
    analysis:
      "将求和按每三项一组。从 $2025=3\\times675$ 起共 $675$ 组。奇数项共 $338$ 个，偶数项共 $337$ 个，两两配对得 $337$ 个 $1$，再加最后的 $1$，总和为 $338$。",
  },
  {
    id: "g1-tank",
    title: "长方体水槽放木块是否溢出",
    subject: "geometry",
    tags: ["体积", "长方体", "正方体"],
    difficulty: 3,
    stem: "一个长方体水槽长、宽、高依次为80厘米、60厘米、55厘米，槽内装有200000立方厘米的水。将棱长46厘米的正方体木块放入水中，木块三分之二体积浸入水中，剩余部分露出水面，判断水是否会溢出，并说明理由。",
    correctAnswer: "会溢出",
    analysis:
      "水槽容积为 $80\\times60\\times55=264000$（立方厘米），已装水 $200000$ 立方厘米，故剩余空间为 $64000$（立方厘米）。\n正方体木块体积为 $46^{3}=97336$（立方厘米），浸入水中的体积为 $\\dfrac{2}{3}\\times97336\\approx64890.67$（立方厘米）。\n因为 $64890.67>64000$，所以水会溢出。",
  },
  {
    id: "a4-carbon",
    title: "碳排放量弥补问题",
    subject: "algebra",
    tags: ["应用题", "循环计算", "碳排放"],
    difficulty: 3,
    stem: "洋洋2023年末搭乘飞机出国旅行，他搭乘飞机平均每人产生的碳排放量为900克. 为了弥补这些碳排放量，他决定2024年开始上下班交通由自己驾驶汽车改为其他交通工具. 如果洋洋每月上班20天，每日上下班搭乘交通工具的总里程均为20千米. 洋洋决定按月依次按照自行车、地铁、公交车的顺序交替搭乘交通工具，即一个月自行车，接着一个月地铁，然后一个月公交车，如此循环. 则与驾驶汽车相比，至少需要工作____（填自然数）天后，因此减少产生的碳排放量，才会超过他搭乘飞机产生的碳排放量.\n$$\\begin{array}{|c|c|c|c|c|} \\hline & 自行车 & 地铁 & 公交车 & 自驾汽车 \\\\ \\hline 碳排放量 & 0克 & 0.01克 & 0.04克 & 0.17克 \\\\ \\hline \\end{array}$$",
    correctAnswer: "$293$",
    analysis: "飞机排放 $900$ 克。每日 $20$ 千米，相对自驾每天分别少 $3.4$、$3.2$、$2.6$ 克，每月 $20$ 天则少 $68$、$64$、$52$ 克，三轮共 $184$ 克。四个循环（$240$ 天）共 $736$ 克；再一个月自行车 $804$，一个月地铁 $868$，还需 $32$ 克，按公交车每天 $2.6$ 克需 $13$ 天。总天数 $240+40+13=293$。",
  },
  {
    id: "76ade1df-8e35-4dd7-ace4-3127bfab7363",
    title: "等边三角形面积之差",
    subject: "geometry",
    tags: ["等边三角形", "面积比", "中点"],
    difficulty: 5,
    stem: "如图，等边$\\triangle ABC$和等边$\\triangle BDE$的面积分别是117和325，$G$是$AD$的中点．$AB$与$CG$相交于$H$，$BD$与$GE$相交于$F$．求$\\triangle BEF$与$\\triangle BCH$的面积之差是多少？",
    correctAnswer: "$\\dfrac{1264}{11}$",
    analysis:
      "等边$\\triangle ABC$与等边$\\triangle BDE$的面积比为$117:325=9:25$，故边长比为$3:5$．设$AB=3k$，$BD=5k$．\n用坐标法求得$\\dfrac{BH}{BA}=\\dfrac{8}{11}$．\n所求面积之差为 $S_{\\triangle BEF}-S_{\\triangle BCH}=\\dfrac{1264}{11}$．",
  },
  {
    id: "a5-monomial",
    title: "单项式的系数与次数",
    subject: "algebra",
    tags: ["单项式", "系数", "次数"],
    difficulty: 2,
    stem: "单项式 $\\dfrac{-5xyz}{4}$ 的系数为______，次数是______．",
    correctAnswer: "$-\\dfrac{5}{4}$；$3$",
    analysis: "系数为数字因数 $-\\dfrac{5}{4}$，字母指数之和 $1+1+1=3$，故次数是 $3$．",
  },
  {
    id: "a6-poly-order",
    title: "判断多项式的排列方式",
    subject: "algebra",
    tags: ["多项式", "降幂排列"],
    difficulty: 2,
    stem: "多项式 $-2y^{4}+2x^{2}y^{3}-\\dfrac{1}{2}x^{3}+x^{4}y^{6}$ 是按______排列．",
    correctAnswer: "$x$ 的升幂",
    analysis: "各项中 $x$ 的次数依次为 $0,2,3,4$，是按 $x$ 的升幂排列．",
  },
  {
    id: "a7-poly-arrange",
    title: "多项式按升幂降幂排列",
    subject: "algebra",
    tags: ["多项式", "升幂排列", "降幂排列"],
    difficulty: 2,
    stem: "将多项式 $-x^{2}y+6xy^{2}-\\dfrac{1}{5}x^{3}-7y^{3}+4$ 按 $x$ 的升幂排列是______，按 $y$ 的降幂排列为______．",
    correctAnswer: "$4-7y^{3}+6xy^{2}-x^{2}y-\\dfrac{1}{5}x^{3}$；$-7y^{3}+6xy^{2}-x^{2}y+4-\\dfrac{1}{5}x^{3}$",
    analysis:
      "按 $x$ 的升幂：不含 $x$ 的项在前，再按 $x$ 次数由低到高。\n按 $y$ 的降幂：按 $y$ 次数由高到低。",
  },
  {
    id: "ff53befb-2068-40bc-b9a4-21d69b670117",
    title: "正四面体顶点染色计数",
    subject: "geometry",
    tags: ["正四面体", "染色", "群作用"],
    difficulty: 5,
    stem: "一个正四面体，连接它四个面的重心，得出一个小正四面体，$8$ 个顶点，每个顶点涂红色或蓝色（旋转或翻转相同视为同一种），共有多少种涂色方法？",
    correctAnswer: "$35$",
    analysis:
      "连接正四面体四个面重心得到内部小正四面体，原 $4$ 个顶点与小四面体 $4$ 个顶点共 $8$ 个顶点．每个顶点 $2$ 色，共 $2^8=256$ 种着色，在全对称群 $S_4$（阶 $24$）下用 Burnside 引理计数轨道，得 $35$ 种。",
  },
];

const dataDir = "/workspace/.data/pglite";
await mkdir(dataDir, { recursive: true });
const pg = new PGlite(dataDir);
await pg.waitReady;
await pg.exec(`
  create table if not exists problems (
    user_id text not null, id text not null, created_at bigint not null, updated_at bigint not null,
    source_kind text not null, source_image text, title text not null, stem text not null,
    figures_json text not null default '[]', subject text not null, tags_json text not null default '[]',
    difficulty smallint not null default 3, my_answer text not null default '',
    correct_answer text not null default '', analysis text not null default '',
    notes text not null default '', error_reason text not null default 'unknown',
    mastery text not null default 'new', review_count integer not null default 0,
    next_review_at bigint not null, primary key (user_id, id)
  );
  create table if not exists notebook_meta (
    user_id text primary key, initialized_at bigint not null
  );
`);

for (const [i, p] of problems.entries()) {
  const created = now - (problems.length - i) * 60_000;
  await pg.query(
    `insert into problems (
      user_id, id, created_at, updated_at, source_kind, source_image, title, stem, figures_json,
      subject, tags_json, difficulty, my_answer, correct_answer, analysis, notes, error_reason,
      mastery, review_count, next_review_at
    ) values ($1,$2,$3,$4,'photo',null,$5,$6,'[]',$7,$8,$9,'',$10,$11,'','unknown','new',0,$3)
    on conflict (user_id, id) do update set
      title=excluded.title, stem=excluded.stem, correct_answer=excluded.correct_answer,
      analysis=excluded.analysis, tags_json=excluded.tags_json, subject=excluded.subject,
      updated_at=excluded.updated_at`,
    [
      USER,
      p.id,
      created,
      now,
      p.title,
      p.stem,
      p.subject,
      JSON.stringify(p.tags),
      p.difficulty,
      p.correctAnswer,
      p.analysis,
    ],
  );
}
await pg.query(
  `insert into notebook_meta (user_id, initialized_at) values ($1, $2)
   on conflict (user_id) do update set initialized_at = excluded.initialized_at`,
  [USER, now],
);
const n = await pg.query("select count(*)::int as n from problems where user_id=$1", [USER]);
console.log("restored", n.rows);
await pg.close();
