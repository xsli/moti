export const SUBJECTS = [
  "algebra",
  "geometry",
  "function",
  "trig",
  "calculus",
  "probability",
  "other",
] as const;

export type Subject = (typeof SUBJECTS)[number];

export const SUBJECT_LABEL: Record<Subject, string> = {
  algebra: "代数",
  geometry: "几何",
  function: "函数",
  trig: "三角",
  calculus: "微积分",
  probability: "概率",
  other: "其他",
};

export const ERROR_REASONS = [
  "misread",
  "concept",
  "calc",
  "method",
  "careless",
  "unknown",
] as const;

export type ErrorReason = (typeof ERROR_REASONS)[number];

export const ERROR_REASON_LABEL: Record<ErrorReason, string> = {
  misread: "审题不清",
  concept: "概念错误",
  calc: "计算失误",
  method: "方法不当",
  careless: "粗心笔误",
  unknown: "待复盘",
};

export type Mastery = "new" | "reviewing" | "mastered";

export const MASTERY_LABEL: Record<Mastery, string> = {
  new: "未掌握",
  reviewing: "巩固中",
  mastered: "已掌握",
};

export const MASTERY_DESCRIPTION: Record<Mastery, string> = {
  new: "尚未记住，当前仍会进入待复习队列",
  reviewing: "正在间隔巩固，累计记住 3 次后自动变为已掌握",
  mastered: "已经掌握，不再进入普通待复习队列",
};

export type SourceKind = "photo" | "text" | "sample";

export interface Figure {
  id: string;
  title: string;
  svg: string;
  caption: string;
  image?: string;
  subproblem?: number;
}

export interface Problem {
  id: string;
  createdAt: number;
  updatedAt: number;
  sourceKind: SourceKind;
  sourceImage?: string;
  title: string;
  stem: string;
  figures: Figure[];
  subject: Subject;
  tags: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  myAnswer: string;
  correctAnswer: string;
  analysis: string;
  notes: string;
  errorReason: ErrorReason;
  mastery: Mastery;
  reviewCount: number;
  nextReviewAt: number;
  collectionId?: string;
  sourceBatchId?: string;
  sourceOrder?: number;
}

export function isSubject(value: string): value is Subject {
  return (SUBJECTS as readonly string[]).includes(value);
}

export function isErrorReason(value: string): value is ErrorReason {
  return (ERROR_REASONS as readonly string[]).includes(value);
}

export function coerceSubject(value: string | undefined): Subject {
  if (!value) return "other";
  const key = value.trim().toLowerCase();
  const map: Record<string, Subject> = {
    algebra: "algebra",
    代数: "algebra",
    geometry: "geometry",
    几何: "geometry",
    function: "function",
    functions: "function",
    函数: "function",
    trig: "trig",
    trigonometry: "trig",
    三角: "trig",
    三角函数: "trig",
    calculus: "calculus",
    微积分: "calculus",
    probability: "probability",
    概率: "probability",
    统计: "probability",
    other: "other",
    其他: "other",
  };
  return map[key] ?? "other";
}
