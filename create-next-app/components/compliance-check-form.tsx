"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, XCircle, ExternalLink, Loader2 } from "lucide-react";
import type { ComplianceCheckResponse } from "@/app/api/compliance-check/route";

type CheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: ComplianceCheckResponse; companyName: string }
  | { status: "error"; message: string };

const VERDICT_CONFIG = {
  ok: {
    label: "問題なし",
    icon: CheckCircle,
    cardClass: "border-green-500 bg-green-50 dark:bg-green-950",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    iconClass: "text-green-600",
  },
  caution: {
    label: "要注意",
    icon: AlertTriangle,
    cardClass: "border-yellow-500 bg-yellow-50 dark:bg-yellow-950",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    iconClass: "text-yellow-600",
  },
  problem: {
    label: "問題あり",
    icon: XCircle,
    cardClass: "border-red-500 bg-red-50 dark:bg-red-950",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    iconClass: "text-red-600",
  },
} as const;

const RISK_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function ComplianceCheckForm() {
  const [companyName, setCompanyName] = useState("");
  const [state, setState] = useState<CheckState>({ status: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setState({ status: "loading" });

    try {
      const res = await fetch("/api/compliance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: companyName }),
      });

      const data = await res.json() as ComplianceCheckResponse & { error?: string };

      if (!res.ok) {
        setState({ status: "error", message: data.error ?? "エラーが発生しました" });
        return;
      }

      setState({ status: "done", result: data, companyName: companyName.trim() });
    } catch {
      setState({ status: "error", message: "通信エラーが発生しました。再度お試しください。" });
    }
  };

  const handleReset = () => {
    setState({ status: "idle" });
    setCompanyName("");
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-2xl mx-auto">
      {/* 入力フォーム */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">取引先名を入力</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              type="text"
              placeholder="例：株式会社サンプル"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={state.status === "loading"}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={state.status === "loading" || !companyName.trim()}
            >
              {state.status === "loading" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  調査中...
                </>
              ) : (
                "チェック実行"
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-3">
            ※ AIによる自動判定です。最終判断は必ず担当者が行ってください。
          </p>
        </CardContent>
      </Card>

      {/* エラー表示 */}
      {state.status === "error" && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{state.message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleReset}>
              もう一度試す
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 結果表示 */}
      {state.status === "done" && (() => {
        const { result, companyName: name } = state;
        const config = VERDICT_CONFIG[result.verdict];
        const Icon = config.icon;

        return (
          <Card className={`border-2 ${config.cardClass}`}>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-6 w-6 ${config.iconClass}`} />
                  <CardTitle className="text-xl">{name}</CardTitle>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${config.badgeClass}`}>
                    {config.label}
                  </span>
                  <Badge variant="outline">
                    リスク度：{RISK_LABEL[result.risk_level]}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {/* 判断根拠 */}
              <div>
                <h3 className="font-semibold text-sm mb-2 text-muted-foreground">判断の根拠</h3>
                <p className="text-sm leading-relaxed">{result.reason}</p>
              </div>

              {/* ソース一覧 */}
              {result.sources.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-3 text-muted-foreground">
                    参照した情報（{result.sources.length}件）
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {result.sources.map((source, i) => (
                      <li key={i} className="bg-background/60 rounded-md p-3 text-sm">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline flex items-center gap-1 text-primary"
                        >
                          {source.title}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                          {source.summary}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={handleReset} className="self-start">
                別の取引先を調査する
              </Button>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
