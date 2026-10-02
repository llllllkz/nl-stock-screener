// 第⑥步：策略保存 / 加载 / 转监控任务（localStorage 本地持久化，诚实标注模拟边界）
import { useState } from 'react';
import type { Condition } from '../engine/types';
import type { SavedItem } from './Home';
import { condLabel } from '../engine/screener';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Save, Bell, FolderOpen, Trash2 } from 'lucide-react';

interface Props {
  conditions: Condition[];
  strategies: SavedItem[];
  monitors: SavedItem[];
  onSaveStrategy: (name: string) => void;
  onSaveMonitor: (name: string) => void;
  onLoad: (item: SavedItem) => void;
  onRemove: (kind: 's' | 'm', idx: number) => void;
}

export default function StrategyStep(p: Props) {
  const [name, setName] = useState('');
  const active = p.conditions.filter((c) => c.enabled);

  const Item = ({ item, kind, idx }: { item: SavedItem; kind: 's' | 'm'; idx: number }) => (
    <div className="rounded-md border bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{item.name}</span>
        <span className="text-xs text-slate-400">{item.savedAt}</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => p.onLoad(item)}>
            <FolderOpen className="mr-1 h-3.5 w-3.5" />载入
          </Button>
          <Button size="sm" variant="ghost" onClick={() => p.onRemove(kind, idx)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {item.conditions.filter((c) => c.enabled).map((c) => (
          <Badge key={c.id} variant="secondary" className="text-xs">{condLabel(c)}</Badge>
        ))}
      </div>
      {item.note && <p className="mt-1 text-xs text-slate-500">{item.note}</p>}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">6</span>
          保存策略 / 转为监控任务
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-64" placeholder="给当前条件组合起个名字"
            value={name} onChange={(e) => setName(e.target.value)}
          />
          <Button
            variant="outline" disabled={!name || active.length === 0}
            onClick={() => { p.onSaveStrategy(name); setName(''); }}
          ><Save className="mr-1 h-4 w-4" />保存策略</Button>
          <Button
            variant="outline" disabled={!name || active.length === 0}
            onClick={() => { p.onSaveMonitor(name); setName(''); }}
          ><Bell className="mr-1 h-4 w-4" />转为监控任务</Button>
        </div>
        <p className="text-xs text-slate-500">
          说明：保存与监控均在浏览器本地持久化（localStorage）。「监控任务」在本演示中保存的是监控定义；
          生产部署时将按交易日收盘后自动重跑并在入选名单变化时推送。历史回测需要逐日历史成分与财务快照，本期未实现（见 README「未做事项」）。
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-600">已保存策略（{p.strategies.length}）</p>
            {p.strategies.length === 0 && <p className="text-xs text-slate-400">暂无</p>}
            {p.strategies.map((it, i) => <Item key={i} item={it} kind="s" idx={i} />)}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-600">监控任务（{p.monitors.length}）</p>
            {p.monitors.length === 0 && <p className="text-xs text-slate-400">暂无</p>}
            {p.monitors.map((it, i) => <Item key={i} item={it} kind="m" idx={i} />)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
