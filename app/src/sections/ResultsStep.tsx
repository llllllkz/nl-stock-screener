// 第④步：筛选结果 —— 入选/排除/无法判定 三栏，逐股票给出可追溯理由；支持勾选对比
import { useMemo, useState } from 'react';
import type { Condition, EvaluatedStock, StockRow } from '../engine/types';
import { compareRows } from '../engine/screener';
import { fmtActual } from '../engine/metrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Meta { source: string; priceWindow: string; finPeriodH1: string; finPeriodFY25: string }
interface Props {
  results: EvaluatedStock[];
  conditions: Condition[];
  meta: Meta;
}

function StockCard({
  r, checked, onCheck,
}: { r: EvaluatedStock; checked: boolean; onCheck: (v: boolean) => void }) {
  const s = r.stock;
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={(v) => onCheck(!!v)} />
        <span className="font-semibold">{s.name}</span>
        <span className="text-xs text-slate-400">{s.code}</span>
        <span className="ml-auto text-xs text-slate-500">收盘 {s.close} 元（{s.lastDate}）</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
        <span>PE {fmtActual('pe', s.pe)}</span>
        <span>PB {fmtActual('pb', s.pb)}</span>
        <span>ROE(H1) {fmtActual('roeH1', s.roeH1)}</span>
        <span>营收同比 {fmtActual('revYoY', s.revYoY)}</span>
        <span>归母同比 {fmtActual('profitYoY', s.profitYoY)}</span>
        <span>波动率 {fmtActual('annVol', s.annVol)}</span>
        <span>回撤 {fmtActual('maxDD', s.maxDD)}</span>
      </div>
      <ul className="mt-2 space-y-0.5">
        {r.reasons.map((t, i) => (
          <li
            key={i}
            className={`text-xs leading-5 ${
              t.startsWith('✓') ? 'text-emerald-700' : t.startsWith('?') ? 'text-amber-700' : 'text-rose-700'
            }`}
          >{t}</li>
        ))}
      </ul>
    </div>
  );
}

function StockList({
  list, selected, toggle, emptyText,
}: { list: EvaluatedStock[]; selected: Set<string>; toggle: (code: string, v: boolean) => void; emptyText: string }) {
  if (list.length === 0) return <p className="py-6 text-center text-sm text-slate-400">{emptyText}</p>;
  return (
    <ScrollArea className="h-[420px] pr-3">
      <div className="space-y-2">
        {list.map((r) => (
          <StockCard key={r.stock.code} r={r} checked={selected.has(r.stock.code)} onCheck={(v) => toggle(r.stock.code, v)} />
        ))}
      </div>
    </ScrollArea>
  );
}

export default function ResultsStep({ results, conditions, meta }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);

  const included = results.filter((r) => r.status === 'included');
  const excluded = results.filter((r) => r.status === 'excluded');
  const unknown = results.filter((r) => r.status === 'unknown');
  const activeCount = conditions.filter((c) => c.enabled).length;

  const toggle = (code: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(code); else next.delete(code);
      return next;
    });

  const selectedStocks: StockRow[] = useMemo(
    () => results.filter((r) => selected.has(r.stock.code)).map((r) => r.stock),
    [results, selected],
  );
  const rows = useMemo(() => compareRows(selectedStocks), [selectedStocks]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">4</span>
          筛选结果与解释
          <Badge className="bg-emerald-600">入选 {included.length}</Badge>
          <Badge variant="outline" className="border-rose-300 text-rose-600">排除 {excluded.length}</Badge>
          <Badge variant="outline" className="border-amber-300 text-amber-600">无法判定 {unknown.length}</Badge>
          <Button
            size="sm" variant="outline" className="ml-auto"
            disabled={selected.size < 2} onClick={() => setCompareOpen(true)}
          >对比已选（{selected.size}）</Button>
        </CardTitle>
        {activeCount === 0 && (
          <p className="text-sm text-amber-600">当前没有启用任何条件：下方展示全样本，不构成筛选结论。</p>
        )}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="in">
          <TabsList>
            <TabsTrigger value="in">入选（{included.length}）</TabsTrigger>
            <TabsTrigger value="out">排除（{excluded.length}）</TabsTrigger>
            <TabsTrigger value="unknown">无法判定（{unknown.length}）</TabsTrigger>
          </TabsList>
          <TabsContent value="in">
            <StockList list={included} selected={selected} toggle={toggle} emptyText="没有股票同时满足全部条件——请查看「条件冲突」提示或敏感性分析。" />
          </TabsContent>
          <TabsContent value="out">
            <StockList list={excluded} selected={selected} toggle={toggle} emptyText="没有股票被排除。" />
          </TabsContent>
          <TabsContent value="unknown">
            <p className="mb-2 text-xs text-slate-500">这些股票至少有一个条件的字段缺失/不适用（例如 2025 年亏损导致静态 PE 无意义）。按口径要求，我们不把它们静默当作「不通过」。</p>
            <StockList list={unknown} selected={selected} toggle={toggle} emptyText="没有数据缺失的股票。" />
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>股票对比（{selectedStocks.map((s) => s.name).join(' vs ')}）</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">口径：行情 {meta.priceWindow}；财务 {meta.finPeriodH1} / {meta.finPeriodFY25}；来源 {meta.source}。</p>
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>指标</TableHead>
                  {selectedStocks.map((s) => <TableHead key={s.code}>{s.name}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.label} title={row.semantics}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    {row.values.map((v, i) => (
                      <TableCell key={i}>{v == null ? <span className="text-amber-600">缺失</span> : `${v}${row.unit === '倍' ? ' 倍' : row.unit === 'pct' ? ' pct' : '%'}`}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
