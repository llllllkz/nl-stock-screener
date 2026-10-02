// 指标注册表：每个指标的名称、单位、口径说明、取值函数
// 口径说明直接来自数据快照元数据，保证「核心结论可回到原始字段」
import type { MetricKey, StockRow } from './types';

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  /** 数据口径：字段来源、时点、统计方式 */
  semantics: string;
  /** 数值方向：越大越好 / 越小越好 / 中性 */
  direction: 'higher' | 'lower' | 'neutral';
  get: (s: StockRow) => number | null;
}

export const METRICS: Record<MetricKey, MetricDef> = {
  pe: {
    key: 'pe', label: '静态市盈率 PE', unit: '倍', direction: 'lower',
    semantics: '2026-09-30 收盘价 ÷ 2025 年报基本 EPS（iFinD）。2025 年亏损（EPS≤0）时无此口径数据',
    get: (s) => s.pe,
  },
  pb: {
    key: 'pb', label: '市净率 PB', unit: '倍', direction: 'lower',
    semantics: '2026-09-30 收盘价 ÷ 2026 半年报每股净资产（iFinD）',
    get: (s) => s.pb,
  },
  roeH1: {
    key: 'roeH1', label: 'ROE（2026H1）', unit: '%', direction: 'higher',
    semantics: '2026 年半年报净资产收益率，未年化（iFinD ths_roe_stock）',
    get: (s) => s.roeH1,
  },
  netMargin: {
    key: 'netMargin', label: '净利率（2026H1）', unit: '%', direction: 'higher',
    semantics: '2026 年半年报销售净利率（iFinD ths_net_sales_rate_stock）',
    get: (s) => s.netMargin,
  },
  grossMargin: {
    key: 'grossMargin', label: '毛利率（2026H1）', unit: '%', direction: 'higher',
    semantics: '2026 年半年报销售毛利率（iFinD ths_gross_selling_rate_stock）',
    get: (s) => s.grossMargin,
  },
  revYoY: {
    key: 'revYoY', label: '营收同比（2026H1）', unit: '%', direction: 'higher',
    semantics: '2026 半年报营业收入同比增速（iFinD ths_or_yoy_stock）',
    get: (s) => s.revYoY,
  },
  profitYoY: {
    key: 'profitYoY', label: '归母净利同比（2026H1）', unit: '%', direction: 'higher',
    semantics: '2026 半年报归属母公司净利润同比增速（iFinD ths_np_atsopc_yoy_stock）',
    get: (s) => s.profitYoY,
  },
  profitYoYEx: {
    key: 'profitYoYEx', label: '扣非净利同比（2026H1）', unit: '%', direction: 'higher',
    semantics: '2026 半年报扣非归母净利润同比增速（iFinD ths_np_atsopc_dnrgal_yoy_stock）',
    get: (s) => s.profitYoYEx,
  },
  profitAccel: {
    key: 'profitAccel', label: '净利增速变化（H1−FY25）', unit: 'pct', direction: 'higher',
    semantics: '派生指标 = 2026H1 归母净利同比 − 2025 年报归母净利同比，>0 表示增长提速',
    get: (s) => (s.profitYoY != null && s.profitYoYFY25 != null
      ? Math.round((s.profitYoY - s.profitYoYFY25) * 10) / 10 : null),
  },
  annVol: {
    key: 'annVol', label: '年化波动率', unit: '%', direction: 'lower',
    semantics: '2025-10-09 至 2026-09-30 前复权日线，日对数收益率标准差 × √244',
    get: (s) => s.annVol,
  },
  maxDD: {
    key: 'maxDD', label: '近一年最大回撤', unit: '%', direction: 'higher',
    semantics: '同上窗口内最大回撤（负值，越接近 0 回撤越小）',
    get: (s) => s.maxDD,
  },
  ret60: {
    key: 'ret60', label: '近60日涨跌幅', unit: '%', direction: 'neutral',
    semantics: '截至 2026-09-30 的近 60 个交易日区间涨跌幅（前复权）',
    get: (s) => s.ret60,
  },
  ret120: {
    key: 'ret120', label: '近120日涨跌幅', unit: '%', direction: 'neutral',
    semantics: '截至 2026-09-30 的近 120 个交易日区间涨跌幅（前复权）',
    get: (s) => s.ret120,
  },
};

export const OP_LABEL: Record<string, string> = { gte: '≥', lte: '≤', between: '介于' };

export function fmtActual(key: MetricKey, v: number | null): string {
  if (v == null) return '缺失';
  const u = METRICS[key].unit;
  return u === '倍' ? `${v} 倍` : u === 'pct' ? `${v} pct` : `${v}%`;
}
