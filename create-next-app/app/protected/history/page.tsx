import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, XCircle, ChevronRight } from "lucide-react";
import { ExportCsvButton } from "@/components/export-csv-button";
import { DeleteCheckButton } from "@/components/delete-check-button";

const VERDICT_CONFIG = {
  ok: {
    label: "問題なし",
    icon: CheckCircle,
    className: "text-green-600",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  caution: {
    label: "要注意",
    icon: AlertTriangle,
    className: "text-yellow-600",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  problem: {
    label: "問題あり",
    icon: XCircle,
    className: "text-red-600",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
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
  representative_verdict: "ok" | "caution" | "problem" | null;
};

async function HistoryContent() {
  await connection();
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/login");

  const { data: checks, error } = await supabase
    .from("compliance_checks")
    .select("id, created_at, company_name, verdict, risk_level, reason, representative_verdict")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-destructive text-sm">
        履歴の取得に失敗しました: {error.message}
      </p>
    );
  }

  if (!checks || checks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        まだチェック結果がありません。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(checks as ComplianceCheck[]).map((check) => {
        const config = VERDICT_CONFIG[check.verdict];
        const Icon = config.icon;
        const date = new Date(check.created_at).toLocaleString("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });

        return (
          <Card key={check.id} className="transition-colors">
            <CardContent className="py-4 flex items-center gap-2">
              <Link href={`/protected/results/${check.id}`} className="flex items-center gap-4 flex-1 min-w-0 hover:opacity-80">
                <Icon className={`h-5 w-5 flex-shrink-0 ${config.className}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{check.company_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  {check.representative_verdict && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VERDICT_CONFIG[check.representative_verdict].badgeClass}`}>
                      代表者：{VERDICT_CONFIG[check.representative_verdict].label}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.badgeClass}`}>
                    {config.label}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    リスク：{RISK_LABEL[check.risk_level]}
                  </Badge>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </Link>
              <DeleteCheckButton checkId={check.id} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense>
      <div className="flex-1 w-full flex flex-col gap-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">チェック履歴</h1>
            <p className="text-muted-foreground text-sm mt-1">
              過去に実施した反社チェックの結果一覧です。
            </p>
          </div>
          <ExportCsvButton />
        </div>
        <HistoryContent />
      </div>
    </Suspense>
  );
}
