// 第⑤步：敏感性分析 —— 每条条件的阈值放松/收紧对入选数量的影响
import type { SensitivityRow } from '../engine/screener';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function SensitivityStep({ rows }: { rows: SensitivityRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">5</span>
          敏感性分析：条件变化会带来什么影响
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">启用至少一条条件后，这里会显示每条条件阈值放松 25% / 收紧 25% 时入选数量的变化。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>条件（当前）</TableHead>
                <TableHead className="text-center">当前入选</TableHead>
                <TableHead>放松约 25%</TableHead>
                <TableHead>收紧约 25%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.condition.id}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-center">{r.current}</TableCell>
                  <TableCell>
                    <span className="text-slate-600">{r.loosen.desc}</span>
                    <span className={`ml-2 text-xs ${r.loosen.delta > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      → {r.loosen.count}（{r.loosen.delta >= 0 ? '+' : ''}{r.loosen.delta}）
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-slate-600">{r.tighten.desc}</span>
                    <span className={`ml-2 text-xs ${r.tighten.delta < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      → {r.tighten.count}（{r.tighten.delta >= 0 ? '+' : ''}{r.tighten.delta}）
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="mt-2 text-xs text-slate-500">
          读法：某条条件「放松」后入选数大幅增加，说明它是当前策略的强约束；若放松/收紧都几乎不变，说明该条件在样本池里区分度低。
        </p>
      </CardContent>
    </Card>
  );
}
