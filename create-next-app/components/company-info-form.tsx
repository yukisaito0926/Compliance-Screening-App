"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, ExternalLink, Loader2, User, Building2 } from "lucide-react";
import type { CompanyInfoResponse } from "@/app/api/company-info/route";

type CheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: CompanyInfoResponse; inputName: string }
  | { status: "error"; message: string };

export function CompanyInfoForm() {
  const [companyName, setCompanyName] = useState("");
  const [state, setState] = useState<CheckState>({ status: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setState({ status: "loading" });

    try {
      const res = await fetch("/api/company-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: companyName }),
      });

      const data = await res.json() as CompanyInfoResponse & { error?: string };

      if (!res.ok) {
        setState({ status: "error", message: data.error ?? "エラーが発生しました" });
        return;
      }

      setState({ status: "done", result: data, inputName: companyName.trim() });
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
          <CardTitle className="text-lg">会社名を入力</CardTitle>
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
                "調査する"
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-3">
            ※ AIによる自動調査です。公式情報と照合してご確認ください。
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
        const { result, inputName } = state;

        return (
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-xl">{inputName}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {/* 正式会社名 */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  正式会社名・最新性
                </div>
                <div className="bg-muted/50 rounded-md p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {result.is_name_current ? (
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-base">{result.official_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      result.is_name_current
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                    }`}>
                      {result.is_name_current ? "最新" : "変更あり"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{result.name_note}</p>
                </div>
              </div>

              {/* 代表者名 */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <User className="h-4 w-4" />
                  代表者名
                </div>
                <div className="bg-muted/50 rounded-md p-4 flex flex-col gap-2">
                  <span className="font-semibold text-base">{result.representative}</span>
                  <p className="text-sm text-muted-foreground">{result.representative_note}</p>
                </div>
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
                別の会社を調査する
              </Button>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
