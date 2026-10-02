// 主页面：编排「意图输入 → 澄清 → 条件 → 结果 → 敏感性 → 保存/监控」主链路
import { useMemo, useState } from 'react';
import snapshotJson from '../data/stocks.json';
import type { Ambiguity, Condition, StockRow } from '../engine/types';
import { applyAmbiguity, EXAMPLE_INTENTS, parseIntent } from '../engine/parser';
import {
  detectEmpiricalConflicts, detectLogicConflicts, screen, sensitivity, type Conflict,
} from '../engine/screener';
import IntentStep from './IntentStep';
import ConditionStep from './ConditionStep';
import ResultsStep from './ResultsStep';
import SensitivityStep from './SensitivityStep';
import StrategyStep from './StrategyStep';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface Snapshot {
  meta: {
    source: string; fetchedAt: string; universeDesc: string;
    priceWindow: string; finPeriodH1: string; finPeriodFY25: string;
    semantics: Record<string, string>;
  };
  stocks: StockRow[];
}
const snapshot = snapshotJson as unknown as Snapshot;
const STOCKS = snapshot.stocks;

export interface SavedItem {
  name: string;
  savedAt: string;
  conditions: Condition[];
  note?: string;
}

export default function Home() {
  const [raw, setRaw] = useState(EXAMPLE_INTENTS[0]);
  const [parsed, setParsed] = useState(false);
  const [interpretations, setInterpretations] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [complianceFlags, setComplianceFlags] = useState<string[]>([]);
  const [ambiguities, setAmbiguities] = useState<Ambiguity[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [strategies, setStrategies] = useState<SavedItem[]>(() =>
    JSON.parse(localStorage.getItem('zhixuan.strategies') ?? '[]'));
  const [monitors, setMonitors] = useState<SavedItem[]>(() =>
    JSON.parse(localStorage.getItem('zhixuan.monitors') ?? '[]'));

  const doParse = (text: string) => {
    const r = parseIntent(text);
    setInterpretations(r.interpretations);
    setUnsupported(r.unsupported);
    setComplianceFlags(r.complianceFlags);
    setAmbiguities(r.ambiguities);
    setConditions(r.conditions);
    setParsed(true);
  };

  const onSelectAmbiguity = (amb: Ambiguity, idx: number) => {
    setAmbiguities((prev) => prev.map((a) => (a.id === amb.id ? { ...a, selected: idx } : a)));
    setConditions((prev) => applyAmbiguity(prev, amb, idx));
  };

  const results = useMemo(() => screen(STOCKS, conditions), [conditions]);
  const conflicts: Conflict[] = useMemo(
    () => [...detectLogicConflicts(conditions), ...detectEmpiricalConflicts(STOCKS, conditions, results)],
    [conditions, results],
  );
  const sens = useMemo(() => sensitivity(STOCKS, conditions), [conditions]);

  const persist = (key: string, items: SavedItem[]) =>
    localStorage.setItem(key, JSON.stringify(items));
  const saveStrategy = (name: string) => {
    const items = [...strategies, { name, savedAt: new Date().toLocaleString('zh-CN'), conditions }];
    setStrategies(items); persist('zhixuan.strategies', items);
  };
  const saveMonitor = (name: string) => {
    const items = [...monitors, {
      name, savedAt: new Date().toLocaleString('zh-CN'), conditions,
      note: '本地模拟：已保存监控定义。生产部署中将在每个交易日收盘后自动重跑该条件组合，并在入选名单变化时推送提醒。',
    }];
    setMonitors(items); persist('zhixuan.monitors', items);
  };
  const removeItem = (kind: 's' | 'm', idx: number) => {
    if (kind === 's') {
      const items = strategies.filter((_, i) => i !== idx);
      setStrategies(items); persist('zhixuan.strategies', items);
    } else {
      const items = monitors.filter((_, i) => i !== idx);
      setMonitors(items); persist('zhixuan.monitors', items);
    }
  };
  const loadStrategy = (item: SavedItem) => {
    setConditions(item.conditions.map((c) => ({ ...c })));
    setParsed(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">智选 · 自然语言选股与策略解释器</h1>
            <Badge variant="secondary">A股样本池 {STOCKS.length} 只</Badge>
            <Badge variant="outline">数据：{snapshot.meta.source}</Badge>
            <Badge variant="outline">行情截至 2026-09-30（前复权）</Badge>
            <Badge variant="outline">财务：{snapshot.meta.finPeriodH1}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            把模糊的投资语言翻译成可检查、可修改、可执行的数据条件；每一只股票的入选/排除都有据可查。
            本产品仅做数据筛选与解释，<b>不提供买卖建议、涨跌预测或收益承诺</b>。
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <IntentStep
          raw={raw} setRaw={setRaw} onParse={() => doParse(raw)}
          parsed={parsed} interpretations={interpretations}
          unsupported={unsupported} complianceFlags={complianceFlags}
          ambiguities={ambiguities} onSelectAmbiguity={onSelectAmbiguity}
        />
        {parsed && (
          <>
            <ConditionStep conditions={conditions} setConditions={setConditions} conflicts={conflicts} />
            <Separator />
            <ResultsStep results={results} conditions={conditions} meta={snapshot.meta} />
            <SensitivityStep rows={sens} />
            <StrategyStep
              conditions={conditions}
              strategies={strategies} monitors={monitors}
              onSaveStrategy={saveStrategy} onSaveMonitor={saveMonitor}
              onLoad={loadStrategy} onRemove={removeItem}
            />
          </>
        )}
      </main>

      <footer className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs leading-5 text-slate-500">
          <p>数据口径：{snapshot.meta.universeDesc}；行情窗口 {snapshot.meta.priceWindow}；财务期 {snapshot.meta.finPeriodFY25} 与 {snapshot.meta.finPeriodH1}。数据获取日 {snapshot.meta.fetchedAt}。</p>
          <p className="mt-1">免责声明：本工具展示的是历史与当期公开数据的条件匹配结果，所有「事实、推断、不确定信息」已在界面中区分标注。筛选结果不构成投资建议，据此操作风险自负。</p>
        </div>
      </footer>
    </div>
  );
}
