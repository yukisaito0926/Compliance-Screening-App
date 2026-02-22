"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Building2, ExternalLink, Search, CheckCircle, AlertCircle,
} from "lucide-react";
import type { HotelLookupResponse } from "@/app/api/hotel-lookup/route";

const CONFIDENCE_CONFIG = {
  high:   { label: "信頼度：高", badgeClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  medium: { label: "信頼度：中", badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  low:    { label: "信頼度：低", badgeClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
} as const;

type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: HotelLookupResponse; innName: string }
  | { status: "error"; message: string };

export function HotelLookupForm() {
  const [innName, setInnName] = useState("");
  const [result, setResult] = useState<ResultState>({ status: "idle" });
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!innName.trim()) return;

    const name = innName.trim();
    setResult({ status: "loading" });

    try {
      const res = await fetch("/api/hotel-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inn_name: name }),
      });
      const data = await res.json() as HotelLookupResponse & { error?: string };

      if (data.error) {
        setResult({ status: "error", message: data.error });
      } else {
        setResult({ status: "done", data, innName: name });
      }
    } catch {
      setResult({ status: "error", message: "通信エラーが発生しました" });
    }
  };

  const handleReset = () => {
    setInnName("");
    setResult({ status: "idle" });
  };

  const handleComplianceCheck = (companyName: string) => {
    router.push(`/protected?company=${encodeURIComponent(companyName)}`);
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
      {/* 入力フォーム */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">旅館・ホテル名を入力</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              type="text"
              placeholder="例：旅館さくら、ホテル〇〇"
              value={innName}
              onChange={(e) => setInnName(e.target.value)}
              disabled={result.status === "loading"}
              className="flex-1"
            />
            <Button type="submit" disabled={result.status === "loading" || !innName.trim()}>
              {result.status === "loading" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  調査中...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  検索
                </>
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-3">
            ※ AIがネット上の情報をもとに運営会社を特定します。情報が少ない施設は特定できない場合があります。
          </p>
        </CardContent>
      </Card>

      {/* ローディング */}
      {result.status === "loading" && (
        <Card>
          <CardContent className="py-8 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>運営会社を調査中...</span>
          </CardContent>
        </Card>
      )}

      {/* エラー */}
      {result.status === "error" && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-destructive text-sm">{result.message}</CardContent>
        </Card>
      )}

      {/* 結果 */}
      {result.status === "done" && (() => {
        const { data, innName: checkedName } = result;
        const confidenceConfig = CONFIDENCE_CONFIG[data.confidence];
        return (
          <div className="flex flex-col gap-4">
            <Card className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">「{checkedName}」の運営会社</CardTitle>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceConfig.badgeClass}`}>
                    {confidenceConfig.label}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* 運営会社名 */}
                <div className="bg-muted/50 rounded-md p-4 flex items-center gap-3">
                  {data.company_name ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                      <span className="font-bold text-lg">{data.company_name}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <span className="text-muted-foreground">運営会社を特定できませんでした</span>
                    </>
                  )}
                </div>

                {/* 判断根拠 */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">判断の根拠</p>
                  <p className="text-sm leading-relaxed">{data.reason}</p>
                </div>

                {/* 参照情報 */}
                {data.sources.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                      参照情報（{data.sources.length}件）
                    </p>
                    <ul className="flex flex-col gap-2">
                      {data.sources.map((s, i) => (
                        <li key={i} className="bg-background/60 rounded-md p-3 text-sm">
                          <a href={s.url} target="_blank" rel="noopener noreferrer"
                            className="font-medium hover:underline flex items-center gap-1 text-primary">
                            {s.title}
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                          <p className="text-muted-foreground mt-1 text-xs">{s.summary}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* アクションボタン */}
                <div className="flex gap-3 flex-wrap pt-1">
                  {data.company_name && (
                    <Button onClick={() => handleComplianceCheck(data.company_name!)}>
                      この会社を総合チェック
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleReset}>
                    別の施設を調べる
                  </Button>
                </div>
              </CardContent>
            </Card>

            {!data.company_name && (
              <Button variant="outline" onClick={handleReset} className="self-start">
                別の施設を調べる
              </Button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
