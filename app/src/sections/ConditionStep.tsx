// 第③步：结构化条件面板 —— 可检查（来源/口径）、可修改（阈值/启停/删除/新增）
import { useState } from 'react';
import type { Condition, MetricKey, Op } from '../engine/types';
import { METRICS } from '../engine/metrics';
import { condLabel, type Conflict } from '../engine/screener';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Trash2, Plus, Info, OctagonAlert } from 'lucide-react';

interface Props {
  conditions: Condition[];
  setConditions: (c: Condition[]) => void;
  conflicts: Conflict[];
}

const OP_OPTIONS: { v: Op; label: string }[] = [
  { v: 'gte', label: '≥' }, { v: 'lte', label: '≤' }, { v: 'between', label: '介于' },
];

export default function ConditionStep({ conditions, setConditions, conflicts }: Props) {
  const [metric, setMetric] = useState<MetricKey>('pe');
  const [op, setOp] = useState<Op>('lte');
  const [v1, setV1] = useState('30');
  const [v2, setV2] = useState('');

  const update = (id: string, patch: Partial<Condition>) =>
    setConditions(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addCondition = () => {
    const value = Number(v1);
    if (Number.isNaN(value)) return;
    const c: Condition = {
      id: `u_${Date.now()}`, metric, op, value,
      value2: op === 'between' ? Number(v2 || 0) : undefined,
      enabled: true, source: 'user', origin: '手动添加',
    };
    setConditions([...conditions, c]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span>
          结构化条件（可检查 · 可修改 · 可执行）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {conflicts.map((cf, i) => (
          <Alert key={i} variant={cf.type === 'logic' ? 'destructive' : 'default'}>
            <OctagonAlert className="h-4 w-4" />
            <AlertTitle>{cf.type === 'logic' ? '条件冲突' : cf.type === 'empty' ? '结果为空' : '结果过少'}</AlertTitle>
            <AlertDescription>{cf.message}{cf.suggestion ? ` 建议：${cf.suggestion}` : ''}</AlertDescription>
          </Alert>
        ))}

        {conditions.length === 0 && (
          <p className="text-sm text-slate-400">暂无条件。请先解析意图，或在下方手动添加。</p>
        )}

        <TooltipProvider>
          <div className="space-y-2">
            {conditions.map((c) => {
              const m = METRICS[c.metric];
              return (
                <div
                  key={c.id}
                  className={`flex flex-wrap items-center gap-2 rounded-md border p-2 ${c.enabled ? 'bg-white' : 'bg-slate-100 opacity-60'}`}
                >
                  <Switch checked={c.enabled} onCheckedChange={(v) => update(c.id, { enabled: v })} />
                  <Badge variant={c.source === 'ai' ? 'secondary' : 'outline'}>
                    {c.source === 'ai' ? 'AI' : '手动'}
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex cursor-help items-center gap-1 text-sm font-medium">
                        {m.label} <Info className="h-3.5 w-3.5 text-slate-400" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">口径：{m.semantics}</p>
                      <p className="mt-1 text-xs text-slate-300">来源：{c.origin}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Select value={c.op} onValueChange={(v) => update(c.id, { op: v as Op })}>
                    <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OP_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" className="h-8 w-24" value={c.value}
                    onChange={(e) => update(c.id, { value: Number(e.target.value) })}
                  />
                  {c.op === 'between' && (
                    <>
                      <span className="text-sm text-slate-500">至</span>
                      <Input
                        type="number" className="h-8 w-24" value={c.value2 ?? 0}
                        onChange={(e) => update(c.id, { value2: Number(e.target.value) })}
                      />
                    </>
                  )}
                  <span className="text-xs text-slate-500">{m.unit === '倍' ? '倍' : m.unit === 'pct' ? 'pct' : '%'}</span>
                  <span className="ml-auto text-xs text-slate-400">{condLabel(c)}</span>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => setConditions(conditions.filter((x) => x.id !== c.id))}
                  ><Trash2 className="h-4 w-4" /></Button>
                </div>
              );
            })}
          </div>
        </TooltipProvider>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
          <span className="text-sm text-slate-500">手动添加：</span>
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(METRICS).map((m) => (
                <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={op} onValueChange={(v) => setOp(v as Op)}>
            <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OP_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" className="h-8 w-24" value={v1} onChange={(e) => setV1(e.target.value)} />
          {op === 'between' && (
            <Input type="number" className="h-8 w-24" placeholder="上界" value={v2} onChange={(e) => setV2(e.target.value)} />
          )}
          <Button size="sm" variant="outline" onClick={addCondition}><Plus className="mr-1 h-4 w-4" />添加</Button>
        </div>
      </CardContent>
    </Card>
  );
}
