"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle, AlertTriangle, XCircle, ExternalLink,
  Loader2, User, Building2
} from "lucide-react";
import type { ComplianceCheckResponse } from "@/app/api/compliance-check/route";
import type { CompanyInfoResponse } from "@/app/api/company-info/route";

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

const RISK_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

type ResultState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: T }
  | { status: "error"; message: string };

export function CombinedCheckForm() {
  const searchParams = useSearchParams();
  const [companyName, setCompanyName] = useState(searchParams.get("company") ?? "");

  useEffect(() => {
    const name = searchParams.get("company");
    if (name) setCompanyName(name);
  }, [searchParams]);
  const [isLoading, setIsLoading] = useState(false);
  const [checkedName, setCheckedName] = useState("");
  // 反社チェックに実際に使った会社名（社名変更があれば正式名称）
  const [complianceTargetName, setComplianceTargetName] = useState("");
  const [compliance, setCompliance] = useState<ResultState<ComplianceCheckResponse>>({ status: "idle" });
  const [companyInfo, setCompanyInfo] = useState<ResultState<CompanyInfoResponse>>({ status: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    const name = companyName.trim();
    setIsLoading(true);
    setCheckedName(name);
    setCompliance({ status: "loading" });
    setCompanyInfo({ status: "loading" });

    // ステップ1: 会社情報確認で正式名称を取得
    let officialName = name;
    let representativeName: string | undefined;
    try {
      const infoRes = await fetch("/api/company-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: name }),
      });
      const infoData = await infoRes.json() as CompanyInfoResponse & { error?: string };

      if (infoData.error) {
        setCompanyInfo({ status: "error", message: infoData.error });
      } else {
        setCompanyInfo({ status: "done", data: infoData });
        // 社名変更がある場合は正式名称を使用
        if (!infoData.is_name_current && infoData.official_name) {
          officialName = infoData.official_name;
        }
        // stateではなくinfoDataから直接取得（state更新は非同期のため）
        if (infoData.representative && infoData.representative !== "不明") {
          representativeName = infoData.representative;
        }
      }
    } catch {
      setCompanyInfo({ status: "error", message: "会社情報確認の通信エラー" });
    }

    // ステップ2: 正式名称＋代表者名で反社チェック
    setComplianceTargetName(officialName);
    try {
      const complianceRes = await fetch("/api/compliance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: officialName, representative_name: representativeName }),
      });
      const complianceData = await complianceRes.json() as ComplianceCheckResponse & { error?: string };

      if (complianceData.error) {
        setCompliance({ status: "error", message: complianceData.error });
      } else {
        setCompliance({ status: "done", data: complianceData });
      }
    } catch {
      setCompliance({ status: "error", message: "反社チェックの通信エラー" });
    }

    setIsLoading(false);
  };

  const handleReset = () => {
    setCompanyName("");
    setCheckedName("");
    setComplianceTargetName("");
    setCompliance({ status: "idle" });
    setCompanyInfo({ status: "idle" });
  };

  const hasResult = compliance.status !== "idle" || companyInfo.status !== "idle";

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
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !companyName.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  調査中...
                </>
              ) : (
                "総合チェック"
              )}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-3">
            ※ まず会社情報を確認し、社名変更があれば正式名称で反社チェックを実施します。AIによる自動判定のため、最終判断は担当者が行ってください。
          </p>
        </CardContent>
      </Card>

      {/* 結果エリア */}
      {hasResult && (
        <div className="flex flex-col gap-6">
          {/* 会社情報確認結果 */}
          <div className="flex flex-col gap-3">
            <h2 className="font-bold text-base">会社情報確認</h2>
            {companyInfo.status === "loading" && (
              <Card>
                <CardContent className="py-6 flex items-center gap-3 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  調査中...
                </CardContent>
              </Card>
            )}
            {companyInfo.status === "error" && (
              <Card className="border-destructive">
                <CardContent className="py-4 text-destructive text-sm">{companyInfo.message}</CardContent>
              </Card>
            )}
            {companyInfo.status === "done" && (() => {
              const { data } = companyInfo;
              return (
                <Card className="border-2">
                  <CardContent className="pt-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                        正式会社名・最新性
                      </div>
                      <div className="bg-muted/50 rounded-md p-3 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {data.is_name_current
                            ? <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                            : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                          <span className="font-semibold">{data.official_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            data.is_name_current
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          }`}>
                            {data.is_name_current ? "最新" : "変更あり"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{data.name_note}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <User className="h-4 w-4" />
                        代表者名
                      </div>
                      <div className="bg-muted/50 rounded-md p-3 flex flex-col gap-1">
                        <span className="font-semibold">{data.representative}</span>
                        <p className="text-xs text-muted-foreground">{data.representative_note}</p>
                      </div>
                    </div>
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
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          {/* 反社チェック結果 */}
          <div className="flex flex-col gap-3">
            <h2 className="font-bold text-base">反社チェック</h2>
            {compliance.status === "loading" && (
              <Card>
                <CardContent className="py-6 flex items-center gap-3 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {complianceTargetName && complianceTargetName !== checkedName
                    ? `「${complianceTargetName}」で調査中...`
                    : "調査中..."}
                </CardContent>
              </Card>
            )}
            {compliance.status === "error" && (
              <Card className="border-destructive">
                <CardContent className="py-4 text-destructive text-sm">{compliance.message}</CardContent>
              </Card>
            )}
            {compliance.status === "done" && (() => {
              const { data } = compliance;
              const config = VERDICT_CONFIG[data.verdict];
              const Icon = config.icon;
              const nameChanged = complianceTargetName !== checkedName;
              return (
                <Card className={`border-2 ${config.cardClass}`}>
                  <CardHeader className="pb-3">
                    {nameChanged && (
                      <p className="text-xs text-muted-foreground bg-background/60 rounded px-2 py-1 mb-1">
                        社名変更を検知 → <span className="font-semibold text-foreground">「{complianceTargetName}」</span> で反社チェックを実施しました
                      </p>
                    )}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${config.iconClass}`} />
                        <CardTitle className="text-base">{complianceTargetName}</CardTitle>
                      </div>
                      <div className="flex gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${config.badgeClass}`}>
                          {config.label}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          リスク：{RISK_LABEL[data.risk_level]}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {/* 会社の判定 */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">会社の判断の根拠</p>
                      <p className="text-sm leading-relaxed">{data.reason}</p>
                    </div>
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

                    {/* 代表者の判定 */}
                    {data.representative_verdict && (() => {
                      const repConfig = VERDICT_CONFIG[data.representative_verdict];
                      const RepIcon = repConfig.icon;
                      const repName = companyInfo.status === "done" ? companyInfo.data.representative : "";
                      return (
                        <div className={`border rounded-md p-4 flex flex-col gap-3 ${repConfig.cardClass}`}>
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-semibold text-sm">代表者チェック：{repName}</span>
                            </div>
                            <div className="flex gap-2">
                              <RepIcon className={`h-4 w-4 ${repConfig.iconClass}`} />
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${repConfig.badgeClass}`}>
                                {repConfig.label}
                              </span>
                              {data.representative_risk_level && (
                                <Badge variant="outline" className="text-xs">
                                  リスク：{RISK_LABEL[data.representative_risk_level]}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className="text-xs leading-relaxed">{data.representative_reason}</p>
                          {data.representative_sources.length > 0 && (
                            <ul className="flex flex-col gap-2">
                              {data.representative_sources.map((s, i) => (
                                <li key={i} className="bg-background/60 rounded-md p-2 text-xs">
                                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                                    className="font-medium hover:underline flex items-center gap-1 text-primary">
                                    {s.title}
                                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          <Button variant="outline" size="sm" onClick={handleReset} className="self-start">
            別の取引先を調査する
          </Button>
        </div>
      )}
    </div>
  );
}
