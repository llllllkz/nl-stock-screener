// 引擎测试：覆盖主链路、数据缺失、接口/异常边界、合规边界
import { describe, expect, it } from 'vitest';
import { applyAmbiguity, parseIntent } from './parser';
import {
  detectEmpiricalConflicts, detectLogicConflicts, screen, sensitivity,
} from './screener';
import type { Condition, StockRow } from './types';

const mkStock = (patch: Partial<StockRow>): StockRow => ({
  code: '000000.SZ', name: '测试股', close: 10, lastDate: '20260930',
  annVol: 25, maxDD: -15, ret60: 5, ret120: 3,
  pe: 20, pb: 2, roeH1: 9, netMargin: 12, grossMargin: 30, epsFY25: 0.5,
  revYoY: 8, profitYoY: 10, profitYoYEx: 6, revYoYFY25: 4, profitYoYFY25: 5,
  ...patch,
});

const cond = (patch: Partial<Condition>): Condition => ({
  id: Math.random().toString(36).slice(2), metric: 'pe', op: 'lte', value: 30,
  enabled: true, source: 'ai', origin: '测试', ...patch,
});

describe('意图解析（主链路）', () => {
  it('「经营改善、估值合理、走势相对稳定」→ 结构化条件 + 三个澄清项', () => {
    const r = parseIntent('经营改善、估值合理、走势相对稳定');
    expect(r.ambiguities).toHaveLength(3);
    expect(r.conditions.length).toBeGreaterThanOrEqual(5); // 3+1+2 默认选项
    expect(r.unsupported).toHaveLength(0);
    // 每条条件都可追溯到来源表述
    for (const c of r.conditions) expect(c.origin.length).toBeGreaterThan(0);
  });

  it('澄清选项切换后条件随之替换', () => {
    const r = parseIntent('估值合理');
    const amb = r.ambiguities[0];
    const strict = applyAmbiguity(r.conditions, amb, 2);
    expect(strict.some((c) => c.metric === 'pe' && c.op === 'between' && c.value2 === 15)).toBe(true);
    expect(strict.some((c) => c.metric === 'pb')).toBe(false);
  });

  it('无法识别的输入给出提示且不产出条件', () => {
    const r = parseIntent('今天天气怎么样');
    expect(r.conditions).toHaveLength(0);
    expect(r.interpretations[0]).toContain('未识别');
  });
});

describe('不支持意图与合规边界', () => {
  it('「高股息」如实标记为不支持，不静默忽略', () => {
    const r = parseIntent('高股息的股票');
    expect(r.unsupported.some((t) => t.includes('股息'))).toBe(true);
    expect(r.conditions).toHaveLength(0);
  });

  it('「必涨/推荐买入」触发合规提示，且不生成任何买卖建议', () => {
    const r = parseIntent('高股息、必涨的票推荐买入');
    expect(r.complianceFlags.length).toBeGreaterThanOrEqual(2);
    expect(r.complianceFlags.join('')).toContain('不提供');
  });
});

describe('确定性筛选引擎', () => {
  it('满足全部条件 → included，理由含实际数值', () => {
    const res = screen([mkStock({ pe: 18 })], [cond({ metric: 'pe', op: 'lte', value: 30 })]);
    expect(res[0].status).toBe('included');
    expect(res[0].reasons[0]).toContain('18');
  });

  it('不满足 → excluded，理由标注具体字段与阈值', () => {
    const res = screen([mkStock({ annVol: 45 })], [cond({ metric: 'annVol', op: 'lte', value: 30 })]);
    expect(res[0].status).toBe('excluded');
    expect(res[0].reasons[0]).toContain('45');
  });

  it('数据缺失 → unknown（绝不静默当作不通过）', () => {
    const res = screen([mkStock({ pe: null })], [cond({ metric: 'pe', op: 'lte', value: 30 })]);
    expect(res[0].status).toBe('unknown');
    expect(res[0].reasons[0]).toContain('缺失');
  });

  it('派生指标 profitAccel = 2026H1 同比 − 2025 年报同比', () => {
    const res = screen(
      [mkStock({ profitYoY: 12, profitYoYFY25: 5 })],
      [cond({ metric: 'profitAccel', op: 'gte', value: 0 })],
    );
    expect(res[0].status).toBe('included');
    expect(res[0].evals[0].actual).toBeCloseTo(7);
  });

  it('全部条件停用时，任何股票都不构成「入选」结论', () => {
    const res = screen([mkStock({})], [cond({ enabled: false })]);
    expect(res[0].status).not.toBe('included');
  });
});

describe('冲突识别', () => {
  it('同一指标区间无交集 → 逻辑互斥', () => {
    const cs = [
      cond({ metric: 'pe', op: 'lte', value: 15 }),
      cond({ metric: 'pe', op: 'gte', value: 30 }),
    ];
    const out = detectLogicConflicts(cs);
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('互斥');
  });

  it('结果为空时指出约束最强的条件并给出放松建议', () => {
    const stocks = [mkStock({ pe: 50 }), mkStock({ pe: 60 })];
    const cs = [
      cond({ id: 'a', metric: 'pe', op: 'lte', value: 10 }),
      cond({ id: 'b', metric: 'pb', op: 'lte', value: 3 }),
    ];
    const res = screen(stocks, cs);
    const out = detectEmpiricalConflicts(stocks, cs, res);
    expect(out.some((o) => o.type === 'empty')).toBe(true);
    expect(out[0].suggestion).toContain('静态市盈率');
  });
});

describe('敏感性分析', () => {
  it('放松约束入选数增加、收紧减少', () => {
    const stocks = [mkStock({ pe: 20 }), mkStock({ pe: 35 }), mkStock({ pe: 10 })];
    const cs = [cond({ id: 'x', metric: 'pe', op: 'lte', value: 30 })];
    const rows = sensitivity(stocks, cs);
    expect(rows).toHaveLength(1);
    expect(rows[0].current).toBe(2);
    expect(rows[0].loosen.count).toBe(3);   // 30→37.5 纳入 35
    expect(rows[0].tighten.count).toBe(2);  // 30→24，满足 ≤24 的为 20 和 10
  });

  it('负值阈值（如最大回撤 ≥ −20）方向不颠倒：放松应增加入选', () => {
    const stocks = [mkStock({ maxDD: -18 }), mkStock({ maxDD: -23 }), mkStock({ maxDD: -10 })];
    const cs = [cond({ id: 'm', metric: 'maxDD', op: 'gte', value: -20 })];
    const rows = sensitivity(stocks, cs);
    expect(rows[0].current).toBe(2);            // -18、-10
    expect(rows[0].loosen.count).toBe(3);       // 放松到 ≥ −25，纳入 -23
    expect(rows[0].tighten.count).toBeLessThanOrEqual(2);
  });
});
