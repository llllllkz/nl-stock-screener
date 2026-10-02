// ============================================================
// 意图解析层（AI 的角色）
// 职责边界：
//   ✅ 把模糊自然语言翻译成「可检查、可修改」的结构化条件草案
//   ✅ 识别歧义并给出澄清选项，识别当前数据不支持的意图
//   ❌ 不做任何筛选计算（由 screener.ts 确定性完成）
//   ❌ 不输出买卖建议、涨跌预测、收益承诺
// 本实现为透明的规则式解析器，接口设计与 LLM 解析器等价：
// 生产环境可用大模型替换 parseIntent 内部实现，输出契约不变。
// ============================================================
import type { Ambiguity, Condition, ParseResult } from './types';

let seq = 0;
const cid = () => `c${++seq}_${Math.random().toString(36).slice(2, 7)}`;

type CondSeed = Omit<Condition, 'id' | 'enabled' | 'source'>;
const seed = (metric: CondSeed['metric'], op: CondSeed['op'], value: number, origin: string, value2?: number): CondSeed =>
  ({ metric, op, value, value2, origin });
const cond = (s: CondSeed): Condition => ({ ...s, id: cid(), enabled: true, source: 'ai' });

interface PhraseRule {
  patterns: string[];
  interpretation: string;
  build?: () => CondSeed[];
  ambiguity?: Omit<Ambiguity, 'id' | 'selected'> & { defaultOption: number };
}

const RULES: PhraseRule[] = [
  {
    patterns: ['经营改善', '基本面改善', '业绩改善', '经营好转', '困境反转'],
    interpretation: '「经营改善」是模糊表述，需要澄清判定口径',
    ambiguity: {
      phrase: '经营改善',
      question: '「经营改善」希望按哪种口径判定？（2026 半年报 vs 2025 年报）',
      defaultOption: 0,
      options: [
        {
          label: '增速转正：2026H1 营收、归母净利、扣非净利同比均 > 0',
          conditions: [
            seed('revYoY', 'gte', 0, '经营改善·增速转正'),
            seed('profitYoY', 'gte', 0, '经营改善·增速转正'),
            seed('profitYoYEx', 'gte', 0, '经营改善·增速转正'),
          ],
        },
        {
          label: '改善加速：2026H1 归母净利同比 > 0 且较 2025 年报提速',
          conditions: [
            seed('profitYoY', 'gte', 0, '经营改善·改善加速'),
            seed('profitAccel', 'gte', 0, '经营改善·改善加速'),
          ],
        },
      ],
    },
  },
  {
    patterns: ['估值合理', '估值不贵', '合理估值', '估值适中'],
    interpretation: '「估值合理」需澄清合理区间（静态 PE 口径）',
    ambiguity: {
      phrase: '估值合理',
      question: '「估值合理」的区间如何界定？（静态 PE = 现价 ÷ 2025 年报 EPS）',
      defaultOption: 0,
      options: [
        { label: 'PE 0–30 倍（常规划分）', conditions: [seed('pe', 'between', 0, '估值合理', 30)] },
        { label: 'PE 0–20 倍 且 PB ≤ 3（兼顾净资产）', conditions: [seed('pe', 'between', 0, '估值合理', 20), seed('pb', 'lte', 3, '估值合理')] },
        { label: 'PE 0–15 倍（偏严格）', conditions: [seed('pe', 'between', 0, '估值合理', 15)] },
      ],
    },
  },
  {
    patterns: ['低估', '便宜', '估值低'],
    interpretation: '「低估」按静态 PE 0–15 倍理解，可在条件面板修改',
    build: () => [seed('pe', 'between', 0, '低估', 15)],
  },
  {
    patterns: ['走势稳定', '走势相对稳定', '波动小', '走势稳健', '回撤小', '波动率低', '稳健'],
    interpretation: '「走势稳定」需澄清严格程度（年化波动率 + 最大回撤口径）',
    ambiguity: {
      phrase: '走势稳定',
      question: '「走势稳定」按什么严格程度？（近一年前复权日线：2025-10-09 至 2026-09-30）',
      defaultOption: 0,
      options: [
        { label: '适中：年化波动率 ≤ 30% 且最大回撤 ≥ −20%', conditions: [seed('annVol', 'lte', 30, '走势稳定·适中'), seed('maxDD', 'gte', -20, '走势稳定·适中')] },
        { label: '严格：年化波动率 ≤ 20% 且最大回撤 ≥ −12%', conditions: [seed('annVol', 'lte', 20, '走势稳定·严格'), seed('maxDD', 'gte', -12, '走势稳定·严格')] },
        { label: '宽松：年化波动率 ≤ 40%', conditions: [seed('annVol', 'lte', 40, '走势稳定·宽松')] },
      ],
    },
  },
  {
    patterns: ['高增长', '高成长', '快速成长', '成长性好', '高速增长'],
    interpretation: '「高增长」按 2026H1 营收与归母净利同比均 ≥ 20% 理解，可修改',
    build: () => [seed('revYoY', 'gte', 20, '高增长'), seed('profitYoY', 'gte', 20, '高增长')],
  },
  {
    patterns: ['盈利能力强', '高roe', '优质', '白马', '盈利质量好'],
    interpretation: '「盈利能力强」按 2026H1 ROE ≥ 8%（约对应年化 15%+）且净利率 ≥ 10% 理解，可修改',
    build: () => [seed('roeH1', 'gte', 8, '盈利能力强'), seed('netMargin', 'gte', 10, '盈利能力强')],
  },
  {
    patterns: ['近期强势', '动量', '上涨趋势', '走势强', '近期上涨'],
    interpretation: '「近期强势」按近 60 日涨幅 ≥ 10% 理解，可修改',
    build: () => [seed('ret60', 'gte', 10, '近期强势')],
  },
  {
    patterns: ['超跌', '深度回调', '跌得多', '大幅回调'],
    interpretation: '「超跌」按近 120 日跌幅 ≤ −15% 理解，可修改',
    build: () => [seed('ret120', 'lte', -15, '超跌')],
  },
];

/** 当前数据集不支持的意图：如实告知，不静默忽略、不编造数据 */
const UNSUPPORTED: { patterns: string[]; reason: string }[] = [
  { patterns: ['高股息', '股息率', '分红'], reason: '当前数据快照未包含股息率/分红字段，无法筛选「高股息」。可改用低 PE/PB 近似，或接入分红数据后支持。' },
  { patterns: ['大盘股', '蓝筹', '市值', '小盘'], reason: '当前数据快照未包含市值字段，无法按市值规模筛选。' },
  { patterns: ['北向资金', '主力资金', '资金流向'], reason: '当前数据快照未包含资金流向字段（iFinD MCP 资金数据可扩展接入）。' },
];

/** 合规边界：命中这些表述时明确提示产品不提供该类输出 */
const COMPLIANCE: { patterns: string[]; notice: string }[] = [
  { patterns: ['必涨', '稳赚', '包赚', '保本'], notice: '「{p}」属于收益承诺类表述：本产品不提供任何收益承诺，筛选结果仅为历史数据的条件匹配。' },
  { patterns: ['买入', '卖出', '推荐买', '建议买', '目标价', '满仓', '抄底'], notice: '「{p}」属于买卖建议类表述：本产品不提供买卖建议或目标价，仅提供可解释的数据筛选结果。' },
  { patterns: ['预测', '会涨', '会跌', '明天涨'], notice: '「{p}」属于涨跌预测类表述：本产品不做确定性涨跌预测，仅呈现历史与当期数据事实。' },
];

export function parseIntent(raw: string): ParseResult {
  const text = raw.trim();
  const interpretations: string[] = [];
  const conditions: Condition[] = [];
  const ambiguities: Ambiguity[] = [];
  const unsupported: string[] = [];
  const complianceFlags: string[] = [];
  const matched = new Set<string>();

  for (const rule of RULES) {
    const hit = rule.patterns.find((p) => text.includes(p));
    if (!hit) continue;
    matched.add(hit);
    interpretations.push(rule.interpretation);
    if (rule.ambiguity) {
      const { defaultOption, ...rest } = rule.ambiguity;
      const amb: Ambiguity = { ...rest, id: cid(), selected: defaultOption };
      ambiguities.push(amb);
      for (const c of amb.options[defaultOption].conditions) conditions.push(cond(c));
    } else if (rule.build) {
      for (const c of rule.build()) conditions.push(cond(c));
    }
  }

  for (const u of UNSUPPORTED) {
    const hit = u.patterns.find((p) => text.includes(p));
    if (hit) { unsupported.push(u.reason); matched.add(hit); }
  }
  for (const c of COMPLIANCE) {
    const hit = c.patterns.find((p) => text.includes(p));
    if (hit) complianceFlags.push(c.notice.replace('{p}', hit));
  }

  if (conditions.length === 0 && ambiguities.length === 0 && unsupported.length === 0) {
    interpretations.push('未识别出可结构化的选股意图。可以试试：「经营改善、估值合理、走势相对稳定」「高增长、盈利能力强、近期强势」等表达。');
  }
  return { raw, interpretations, conditions, ambiguities, unsupported, complianceFlags };
}

/** 用户切换澄清选项时，用新选项条件替换旧选项条件（按 origin 前缀追溯） */
export function applyAmbiguity(conditions: Condition[], amb: Ambiguity, optionIdx: number): Condition[] {
  const prefix = amb.phrase;
  const kept = conditions.filter((c) => !c.origin.startsWith(prefix));
  const added = amb.options[optionIdx].conditions.map(cond);
  return [...kept, ...added];
}

/** 数值型短语兜底：如 "PE<20"、"ROE大于10%"（演示可检查性：直接生成对应条件） */
export function parseNumericPatch(text: string): CondSeed[] {
  const out: CondSeed[] = [];
  let m = /pe\s*([<>≤≥=]+)\s*(\d+)/i.exec(text);
  if (m) out.push(seed('pe', /[>≥]/.test(m[1]) ? 'gte' : 'lte', Number(m[2]), '用户数值补充'));
  m = /roe[^0-9]{0,4}(\d+)\s*%?/i.exec(text);
  if (m) out.push(seed('roeH1', 'gte', Number(m[1]), '用户数值补充'));
  return out;
}

export const EXAMPLE_INTENTS = [
  '经营改善、估值合理、走势相对稳定',
  '高增长、盈利能力强，近期强势',
  '低估、白马、波动小',
  '超跌但经营改善的股票',
  '高股息、必涨的票推荐买入', // 演示：不支持意图 + 合规边界
];
