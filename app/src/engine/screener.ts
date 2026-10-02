// ============================================================
// 确定性筛选引擎 + 解释器
// 职责边界：
//   ✅ 输入「结构化条件 × 数据快照」，输出逐条件的判定与理由
//   ✅ 所有结论可追溯到具体字段值、口径与时点
//   ✅ 数据缺失 = 单独标记「无法判定」，绝不静默当作通过或不通过
//   ❌ 不理解自然语言（parser.ts 的事），不产出投资建议
// ============================================================
import { METRICS, OP_LABEL } from './metrics';
import type { CondEval, Condition, EvaluatedStock, StockRow } from './types';

export function condLabel(c: Condition): string {
  const m = METRICS[c.metric];
  const u = m.unit === '倍' ? ' 倍' : m.unit === 'pct' ? ' pct' : '%';
  if (c.op === 'between') return `${m.label} ${c.value}–${c.value2}${u}`;
  return `${m.label} ${OP_LABEL[c.op]} ${c.value}${u}`;
}

export function evalCondition(stock: StockRow, c: Condition): CondEval {
  const m = METRICS[c.metric];
  const actual = m.get(stock);
  const label = condLabel(c);
  if (actual == null) {
    return {
      condition: c, actual, pass: null,
      text: `${m.label}：数据缺失/不适用（${m.semantics}），无法判定「${label}」`,
    };
  }
  let pass: boolean;
  if (c.op === 'between') pass = actual >= c.value && actual <= (c.value2 ?? Infinity);
  else if (c.op === 'gte') pass = actual >= c.value;
  else pass = actual <= c.value;
  const opText = c.op === 'between'
    ? `${actual} ${pass ? '∈' : '∉'} [${c.value}, ${c.value2}]`
    : `${actual} ${pass ? '满足' : '不满足'} ${OP_LABEL[c.op]} ${c.value}`;
  return { condition: c, actual, pass, text: `${m.label}：${opText}（${m.unit === '倍' ? '倍' : m.unit === 'pct' ? 'pct' : '%'}）` };
}

export function screen(stocks: StockRow[], conditions: Condition[]): EvaluatedStock[] {
  const active = conditions.filter((c) => c.enabled);
  return stocks.map((stock) => {
    if (active.length === 0) {
      return { stock, status: 'unknown', evals: [], reasons: ['? 未启用任何条件，不构成筛选结论'] };
    }
    const evals = active.map((c) => evalCondition(stock, c));
    const hasMissing = evals.some((e) => e.pass === null);
    const allPass = evals.length > 0 && evals.every((e) => e.pass === true);
    const status = allPass ? 'included' : hasMissing ? 'unknown' : 'excluded';
    const reasons =
      status === 'included'
        ? evals.map((e) => `✓ ${e.text}`)
        : status === 'unknown'
          ? evals.filter((e) => e.pass !== true).map((e) => e.pass === null ? `? ${e.text}` : `✗ ${e.text}`)
          : evals.filter((e) => e.pass === false).map((e) => `✗ ${e.text}`);
    return { stock, status, evals, reasons };
  });
}

// ---------------- 冲突识别 ----------------

export interface Conflict {
  type: 'logic' | 'empty' | 'sparse';
  message: string;
  suggestion?: string;
}

/** 同一指标的多条区间条件是否逻辑互斥 */
export function detectLogicConflicts(conditions: Condition[]): Conflict[] {
  const out: Conflict[] = [];
  const active = conditions.filter((c) => c.enabled);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      if (a.metric !== b.metric) continue;
      const lo = (c: Condition) => (c.op === 'gte' ? c.value : c.op === 'between' ? c.value : -Infinity);
      const hi = (c: Condition) => (c.op === 'lte' ? c.value : c.op === 'between' ? (c.value2 ?? Infinity) : Infinity);
      if (Math.max(lo(a), lo(b)) > Math.min(hi(a), hi(b))) {
        out.push({
          type: 'logic',
          message: `逻辑互斥：「${condLabel(a)}」与「${condLabel(b)}」的取值区间没有交集，任何股票都不可能同时满足。`,
          suggestion: '修改或停用其中一条条件。',
        });
      }
    }
  }
  return out;
}

/** 结果为空/过少时的冲突提示与放松建议（找出「卡掉最多股票」的条件） */
export function detectEmpiricalConflicts(
  stocks: StockRow[], conditions: Condition[], results: EvaluatedStock[],
): Conflict[] {
  const active = conditions.filter((c) => c.enabled);
  const out: Conflict[] = [];
  const included = results.filter((r) => r.status === 'included').length;
  if (active.length === 0) return out;
  if (included > 0 && included <= 2) {
    out.push({
      type: 'sparse',
      message: `当前条件仅命中 ${included} 只股票，样本过少，结论的统计意义有限。`,
      suggestion: '可查看下方敏感性分析，适度放宽约束最强的条件。',
    });
  }
  if (included === 0) {
    // 找出放松收益最大的条件：逐条停用后入选数量最多者
    let best: { c: Condition; n: number } | null = null;
    for (const c of active) {
      const rest = conditions.map((x) => (x.id === c.id ? { ...x, enabled: false } : x));
      const n = screen(stocks, rest).filter((r) => r.status === 'included').length;
      if (!best || n > best.n) best = { c, n };
    }
    out.push({
      type: 'empty',
      message: '当前条件组合下没有股票入选（排除过多）。',
      suggestion: best
        ? `约束最强的是「${condLabel(best.c)}」：停用它后将有 ${best.n} 只入选。可在条件面板放宽其阈值。`
        : undefined,
    });
  }
  return out;
}

// ---------------- 敏感性分析 ----------------

export interface SensitivityRow {
  condition: Condition;
  label: string;
  current: number;         // 当前入选数
  loosen: { desc: string; count: number; delta: number };
  tighten: { desc: string; count: number; delta: number };
}

function scaled(v: number, f: number): number {
  if (v === 0) return f > 1 ? 5 : -5; // 阈值为 0 时用绝对步长 ±5
  return Math.round(v * f * 100) / 100;
}

/** 生成「放宽区间」与「收窄区间」两个候选（与数值正负无关，按区间几何意义扩/缩） */
function widen(c: Condition): Condition {
  const v = { ...c };
  if (c.op === 'lte') v.value = scaled(c.value, 1.25);
  else if (c.op === 'gte') v.value = scaled(c.value, 0.8);
  else { v.value = scaled(c.value, 0.8); v.value2 = scaled(c.value2 ?? 0, 1.25); }
  return v;
}
function narrow(c: Condition): Condition {
  const v = { ...c };
  if (c.op === 'lte') v.value = scaled(c.value, 0.8);
  else if (c.op === 'gte') v.value = scaled(c.value, 1.25);
  else { v.value = scaled(c.value, 1.25); v.value2 = scaled(c.value2 ?? 0, 0.8); }
  return v;
}

export function sensitivity(stocks: StockRow[], conditions: Condition[]): SensitivityRow[] {
  const active = conditions.filter((c) => c.enabled);
  const base = screen(stocks, conditions).filter((r) => r.status === 'included').length;
  return active.map((c) => {
    const withVar = (v: Condition) =>
      screen(stocks, conditions.map((x) => (x.id === c.id ? v : x)))
        .filter((r) => r.status === 'included').length;
    let lo = widen(c), ti = narrow(c);
    let nl = withVar(lo), nt = withVar(ti);
    // 负值阈值等场景下按实际入选数校正标签方向：入选多的才是「放松」
    if (nl < nt) { [lo, ti] = [ti, lo]; [nl, nt] = [nt, nl]; }
    return {
      condition: c,
      label: condLabel(c),
      current: base,
      loosen: { desc: condLabel(lo), count: nl, delta: nl - base },
      tighten: { desc: condLabel(ti), count: nt, delta: nt - base },
    };
  });
}

// ---------------- 股票对比 ----------------

export function compareRows(selected: StockRow[]) {
  return Object.values(METRICS).map((m) => ({
    label: m.label,
    unit: m.unit,
    semantics: m.semantics,
    values: selected.map((s) => m.get(s)),
  }));
}
