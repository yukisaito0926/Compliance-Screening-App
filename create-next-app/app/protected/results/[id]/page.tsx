import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, XCircle, ExternalLink, ArrowLeft, User } from "lucide-react";
import { DownloadPdfButton } from "@/components/download-pdf-button";
import { DeleteCheckButton } from "@/components/delete-check-button";

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

type ComplianceCheck = {
  id: string;
  created_at: string;
  company_name: string;
  verdict: "ok" | "caution" | "problem";
  risk_level: "high" | "medium" | "low";
  reason: string;
  sources: { title: string; url: string; summary: string }[];
  representative_name: string | null;
  representative_verdict: "ok" | "caution" | "problem" | null;
  representative_risk_level: "high" | "medium" | "low" | null;
  representative_reason: string | null;
  representative_sources: { title: string; url: string; summary: string }[];
};

async function ResultContent({ id }: { id: string }) {
  await connection();
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/login");

  const { data: check, error } = await supabase
    .from("compliance_checks")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (error || !check) notFound();

  const result = check as ComplianceCheck;
  const config = VERDICT_CONFIG[result.verdict];
  const Icon = config.icon;
  const date = new Date(result.created_at).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <Link href="/protected/history">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            履歴に戻る
          </Button>
        </Link>
        <div className="flex gap-2">
          <DeleteCheckButton checkId={result.id} />
          <DownloadPdfButton checkId={result.id} />
        </div>
      </div>

      <Card className={`border-2 ${config.cardClass}`}>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Icon className={`h-6 w-6 ${config.iconClass}`} />
              <CardTitle className="text-xl">{result.company_name}</CardTitle>
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
          <p className="text-xs text-muted-foreground mt-1">実施日時：{date}</p>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          <div>
            <h3 className="font-semibold text-sm mb-2 text-muted-foreground">判断の根拠</h3>
            <p className="text-sm leading-relaxed">{result.reason}</p>
          </div>

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

          {/* 代表者チェック結果 */}
          {result.representative_verdict && (() => {
            const repVerdict = result.representative_verdict as "ok" | "caution" | "problem";
            const repConfig = VERDICT_CONFIG[repVerdict];
            const RepIcon = repConfig.icon;
            return (
              <div className={`border rounded-md p-4 flex flex-col gap-3 ${repConfig.cardClass}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">
                      代表者チェック{result.representative_name ? `：${result.representative_name}` : ""}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <RepIcon className={`h-4 w-4 ${repConfig.iconClass}`} />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${repConfig.badgeClass}`}>
                      {repConfig.label}
                    </span>
                    {result.representative_risk_level && (
                      <Badge variant="outline" className="text-xs">
                        リスク：{RISK_LABEL[result.representative_risk_level]}
                      </Badge>
                    )}
                  </div>
                </div>
                {result.representative_reason && (
                  <p className="text-sm leading-relaxed">{result.representative_reason}</p>
                )}
                {result.representative_sources?.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {result.representative_sources.map((source, i) => (
                      <li key={i} className="bg-background/60 rounded-md p-2 text-xs">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline flex items-center gap-1 text-primary"
                        >
                          {source.title}
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
    </div>
  );
}

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <ResultPageInner params={params} />
    </Suspense>
  );
}

async function ResultPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultContent id={id} />;
}
