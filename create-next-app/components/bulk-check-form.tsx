"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle, AlertTriangle, XCircle, Loader2,
  Upload, Download, FileText,
} from "lucide-react";
import type { ComplianceCheckResponse } from "@/app/api/compliance-check/route";

const VERDICT_CONFIG = {
  ok:      { label: "問題なし", icon: CheckCircle,  badgeClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",  iconClass: "text-green-600" },
  caution: { label: "要注意",   icon: AlertTriangle, badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", iconClass: "text-yellow-600" },
  problem: { label: "問題あり", icon: XCircle,       badgeClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",            iconClass: "text-red-600" },
} as const;

const RISK_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };
const MAX_COMPANIES = 10;

type ItemStatus =
  | { state: "waiting" }
  | { state: "processing" }
  | { state: "done"; result: ComplianceCheckResponse }
  | { state: "error"; message: string };

type BulkItem = { companyName: string; officialName?: string; status: ItemStatus };

// CSVをパースして会社名リストを返す
function parseCsv(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(",")[0].trim().replace(/^["']|["']$/g, ""))
    .filter((name) => name.length > 0 && !/^(会社名|company|name)$/i.test(name));
}

// サンプルCSVをダウンロード
function downloadSampleCsv() {
  const sample = "会社名\n株式会社サンプルA\n株式会社サンプルB\n株式会社サンプルC\n";
  const bom = "\uFEFF";
  const blob = new Blob([bom + sample], { type: "text/csv; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bulk_check_sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// 結果をCSVでダウンロード
function downloadResultCsv(items: BulkItem[]) {
  const VERDICT_LABEL: Record<string, string> = { ok: "問題なし", caution: "要注意", problem: "問題あり" };
  const rows = items.map((item) => {
    if (item.status.state !== "done") {
      return `"${item.companyName}","","","処理失敗","","","","",""`;
    }
    const r = item.status.result;
    const officialName = item.officialName ?? item.companyName;
    const nameChanged = officialName !== item.companyName ? "あり" : "なし";
    const reason = r.reason.replace(/"/g, '""');
    const repReason = (r.representative_reason ?? "").replace(/"/g, '""');
    const repVerdict = r.representative_verdict ? (VERDICT_LABEL[r.representative_verdict] ?? r.representative_verdict) : "";
    const repRisk = r.representative_risk_level ? (RISK_LABEL[r.representative_risk_level] ?? r.representative_risk_level) : "";
    return `"${item.companyName}","${officialName}","${nameChanged}","${VERDICT_LABEL[r.verdict] ?? r.verdict}","${RISK_LABEL[r.risk_level] ?? r.risk_level}","${reason}","${repVerdict}","${repRisk}","${repReason}"`;
  });
  const csv = ["取引先名,正式名称,名称変更,判定,リスク度,判断の根拠,代表者判定,代表者リスク,代表者判断根拠", ...rows].join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bulk_check_result_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkCheckForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BulkItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setIsDone(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const names = parseCsv(text);

      if (names.length === 0) {
        setError("会社名が見つかりませんでした。CSVの形式を確認してください。");
        setItems([]);
        return;
      }
      if (names.length > MAX_COMPANIES) {
        setError(`一度に処理できるのは${MAX_COMPANIES}件までです。（現在：${names.length}件）`);
        setItems([]);
        return;
      }

      setItems(names.map((name) => ({ companyName: name, status: { state: "waiting" } })));
    };
    reader.readAsText(file, "UTF-8");
  };

  const updateItem = (index: number, status: ItemStatus, officialName?: string) => {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      return { ...item, status, ...(officialName !== undefined ? { officialName } : {}) };
    }));
  };

  const handleStart = async () => {
    if (items.length === 0 || isRunning) return;
    setIsRunning(true);
    setIsDone(false);

    for (let i = 0; i < items.length; i++) {
      updateItem(i, { state: "processing" });

      try {
        // まず会社情報確認で代表者名を取得
        let representativeName: string | undefined;
        let officialName = items[i].companyName;
        try {
          const infoRes = await fetch("/api/company-info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company_name: items[i].companyName }),
          });
          const infoData = await infoRes.json() as { representative?: string; official_name?: string; is_name_current?: boolean; error?: string };
          if (!infoData.error) {
            if (infoData.representative && infoData.representative !== "不明") {
              representativeName = infoData.representative;
            }
            if (!infoData.is_name_current && infoData.official_name) {
              officialName = infoData.official_name;
            }
          }
        } catch {
          // 会社情報取得失敗は無視して反社チェックを続行
        }

        // 反社チェック（代表者名も渡す）
        const res = await fetch("/api/compliance-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_name: officialName, representative_name: representativeName }),
        });
        const data = await res.json() as ComplianceCheckResponse & { error?: string };

        if (data.error) {
          updateItem(i, { state: "error", message: data.error }, officialName);
        } else {
          updateItem(i, { state: "done", result: data }, officialName);
        }
      } catch {
        updateItem(i, { state: "error", message: "通信エラー" });
      }

      // レート制限対策：1件ごとに2秒待機
      if (i < items.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setIsRunning(false);
    setIsDone(true);
  };

  const handleReset = () => {
    setItems([]);
    setIsDone(false);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const completedItems = items.filter((i) => i.status.state === "done" || i.status.state === "error");
  const progress = items.length > 0 ? Math.round((completedItems.length / items.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
      {/* アップロードカード */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">CSVファイルをアップロード</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRunning}
            >
              <Upload className="mr-2 h-4 w-4" />
              CSVを選択
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadSampleCsv}>
              <FileText className="mr-2 h-4 w-4" />
              サンプルCSVをダウンロード
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-xs text-muted-foreground">
            1列目に会社名を記載したCSVをアップロードしてください。最大{MAX_COMPANIES}件まで。
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {items.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{items.length}件 読み込み済み</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleReset} disabled={isRunning}>
                  リセット
                </Button>
                <Button size="sm" onClick={handleStart} disabled={isRunning || isDone}>
                  {isRunning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      処理中...
                    </>
                  ) : isDone ? "完了" : "チェック開始"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 進捗バー */}
      {(isRunning || isDone) && items.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span>{completedItems.length} / {items.length} 件完了</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 結果一覧 */}
      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((item, i) => {
            const { state } = item.status;
            return (
              <Card key={i} className={`transition-all ${state === "processing" ? "border-primary" : ""}`}>
                <CardContent className="py-3 flex gap-3">
                  <div className="flex-shrink-0 w-6 text-center pt-0.5">
                    {state === "waiting" && <span className="text-muted-foreground text-xs">{i + 1}</span>}
                    {state === "processing" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {state === "done" && (() => {
                      const r = (item.status as { state: "done"; result: ComplianceCheckResponse }).result;
                      const Icon = VERDICT_CONFIG[r.verdict].icon;
                      return <Icon className={`h-4 w-4 ${VERDICT_CONFIG[r.verdict].iconClass}`} />;
                    })()}
                    {state === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{item.companyName}</span>
                      {state === "done" && item.officialName && item.officialName !== item.companyName && (
                        <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200 px-2 py-0.5 rounded-full">
                          → {item.officialName}
                        </span>
                      )}
                    </div>

                    {state === "waiting" && <span className="text-xs text-muted-foreground">待機中</span>}
                    {state === "processing" && <span className="text-xs text-primary">調査中...</span>}
                    {state === "done" && (() => {
                      const r = (item.status as { state: "done"; result: ComplianceCheckResponse }).result;
                      return (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-2 flex-wrap items-center">
                            <span className="text-xs text-muted-foreground">会社：</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VERDICT_CONFIG[r.verdict].badgeClass}`}>
                              {VERDICT_CONFIG[r.verdict].label}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              リスク：{RISK_LABEL[r.risk_level]}
                            </Badge>
                          </div>
                          {r.representative_verdict && (() => {
                            const repVerdict = r.representative_verdict as "ok" | "caution" | "problem";
                            const repConfig = VERDICT_CONFIG[repVerdict];
                            return (
                              <div className="flex gap-2 flex-wrap items-center">
                                <span className="text-xs text-muted-foreground">代表者：</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${repConfig.badgeClass}`}>
                                  {repConfig.label}
                                </span>
                                {r.representative_risk_level && (
                                  <Badge variant="outline" className="text-xs">
                                    リスク：{RISK_LABEL[r.representative_risk_level]}
                                  </Badge>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}
                    {state === "error" && (
                      <span className="text-xs text-destructive">
                        {(item.status as { state: "error"; message: string }).message}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 完了後：結果CSVダウンロード */}
      {isDone && (
        <Button variant="outline" onClick={() => downloadResultCsv(items)} className="self-start">
          <Download className="mr-2 h-4 w-4" />
          結果をCSVダウンロード
        </Button>
      )}
    </div>
  );
}
