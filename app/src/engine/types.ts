// 核心类型定义：自然语言意图 → 结构化条件 → 可解释筛选结果

/** 支持的指标键（含由原始字段派生的虚拟指标） */
export type MetricKey =
  | 'pe' | 'pb'
  | 'roeH1' | 'netMargin' | 'grossMargin'
  | 'revYoY' | 'profitYoY' | 'profitYoYEx' | 'profitAccel'
  | 'annVol' | 'maxDD' | 'ret60' | 'ret120';

export type Op = 'gte' | 'lte' | 'between';

/** 一条可检查、可修改、可执行的数据条件 */
export interface Condition {
  id: string;
  metric: MetricKey;
  op: Op;
  value: number;
  value2?: number; // op=between 时的上界
  enabled: boolean;
  source: 'ai' | 'user';
  /** 该条件来自哪句自然语言 / 哪个澄清选项，便于追溯 */
  origin: string;
}

/** 模糊表达的澄清选项 */
export interface Ambiguity {
  id: string;
  phrase: string;
  question: string;
  options: { label: string; conditions: Omit<Condition, 'id' | 'enabled' | 'source'>[] }[];
  selected: number;
}

export interface ParseResult {
  raw: string;
  interpretations: string[];
  conditions: Condition[];
  ambiguities: Ambiguity[];
  /** 数据中不支持的意图（如实告知，不静默忽略） */
  unsupported: string[];
  /** 触发合规边界的表述（买卖建议/收益承诺等） */
  complianceFlags: string[];
}

export interface StockRow {
  code: string; name: string;
  close: number; lastDate: string;
  annVol: number | null; maxDD: number | null; ret60: number | null; ret120: number | null;
  pe: number | null; pb: number | null;
  roeH1: number | null; netMargin: number | null; grossMargin: number | null;
  epsFY25: number | null;
  revYoY: number | null; profitYoY: number | null; profitYoYEx: number | null;
  revYoYFY25: number | null; profitYoYFY25: number | null;
}

export interface CondEval {
  condition: Condition;
  actual: number | null;
  /** null = 数据缺失/不适用，无法判定 */
  pass: boolean | null;
  text: string;
}

export type ScreenStatus = 'included' | 'excluded' | 'unknown';

export interface EvaluatedStock {
  stock: StockRow;
  status: ScreenStatus;
  evals: CondEval[];
  reasons: string[];
}
