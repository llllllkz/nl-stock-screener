// 第①②步：意图输入 + AI 理解结果（澄清、不支持意图、合规提示）
import { EXAMPLE_INTENTS } from '../engine/parser';
import type { Ambiguity } from '../engine/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Sparkles, AlertTriangle, ShieldAlert, HelpCircle } from 'lucide-react';

interface Props {
  raw: string;
  setRaw: (v: string) => void;
  onParse: () => void;
  parsed: boolean;
  interpretations: string[];
  unsupported: string[];
  complianceFlags: string[];
  ambiguities: Ambiguity[];
  onSelectAmbiguity: (amb: Ambiguity, idx: number) => void;
}

export default function IntentStep(p: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
            用自然语言描述你的选股意图
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={p.raw}
            onChange={(e) => p.setRaw(e.target.value)}
            rows={3}
            placeholder="例如：经营改善、估值合理、走势相对稳定"
            className="resize-none"
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_INTENTS.map((e) => (
              <Badge
                key={e} variant="outline" className="cursor-pointer hover:bg-slate-100"
                onClick={() => p.setRaw(e)}
              >{e}</Badge>
            ))}
          </div>
          <Button onClick={p.onParse} className="w-full">
            <Sparkles className="mr-2 h-4 w-4" /> 解析意图
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
            AI 的理解与澄清（可改判）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!p.parsed && <p className="text-sm text-slate-400">点击「解析意图」后，这里会显示 AI 对每句话的理解、需要你确认的歧义、以及数据无法支持的意图。</p>}
          {p.parsed && (
            <>
              {p.interpretations.map((t, i) => (
                <p key={i} className="text-sm text-slate-600">· {t}</p>
              ))}
              {p.complianceFlags.map((t, i) => (
                <Alert key={`c${i}`} variant="destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>合规边界</AlertTitle>
                  <AlertDescription>{t}</AlertDescription>
                </Alert>
              ))}
              {p.unsupported.map((t, i) => (
                <Alert key={`u${i}`}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>暂不支持（如实告知，未静默忽略）</AlertTitle>
                  <AlertDescription>{t}</AlertDescription>
                </Alert>
              ))}
              {p.ambiguities.map((amb) => (
                <div key={amb.id} className="rounded-md border bg-amber-50/60 p-3">
                  <p className="mb-2 flex items-center gap-1 text-sm font-medium">
                    <HelpCircle className="h-4 w-4 text-amber-600" /> {amb.question}
                  </p>
                  <RadioGroup
                    value={String(amb.selected)}
                    onValueChange={(v) => p.onSelectAmbiguity(amb, Number(v))}
                    className="space-y-1"
                  >
                    {amb.options.map((o, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <RadioGroupItem value={String(i)} id={`${amb.id}-${i}`} className="mt-0.5" />
                        <Label htmlFor={`${amb.id}-${i}`} className="text-sm font-normal leading-5">{o.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
