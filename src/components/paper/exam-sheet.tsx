import katexCss from "katex/dist/katex.min.css?inline";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { chineseOrdinal, type ExamItem, type HeadingRole, type SheetKind } from "@/lib/paper/layout";
import {
  BLANK_LINE_HEIGHT_MM,
  blankHeightMm,
  hasWrittenAnswer,
  type BlankLines,
} from "@/lib/paper/space";
import { MathText, splitMathPieces } from "@/lib/problems/math-text";
import { splitStemSections } from "@/lib/problems/subproblems";
import type { Problem } from "@/lib/problems/types";

const EXAM_CSS = `
.exam-pack { display: flex; flex-direction: column; gap: 18px; align-items: center; }
.exam-page, .exam-measure {
  width: 210mm;
  box-sizing: border-box;
  padding: 25.4mm 20.3mm 25.4mm 33mm;
  background: #fff;
  color: #1a1814;
  font-family: "Noto Serif SC", "Songti SC", "STSong", "SimSun", serif;
  font-size: 10.5pt;
  line-height: 1.7;
}
.exam-page {
  position: relative;
  height: 297mm;
  overflow: hidden;
  box-shadow: var(--shadow-border);
}
.exam-page *, .exam-measure * { box-sizing: border-box; }
.exam-seal {
  position: absolute;
  left: 0;
  top: 25.4mm;
  bottom: 25.4mm;
  width: 28mm;
}
.exam-seal-line {
  position: absolute;
  right: 5mm;
  top: 0;
  bottom: 0;
  border-right: 1px dotted #1a1814;
}
.exam-seal-msg {
  position: absolute;
  left: 3mm;
  top: 10mm;
  bottom: 10mm;
  writing-mode: vertical-rl;
  font-size: 9pt;
  letter-spacing: 0.42em;
}
.exam-seal-bind {
  position: absolute;
  right: 7.2mm;
  top: 18mm;
  writing-mode: vertical-rl;
  font-size: 8pt;
  letter-spacing: 0.55em;
  color: #1a1814;
}
.exam-head { text-align: center; }
.exam-brand {
  position: absolute;
  left: 33mm;
  top: 25.4mm;
  display: flex;
  align-items: center;
  gap: 6pt;
  margin: 0;
  z-index: 1;
}
.exam-brand svg { width: 16pt; height: 16pt; display: block; }
.exam-brand-name {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 10pt;
  font-weight: 650;
  letter-spacing: 0.22em;
}
.exam-school {
  margin: 0;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 15pt;
  font-weight: 700;
  letter-spacing: 0.16em;
  line-height: 1.45;
}
.exam-title {
  position: relative;
  margin: 0;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 16pt;
  font-weight: 700;
  line-height: 1.4;
}
.exam-course {
  display: inline-block;
  min-width: 7em;
  padding: 0 0.7em 1pt;
  border-bottom: 1.15pt solid #1a1814;
  letter-spacing: 0.28em;
}
.exam-analysis-mark {
  position: absolute;
  margin-left: 8pt;
  padding: 1pt 6pt 0;
  border: 0.65pt solid #0d9f78;
  color: #0d9f78;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 9pt;
  font-weight: 500;
  letter-spacing: 0.18em;
  line-height: 1.4;
}
.exam-meta {
  display: flex;
  justify-content: space-between;
  gap: 8pt;
  margin: 10pt 0 8pt;
  font-size: 10.5pt;
}
.exam-meta-item {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 4pt;
  white-space: nowrap;
}
.exam-blank {
  flex: 1;
  border-bottom: 1px solid #1a1814;
  height: 1.05em;
  min-width: 2.2em;
}
.exam-score {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 10pt;
  font-size: 10.5pt;
}
.exam-score th, .exam-score td {
  border: 0.7pt solid #1a1814;
  text-align: center;
  height: 22pt;
  padding: 2pt 4pt;
  font-weight: 400;
}
.exam-score th:first-child,
.exam-score td:first-child { width: 3.2em; }
.exam-score th:last-child { width: 8em; white-space: nowrap; }
.exam-runhead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 9pt;
  color: #5c574e;
  margin: 0 0 6pt;
}
.exam-rule {
  border: 0;
  border-top: 0.6pt solid #1a1814;
  margin: 0 0 8pt;
}
.exam-q { margin: 0 0 12pt; }
.exam-stem {
  margin: 0;
  padding-left: 2em;
  text-indent: -2em;
  font-size: 10.5pt;
  line-height: 1.85;
}
.exam-no {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-weight: 700;
  padding-right: 0.4em;
}
.exam-figure { margin: 8pt 0 4pt 2em; max-width: 58mm; }
.exam-figure img, .exam-figure svg {
  display: block;
  max-width: 58mm;
  max-height: 42mm;
  width: auto;
  height: auto;
  object-fit: contain;
  background: #fff;
}
.exam-box {
  margin-top: 6pt;
  margin-bottom: 1.15em;
  min-height: 10mm;
}
.exam-box-sizer { visibility: hidden; }
.exam-analysis {
  margin: 6pt 0 1.15em 2em;
  color: #1a7d68;
  font-size: 10.5pt;
  line-height: 1.75;
}
.exam-analysis-label {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-weight: 700;
  margin-right: 0.45em;
}
.exam-section-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10pt;
  margin: 10pt 0 8pt;
}
.exam-section {
  margin: 0;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 12pt;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.exam-mini-score {
  border-collapse: collapse;
  width: 32pt;
  flex-shrink: 0;
  font-size: 9pt;
}
.exam-mini-score th, .exam-mini-score td {
  border: 0.7pt solid #1a1814;
  text-align: center;
  padding: 2pt 3pt;
  height: 16pt;
}
.exam-mini-score td { height: 20pt; }
.exam-answers-title {
  text-align: center;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 14pt;
  font-weight: 700;
  margin: 4pt 0 12pt;
  letter-spacing: 0.2em;
}
.exam-page-no {
  position: absolute;
  left: 33mm;
  right: 20.3mm;
  bottom: 12mm;
  text-align: center;
  font-size: 9pt;
  color: #1a1814;
}
.exam-measure {
  position: absolute;
  left: -1400px;
  top: 0;
  min-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  visibility: hidden;
  pointer-events: none;
}
.exam-sheet .katex { font-size: 1.05em; }
.exam-sheet .katex-display { margin: 0.35em 0; }
.exam-sheet[data-kind="handout"] .exam-page,
.exam-sheet[data-kind="handout"] .exam-measure {
  padding: 16mm 18mm 18mm 20mm;
}
.exam-sheet[data-kind="handout"] .exam-page-no {
  left: 20mm;
  right: 18mm;
  display: flex;
  justify-content: space-between;
  text-align: left;
  color: #5c574e;
}
.hn-head {
  display: flex;
  flex-direction: column;
  gap: 8pt;
  padding-bottom: 8pt;
  border-bottom: 1.1pt solid #1a1814;
  margin-bottom: 4pt;
}
.hn-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12pt;
}
.hn-title {
  position: relative;
  margin: 10pt 0 8pt;
  text-align: center;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 16pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  line-height: 1.4;
}
.hn-brand { display: flex; align-items: center; gap: 8pt; }
.hn-logo { display: flex; align-items: center; gap: 6pt; }
.hn-logo svg { width: 16pt; height: 16pt; display: block; }
.hn-logo-name {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 12pt;
  font-weight: 700;
  letter-spacing: 0.16em;
}
.hn-meta { max-width: 62%; white-space: nowrap; font-size: 9pt; color: #1a1814; text-align: right; line-height: 1.45; }
.hn-meta-by { display: inline; margin-left: 0.45em; font-size: 8pt; }
.hn-sec {
  margin: 12pt 0 8pt;
  padding-left: 9pt;
  border-left: 3.2pt solid #0d9f78;
}
.hn-sec-example { border-left-color: #1a1814; }
.hn-sec-practice { border-left-color: #1a1814; }
.hn-sec-title {
  margin: 0;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 11.5pt;
  font-weight: 700;
}
.exam-sheet[data-kind="handout"] .exam-stem {
  padding-left: 2.8em;
  text-indent: -2.8em;
}
.hn-row { display: flex; gap: 12pt; align-items: flex-start; }
.hn-row .exam-figure { margin: 4pt 0 0; flex-shrink: 0; }
.hn-idea {
  margin-top: 7pt;
  padding: 4pt 0 4pt 8pt;
  border-left: 1.2pt solid #1a1814;
  font-size: 10pt;
  line-height: 1.65;
}
.hn-idea b {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  margin-right: 0.4em;
}
.hn-idea-part { margin: 0; padding-top: 3pt; padding-bottom: 3pt; }
.hn-idea-first { margin-top: 7pt; }
.hn-idea-answer { padding-top: 6pt; }
.hn-lines { margin: 6pt 0 1.15em 2em; }
.hn-lines i {
  display: block;
  height: ${BLANK_LINE_HEIGHT_MM}mm;
}
.hn-lines-auto {
  position: relative;
  display: flow-root;
  min-height: ${BLANK_LINE_HEIGHT_MM * 2}mm;
  max-height: ${BLANK_LINE_HEIGHT_MM * 20}mm;
  overflow: hidden;
}
.hn-lines-auto-rules { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.hn-lines-sizer { visibility: hidden; display: flow-root; min-height: ${BLANK_LINE_HEIGHT_MM * 2}mm; }
.hn-lines-auto .hn-idea { margin: 0; }
.hn-point {
  margin: 2pt 0 2pt 1.2em;
  padding-left: 0;
  list-style: disc;
}
`;

type Block =
  | { kind: "heading"; title: string; role: HeadingRole }
  | { kind: "q"; problem: Problem; index: number; blankLines: BlankLines; role: HeadingRole; label: string }
  | { kind: "analysis"; problem: Problem; index: number }
  | { kind: "handout-answer"; text: string; label?: "思路" | "答案"; first: boolean; answerStart: boolean };

/** 试卷装订线旧俏皮话，暂时不用，改走 MATH_QUIPS。 */
const SEAL_QUIPS = [
  "错过一次就够了，下次换我赢",
  "这不是考试，是和昨天的自己复盘",
  "题目会说话，认真听它把思路讲完",
  "会的先拿下，不会的慢慢磨",
  "复习卷，深呼吸，写完去喝水",
  "别在同一道题上栽第二次",
  "空白处留给明天更聪明的你",
  "解集在手，旧坑逐个填平",
  "写得慢没关系，想清楚再落笔",
  "先把会做的写漂亮",
  "答案可以慢，思路别乱跑",
  "这页的坑，今天必须填上",
  "算错不可怕，抄错才冤枉",
  "公式记得住，步骤也要写清",
  "不会就画画图，别干瞪眼",
  "今天订正一题，明天少慌一次",
  "草稿纸可以脏，卷面请温柔",
  "题目在考你，你也在训练它",
  "看完题再动笔，少走十分钟弯路",
  "熟练来自重复，不是来自玄学",
  "把粗心抓现行，别让它毕业",
  "这道题眼熟就对了，熟还要会",
  "先求对，再求快，最后求好看",
  "休息一下眼睛，别和符号较劲",
];

/** 装订处旧文案，暂时不用。 */
const BIND_QUIPS = [
  "线内请勿答题",
  "装订处请留白",
  "这里不写答案",
  "线内禁止神游",
  "订书机的地盘",
  "线里住着订针",
  "装订线请绕行",
  "此处仅供装订",
  "订这里，写那边",
  "线内谢绝演算",
  "别往订口塞字",
  "装订员说谢谢",
  "这条线很内向",
  "针脚处请回避",
  "答案请写右边",
  "线内只装订不思考",
];


// 趣味文案均为创作或戏仿，不作为人物原话引用。
const MATH_QUIPS: { person: string; text: string; by: string }[] = [
  { person: "笛卡尔", text: "我算故我在，算错也在", by: "笛卡尔拒绝注销" },
  { person: "欧几里得", text: "几何没有捷径，辅助线倒是有", by: "欧几里得现场修路" },
  { person: "阿基米德", text: "给我一个支点，别给我零分", by: "阿基米德正在交涉" },
  { person: "高斯", text: "别一个个加，我还想早点下课", by: "高斯的早退申请" },
  { person: "欧拉", text: "这页全是我的公式，分不给我？", by: "欧拉申请署名费" },
  { person: "费马", text: "解法很妙，页边太小", by: "费马坚持不交过程" },
  { person: "希尔伯特", text: "房间还能加，作业就别了", by: "希尔伯特旅馆歇业" },
  { person: "毕达哥拉斯", text: "不是直角也找我？业务超范围", by: "毕达哥拉斯拒绝加班" },
  { person: "莱布尼茨", text: "我说万物可归零一，没说考零分", by: "莱布尼茨紧急澄清" },
  { person: "哥德尔", text: "本卷不完备，因为我没写完", by: "哥德尔的延期申请" },
  { person: "康托尔", text: "题目可数，作业怎么写不完", by: "康托尔申请数到明天" },
  { person: "拉马努金", text: "答案梦到了，步骤还没醒", by: "拉马努金申请续睡" },
  { person: "陈省身", text: "数学好玩，但这题玩我", by: "陈省身收到玩家反馈" },
  { person: "祖冲之", text: "圆周率没算完，下课铃先响了", by: "祖冲之还不肯收笔" },
  { person: "爱因斯坦", text: "答案没错，只是参考系不同", by: "爱因斯坦的申诉被驳回" },
  { person: "牛顿", text: "别催，我的笔还保持静止", by: "牛顿援引惯性定律" },
  { person: "薛定谔", text: "我会不会？先别打开答案", by: "薛定谔保留叠加态" },
  { person: "海森堡", text: "答案和思路，总有一个测不准", by: "海森堡拒绝背锅" },
  { person: "法拉第", text: "脑子没电？你倒是动一动笔", by: "法拉第尝试感应供电" },
  { person: "麦克斯韦", text: "四个方程就够了？我写了四页", by: "麦克斯韦要求精简" },
  { person: "欧姆", text: "脑子短路还是断路？反正不通", by: "欧姆接到维修工单" },
  { person: "焦耳", text: "做题半小时，主要贡献了热量", by: "焦耳查无有效输出" },
  { person: "普朗克", text: "给分能按一小份一小份给吗", by: "普朗克的零分申诉" },
  { person: "玻尔", text: "步骤能像电子一样直接跳吗", by: "玻尔替老师说不能" },
  { person: "居里夫人", text: "答案还没找到，草稿先堆成矿", by: "居里夫人准备提炼" },
  { person: "泡利", text: "这答案，连错都没错到点上", by: "泡利不提供情绪价值" },
  { person: "拉瓦锡", text: "负号凭空消失？守恒不答应", by: "拉瓦锡发出寻符启事" },
  { person: "门捷列夫", text: "空着不是不会，是给新元素留位", by: "门捷列夫的借口被识破" },
  { person: "道尔顿", text: "题目拆成原子了，暂时装不回去", by: "道尔顿的售后现场" },
  { person: "阿伏伽德罗", text: "错题能按一摩尔算吗", by: "阿伏伽德罗劝你冷静" },
  { person: "图灵", text: "我不是不会，我还没停机", by: "图灵怀疑陷入死循环" },
  { person: "冯·诺依曼", text: "脑内存不够，草稿纸来凑", by: "冯·诺依曼建议扩容" },
  { person: "高德纳", text: "优化了半天，把正确答案优化没了", by: "高德纳建议先别优化" },
  { person: "迪杰斯特拉", text: "找到最短路径了：跳过这题", by: "迪杰斯特拉拒绝认领" },
  { person: "香农", text: "草稿信息量很大，有用的很少", by: "香农正在降噪" },
  { person: "布尔", text: "会或不会？我选再想一会", by: "布尔不接受第三选项" },
  { person: "华罗庚", text: "数形结合了，我和答案还没结合", by: "华罗庚催办对接" },
  { person: "陈景润", text: "一加二都研究了，这题还不放过我", by: "陈景润申请换题" },
  { person: "刘徽", text: "割圆割了一圈，橡皮先圆了", by: "刘徽核对工具损耗" },
  { person: "秦九韶", text: "算了半天，只剩余数和我", by: "秦九韶接收剩余物资" },
  { person: "柯西", text: "不等式放缩了，分数也缩水了", by: "柯西叫停乱放缩" },
  { person: "庞加莱", text: "想法转了一圈，回到不会的起点", by: "庞加莱验收回归现场" },
  { person: "诺特", text: "换了三种解法，零分保持不变", by: "诺特发现可疑守恒量" },
  { person: "雅各布·伯努利", text: "再试一次？硬币都比我有把握", by: "雅各布·伯努利观战" },
  { person: "徐光启", text: "每个字都认得，合起来不会", by: "徐光启加印翻译本" },
  { person: "杨辉", text: "三角排好了，我的答案还没排上", by: "杨辉请你按行入座" },
  { person: "商高", text: "勾三股四弦五，我算出了六", by: "商高申请重新量尺" },
  { person: "斐波那契", text: "错题接着错题，怎么也有递推", by: "斐波那契请求断更" },
  { person: "韦达", text: "两根都认识，就是解不出户口", by: "韦达核对根的关系" },
  { person: "拉格朗日", text: "未知数太多？我再加一个", by: "拉格朗日派出乘子" },
  { person: "拉普拉斯", text: "概率算完了，还是想再蒙一次", by: "拉普拉斯没收骰子" },
  { person: "傅里叶", text: "草稿分解完，剩下全是杂音", by: "傅里叶关掉扩音器" },
  { person: "黎曼", text: "平面上没路，能把卷子掰弯吗", by: "黎曼拒绝承担折痕" },
  { person: "克莱因", text: "瓶口找不到，答案出口也没有", by: "克莱因拒绝退瓶" },
  { person: "莫比乌斯", text: "草稿翻个面，怎么还是这一面", by: "莫比乌斯节约纸张" },
  { person: "阿贝尔", text: "根式解不出来，不全怪我吧", by: "阿贝尔同意有时如此" },
  { person: "雅可比", text: "行列式算完了，行和列也串了", by: "雅可比重新排座位" },
  { person: "狄利克雷", text: "东西放满了，总该挤出个答案", by: "狄利克雷再拉个抽屉" },
  { person: "勒让德", text: "多项式写了半页，项项不服管", by: "勒让德主持整队" },
  { person: "切比雪夫", text: "离平均分太远，能用不等式救吗", by: "切比雪夫拒绝改成绩" },
  { person: "马尔可夫", text: "上一行刚算完，前面全忘了", by: "马尔可夫疑似无记忆" },
  { person: "李雅普诺夫", text: "错误这么稳定，也算稳定性吧", by: "李雅普诺夫不予表扬" },
  { person: "范德蒙", text: "一排数站整齐，就开始收计算费", by: "范德蒙递来行列式" },
  { person: "拉姆齐", text: "乱写这么多，总该藏着点规律", by: "拉姆齐不保证藏着分" },
  { person: "费曼", text: "这题我懂，一讲就不懂了", by: "费曼请你重新开讲" },
  { person: "狄拉克", text: "答案很美，代进去不太礼貌", by: "狄拉克暂缓审美评分" },
  { person: "开尔文", text: "热情降到底，分数不能跟着降", by: "开尔文守住绝对零度" },
  { person: "安培", text: "右手伸出来了，答案没跟出来", by: "安培纠正施法姿势" },
  { person: "伽利略", text: "两种解法同时落地，都摔成零分", by: "伽利略捡起草稿" },
  { person: "特斯拉", text: "我说交流思路，没说交流答案", by: "特斯拉切断考场电源" },
  { person: "胡克", text: "再加作业，弹性就不保了", by: "胡克建议别拉太满" },
  { person: "库仑", text: "我和答案是不是带同种电荷", by: "库仑记录持续排斥" },
  { person: "伏特", text: "笔都串起来了，脑子仍然没电", by: "伏特拒修铅笔电池" },
  { person: "瓦特", text: "马力开足了，进度条没动", by: "瓦特怀疑原地空转" },
  { person: "赫兹", text: "每秒走神三次，频率倒挺稳定", by: "赫兹不认可这个纪录" },
  { person: "多普勒", text: "下课铃越近，听着越动听", by: "多普勒怀疑心理作用" },
  { person: "伦琴", text: "题目看穿了，答案没看出来", by: "伦琴调低透视期待" },
  { person: "贝克勒尔", text: "卷子先放抽屉，答案会自己显影吗", by: "贝克勒尔建议别等" },
  { person: "霍金", text: "答案掉进黑洞了，还能捞分吗", by: "霍金建议下次别扔" },
  { person: "德布罗意", text: "我不是走神，是思维有波动", by: "德布罗意要求交波形" },
  { person: "费米", text: "大概会做，准确地说还不会", by: "费米缩小估算误差" },
  { person: "玻恩", text: "答案一测才知道，先选个概率大的", by: "玻恩不包选择题全对" },
  { person: "玻尔兹曼", text: "桌面越写越乱，倒是符合规律", by: "玻尔兹曼不替你收拾" },
  { person: "普鲁斯特", text: "一份认真配九份发呆，比例很稳", by: "普鲁斯特退回配方" },
  { person: "维勒", text: "答案合成了，老师说是副产物", by: "维勒检查反应路线" },
  { person: "查理", text: "热情膨胀了，答题区没跟着长", by: "查理申请扩容卷面" },
  { person: "杜马", text: "称出答案的分量，怎么轻得像零", by: "杜马复查天平" },
  { person: "格雷厄姆", text: "思路扩散很快，答案迟迟不到", by: "格雷厄姆追查快递" },
  { person: "范特霍夫", text: "答案在隔壁，能渗透过来吗", by: "范特霍夫封好半透膜" },
  { person: "奥斯特瓦尔德", text: "催化剂都找齐了，就差我反应", by: "奥斯特瓦尔德空等中" },
  { person: "能斯特", text: "电势算出来了，得分势头没有", by: "能斯特检查接线" },
  { person: "亨利", text: "压力这么大，知识怎么没溶进去", by: "亨利请你先打开书" },
  { person: "朗缪尔", text: "知识吸附在书面，没吸附到脑面", by: "朗缪尔重选吸附剂" },
  { person: "埃米尔·费歇尔", text: "答案有镜像，别把作业照着抄", by: "埃米尔·费歇尔转纸" },
  { person: "丘奇", text: "我把题换成函数，函数又来问我", by: "丘奇陷入自我调用" },
  { person: "汤普森", text: "工具接成一串，最后输出不知道", by: "汤普森检修解题管道" },
  { person: "巴贝奇", text: "机器还没造完，作业先算上了", by: "巴贝奇申请手动模式" },
  { person: "巴科斯", text: "公式翻译完，脑子说语言不兼容", by: "巴科斯切换编译选项" },
  { person: "阿兰·凯", text: "未来可以创造，答案得先交", by: "阿兰·凯申请延迟发布" },
  { person: "沃思", text: "代码越来越慢，作业越来越多", by: "沃思拒绝升级借口" },
  { person: "瑟夫", text: "思路已发送，答案一直没回包", by: "瑟夫申请超时重传" },
  { person: "卡恩", text: "脑子和笔没联网，协议先谈好", by: "卡恩重启握手流程" },
  { person: "斯通布雷克", text: "脑内建了题库，查询全是空", by: "斯通布雷克检查索引" },
  { person: "佩尔利斯", text: "语言学了好几种，还是不会说解", by: "佩尔利斯安排口试" },
  { person: "纽厄尔", text: "问题空间很大，我在里面迷路了", by: "纽厄尔缩小搜索范围" },
  { person: "赫伯特·西蒙", text: "答案够满意了？老师不满意", by: "赫伯特·西蒙被退稿" },
];

function shuffle<T>(list: T[]): T[] {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = next[i];
    const b = next[j];
    if (a === undefined || b === undefined) continue;
    next[i] = b;
    next[j] = a;
  }
  return next;
}

function Seal({ msg, bind }: { msg: string; bind: string }) {
  return (
    <div className="exam-seal" aria-hidden="true">
      <div className="exam-seal-line" />
      <span className="exam-seal-msg">{msg}</span>
      <span className="exam-seal-bind">{bind}</span>
    </div>
  );
}

function ScoreTable({ count }: { count: number }) {
  const parts = Math.max(1, count);
  const labels = Array.from({ length: parts }, (_, i) => chineseOrdinal(i + 1));
  return (
    <table className="exam-score">
      <thead>
        <tr>
          <th>题号</th>
          {labels.map((label) => (
            <th key={label}>{label}</th>
          ))}
          <th>课程考核成绩</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>得分</th>
          {labels.map((label) => (
            <td key={label} />
          ))}
          <td />
        </tr>
      </tbody>
    </table>
  );
}

function splitAnswerText(text: string): string[] {
  const segments: string[] = [];
  let current = "";

  function flush() {
    const value = current.trim();
    if (value) segments.push(value);
    current = "";
  }

  for (const piece of splitMathPieces(text.trim())) {
    if (piece.type === "math" && piece.display) {
      flush();
      segments.push(`$$${piece.value}$$`);
      continue;
    }

    const value = piece.type === "math" ? `$${piece.value}$` : piece.value;
    const lines = value.split("\n");
    current += lines[0] ?? "";
    for (let index = 1; index < lines.length; index += 1) {
      flush();
      current = lines[index] ?? "";
    }
  }
  flush();
  return segments;
}

function QuestionBlock({
  problem,
  index,
  blank,
  blankLines,
  blankAuto,
  role,
  label,
  sheetKind,
  withAnswers,
}: {
  problem: Problem;
  index: number;
  blank?: boolean;
  blankLines: BlankLines;
  blankAuto: boolean;
  role: HeadingRole;
  label: string;
  sheetKind: SheetKind;
  withAnswers: boolean;
}) {
  if (sheetKind === "handout" && role === "points") {
    const text = problem.notes.trim() || problem.title;
    return (
      <div className="hn-point">
        <MathText text={text} inline />
      </div>
    );
  }

  const height = blankHeightMm(problem, blankLines, blankAuto);
  const useSizer = blankAuto && hasWrittenAnswer(problem);
  const mark = <span className="exam-no">{label || `${index + 1}.`}</span>;
  const figures = problem.figures.filter((fig) => fig.image || fig.svg);
  const stemSections = splitStemSections(problem.stem);
  const stemSubproblems = new Set(stemSections.map((section) => section.subproblem).filter(Boolean));
  const looseFigures = figures.filter((figure) => !figure.subproblem || !stemSubproblems.has(figure.subproblem));
  const showLines = sheetKind === "handout" && role !== "points" && !withAnswers;

  return (
    <section className="exam-q">
      {stemSections.map((section, sectionIndex) => (
        <div key={`${section.subproblem}-${sectionIndex}`}>
          <p className="exam-stem">
            {sectionIndex === 0 ? mark : null}
            <MathText text={section.text} inline />
          </p>
          {section.subproblem > 0
            ? figures
                .filter((figure) => figure.subproblem === section.subproblem)
                .map((figure) => (
                  <div key={figure.id} className="exam-figure">
                    {figure.image ? <img src={figure.image} alt="" /> : <div dangerouslySetInnerHTML={{ __html: figure.svg }} />}
                  </div>
                ))
            : null}
        </div>
      ))}
      {sheetKind === "exam"
        ? looseFigures.map((fig) => (
            <div key={fig.id} className="exam-figure">
              {fig.image ? <img src={fig.image} alt="" /> : <div dangerouslySetInnerHTML={{ __html: fig.svg }} />}
            </div>
          ))
        : null}
      <div className={looseFigures.length && sheetKind === "handout" ? "hn-row" : undefined}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {showLines ? (useSizer ? <AutoWriteLines problem={problem} /> : <WriteLines n={blankLines} />) : null}
          {sheetKind === "exam" && blank ? (
            useSizer ? (
              <div className="exam-box">
                <div className="exam-box-sizer">
                  <AnalysisBlock problem={problem} />
                </div>
              </div>
            ) : (
              <div className="exam-box" style={{ height: `${height}mm`, minHeight: `${height}mm` }} />
            )
          ) : null}
        </div>
        {sheetKind === "handout"
          ? looseFigures.map((fig) => (
              <div key={fig.id} className="exam-figure">
                {fig.image ? <img src={fig.image} alt="" /> : <div dangerouslySetInnerHTML={{ __html: fig.svg }} />}
              </div>
            ))
          : null}
      </div>
    </section>
  );
}

function IdeaBox({ problem }: { problem: Problem }) {
  if (!problem.correctAnswer.trim() && !problem.analysis.trim()) return null;
  return (
    <div className="hn-idea">
      {problem.analysis.trim() ? (
        <div>
          <b>思路</b>
          <MathText text={problem.analysis} inline />
        </div>
      ) : null}
      {problem.correctAnswer.trim() ? (
        <div style={{ marginTop: problem.analysis.trim() ? "3pt" : 0 }}>
          <b>答案</b>
          <MathText text={problem.correctAnswer} inline />
        </div>
      ) : null}
    </div>
  );
}

function HandoutAnswerPart({
  text,
  label,
  first,
  answerStart,
}: {
  text: string;
  label?: "思路" | "答案";
  first: boolean;
  answerStart: boolean;
}) {
  return (
    <div
      className={`hn-idea hn-idea-part${first ? " hn-idea-first" : ""}${answerStart ? " hn-idea-answer" : ""}`}
    >
      {label ? <b>{label}</b> : null}
      <MathText text={text} inline />
    </div>
  );
}

function WriteLines({ n }: { n: number }) {
  const count = Math.max(2, n);
  return (
    <div className="hn-lines">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

function AutoWriteLines({ problem }: { problem: Problem }) {
  return (
    <div className="hn-lines hn-lines-auto">
      <div className="hn-lines-auto-rules" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="hn-lines-sizer">
        <IdeaBox problem={problem} />
      </div>
    </div>
  );
}

function AnalysisBlock({ problem }: { problem: Problem }) {
  return (
    <div className="exam-analysis">
      <span className="exam-analysis-label">解析</span>
      <MathText text={problem.correctAnswer || "（略）"} inline />
      {problem.analysis ? (
        <div style={{ marginTop: "4pt" }}>
          <MathText text={problem.analysis} />
        </div>
      ) : null}
    </div>
  );
}

function ExamLogo({ inline }: { inline?: boolean }) {
  return (
    <div className={inline ? "hn-logo" : "exam-brand"}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="6.4" fill="#fff" stroke="#1a1814" strokeWidth="1.2" />
        <path d="M7.5 24.5 L16 8.5 L24.5 24.5 Z" fill="none" stroke="#1a1814" strokeWidth="2.1" strokeLinejoin="round" />
        <circle cx="16" cy="19.2" r="3.6" fill="#0d9f78" />
      </svg>
      <span className={inline ? "hn-logo-name" : "exam-brand-name"}>解集</span>
    </div>
  );
}

function HandoutHead({ quote }: { quote: { text: string; by: string } }) {
  return (
    <header className="hn-head">
      <div className="hn-top">
        <div className="hn-brand">
          <ExamLogo inline />
        </div>
        <div className="hn-meta">
          {quote.text.replace(/。$/, "")}
          <span className="hn-meta-by">——{quote.by}</span>
        </div>
      </div>
    </header>
  );
}

function HandoutTitle({ title, analysis }: { title: string; analysis?: boolean }) {
  if (!title.trim()) return null;
  return (
    <h1 className="hn-title">
      <span>{title}</span>
      {analysis ? <span className="exam-analysis-mark">解析</span> : null}
    </h1>
  );
}

function CoverHead({
  title,
  headingCount,
  analysis,
}: {
  title: string;
  headingCount: number;
  dateLabel?: string;
  analysis?: boolean;
}) {
  return (
    <>
      <header className="exam-head">
        <h1 className="exam-title">
          <span className="exam-course">{title}</span>
          {analysis ? <span className="exam-analysis-mark">解析</span> : null}
        </h1>
      </header>
      <div className="exam-meta">
        <div className="exam-meta-item">
          姓名 <span className="exam-blank" />
        </div>
        <div className="exam-meta-item">
          班级 <span className="exam-blank" />
        </div>
        <div className="exam-meta-item">
          学号 <span className="exam-blank" />
        </div>
        <div className="exam-meta-item">
          得分 <span className="exam-blank" />
        </div>
      </div>
      <ScoreTable count={headingCount} />
    </>
  );
}

function SectionHead({ title, role, sheetKind }: { title: string; role: HeadingRole; sheetKind: SheetKind }) {
  if (sheetKind === "handout") {
    return (
      <div className={cnRole(role)}>
        <h2 className="hn-sec-title">{title}</h2>
      </div>
    );
  }
  return (
    <div className="exam-section-row">
      <table className="exam-mini-score">
        <thead>
          <tr>
            <th>得分</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td />
          </tr>
        </tbody>
      </table>
      <h2 className="exam-section">{title}</h2>
    </div>
  );
}

function cnRole(role: HeadingRole) {
  return `hn-sec${role === "example" ? " hn-sec-example" : role === "practice" ? " hn-sec-practice" : ""}`;
}

function BlockView({
  block,
  blank,
  blankLines,
  blankAuto,
  sheetKind,
  withAnswers,
}: {
  block: Block;
  blank: boolean;
  blankLines: BlankLines;
  blankAuto: boolean;
  sheetKind: SheetKind;
  withAnswers: boolean;
}) {
  if (block.kind === "heading") return <SectionHead title={block.title} role={block.role} sheetKind={sheetKind} />;
  if (block.kind === "analysis") return <AnalysisBlock problem={block.problem} />;
  if (block.kind === "handout-answer") {
    return (
      <HandoutAnswerPart
        text={block.text}
        label={block.label}
        first={block.first}
        answerStart={block.answerStart}
      />
    );
  }
  return (
    <QuestionBlock
      problem={block.problem}
      index={block.index}
      blank={blank}
      blankLines={block.blankLines}
      blankAuto={blankAuto}
      role={block.role}
      label={block.label}
      sheetKind={sheetKind}
      withAnswers={withAnswers}
    />
  );
}

export function ExamSheet({
  title,
  dateLabel,
  items,
  withAnswers,
  blankLines = 5,
  blankAuto = false,
  sheetKind = "exam",
}: {
  title: string;
  dateLabel: string;
  items: ExamItem[];
  withAnswers: boolean;
  blankLines?: BlankLines;
  blankAuto?: boolean;
  sheetKind?: SheetKind;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Block[][]>([]);
  const headingCount = items.filter((item) => item.kind === "heading").length;
  const quoteDeck = useMemo(() => shuffle(MATH_QUIPS), [title, dateLabel, sheetKind]);
  const handout = sheetKind === "handout";

  const blocks = useMemo(() => {
    const next: Block[] = [];
    for (const item of items) {
      if (item.kind === "heading") {
        next.push({ kind: "heading", title: item.title, role: item.role });
      } else {
        next.push({
          kind: "q",
          problem: item.problem,
          index: item.number - 1,
          blankLines: item.blankLines ?? blankLines,
          role: item.role,
          label: item.label,
        });
        if (!handout && withAnswers) {
          next.push({ kind: "analysis", problem: item.problem, index: item.number - 1 });
        } else if (handout && withAnswers) {
          let first = true;
          const ideaParts = splitAnswerText(item.problem.analysis);
          const answerParts = splitAnswerText(item.problem.correctAnswer);
          ideaParts.forEach((text, index) => {
            next.push({
              kind: "handout-answer",
              text,
              label: index === 0 ? "思路" : undefined,
              first,
              answerStart: false,
            });
            first = false;
          });
          answerParts.forEach((text, index) => {
            next.push({
              kind: "handout-answer",
              text,
              label: index === 0 ? "答案" : undefined,
              first,
              answerStart: index === 0,
            });
            first = false;
          });
        }
      }
    }
    return next;
  }, [items, withAnswers, blankLines, handout]);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const measureRoot = root;
    let cancelled = false;

    async function paginate() {
      const imgs = [...measureRoot.querySelectorAll("img")];
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              }),
        ),
      );
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (cancelled) return;
      const mount = measureRef.current;
      if (!mount) return;

      const width = mount.clientWidth || 794;
      const pxPerMm = width / 210;
      const topMm = handout ? 16 : 25.4;
      const bottomMm = handout ? 18 : 25.4;
      const inner = (297 - topMm - bottomMm) * pxPerMm - 8 * pxPerMm;
      const head = mount.querySelector("[data-measure='head']") as HTMLElement | null;
      const titleNode = mount.querySelector("[data-measure='title']") as HTMLElement | null;
      const headH = head?.offsetHeight ?? 160;
      const titleH = titleNode?.offsetHeight ?? 0;
      const continuationHeadH = handout ? headH : 0;
      const itemNodes = [...mount.querySelectorAll<HTMLElement>("[data-measure='item']")];

      function spanHeight(from: number, to: number) {
        const start = itemNodes[from];
        const last = itemNodes[to];
        const nextNode = itemNodes[to + 1];
        if (!start || !last) return 0;
        if (nextNode) return nextNode.getBoundingClientRect().top - start.getBoundingClientRect().top;
        const child = (last.firstElementChild as HTMLElement | null) ?? last;
        const mb = parseFloat(getComputedStyle(child).marginBottom) || 0;
        return last.getBoundingClientRect().bottom - start.getBoundingClientRect().top + mb;
      }

      const packed: Block[][] = [];
      const groups: number[][] = [];
      for (let i = 0; i < blocks.length; i += 1) {
        const nextBlock = blocks[i + 1];
        if (
          blocks[i]?.kind === "q" &&
          (nextBlock?.kind === "analysis" || (nextBlock?.kind === "handout-answer" && nextBlock.first))
        ) {
          groups.push([i, i + 1]);
          i += 1;
        } else {
          groups.push([i]);
        }
      }

      let current: Block[] = [];
      let used = headH + titleH;
      for (const idxs of groups) {
        const groupBlocks = idxs.map((i) => blocks[i]).filter(Boolean) as Block[];
        const h = spanHeight(idxs[0] ?? 0, idxs[idxs.length - 1] ?? 0);
        if (current.length && used + h > inner) {
          packed.push(current);
          current = groupBlocks;
          used = continuationHeadH + h;
        } else {
          current.push(...groupBlocks);
          used += h;
        }
      }
      if (current.length) packed.push(current);
      for (let i = 0; i < packed.length - 1; i += 1) {
        const page = packed[i];
        const last = page.at(-1);
        if (last?.kind === "heading") {
          page.pop();
          packed[i + 1].unshift(last);
          if (!page.length) {
            packed.splice(i, 1);
            i -= 1;
          }
        }
      }
      setPages(packed.length ? packed : [[]]);
    }

    void paginate();
    return () => {
      cancelled = true;
    };
  }, [blocks, title, dateLabel, headingCount, withAnswers, blankLines, blankAuto, handout]);

  const head = handout ? (
    <HandoutHead quote={quoteDeck[0] ?? MATH_QUIPS[0]!} />
  ) : (
    <CoverHead title={title} dateLabel={dateLabel} headingCount={headingCount} analysis={withAnswers} />
  );

  return (
    <div className="exam-sheet" data-kind={sheetKind}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@500;700&display=swap"
      />
      <style>{`${katexCss}\n${EXAM_CSS}`}</style>
      <div className="exam-measure" ref={measureRef}>
        <div data-measure="head">{head}</div>
        {handout ? (
          <div data-measure="title">
            <HandoutTitle title={title} analysis={withAnswers} />
          </div>
        ) : null}
        {blocks.map((block, i) => (
          <div key={`${block.kind}-${i}`} data-measure="item">
            <BlockView
              block={block}
              blank={!withAnswers}
              blankLines={blankLines}
              blankAuto={blankAuto}
              sheetKind={sheetKind}
              withAnswers={withAnswers}
            />
          </div>
        ))}
      </div>

      <div className="exam-pack">
        {pages.map((pageBlocks, pageIndex) => (
          <article key={pageIndex} className="exam-page">
            {handout ? null : (
              <Seal
                msg={(quoteDeck[pageIndex % quoteDeck.length] ?? MATH_QUIPS[0]!).text.replace(/。$/, "")}
                bind={`——${(quoteDeck[pageIndex % quoteDeck.length] ?? MATH_QUIPS[0]!).by}`}
              />
            )}
            {!handout && pageIndex === 0 ? <ExamLogo /> : null}
            {pageIndex === 0 ? (
              <>
                {head}
                {handout ? <HandoutTitle title={title} analysis={withAnswers} /> : null}
              </>
            ) : handout ? (
              <HandoutHead
                quote={quoteDeck[pageIndex % quoteDeck.length] ?? MATH_QUIPS[0]!}
              />
            ) : null}
            {pageBlocks.map((block, i) => (
              <BlockView
                key={`${block.kind}-${i}`}
                block={block}
                blank={!withAnswers}
                blankLines={blankLines}
                blankAuto={blankAuto}
                sheetKind={sheetKind}
                withAnswers={withAnswers}
              />
            ))}
            <div className="exam-page-no">
              {handout ? (
                <>
                  <span>{title.trim() || "解集学案"}</span>
                  <span>
                    第 {pageIndex + 1} 页 · 共 {pages.length} 页
                  </span>
                </>
              ) : (
                <>
                  {title} · 第 {pageIndex + 1} 页 · 共 {pages.length} 页
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
