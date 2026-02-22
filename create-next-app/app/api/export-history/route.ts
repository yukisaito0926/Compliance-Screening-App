import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VERDICT_LABEL: Record<string, string> = {
  ok: "問題なし",
  caution: "要注意",
  problem: "問題あり",
};

const RISK_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

// CSVセルの値をエスケープ（カンマ・改行・ダブルクォートを含む場合に対応）
function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { data: checks, error } = await supabase
    .from("compliance_checks")
    .select("created_at, company_name, verdict, risk_level, reason")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (checks ?? []).map((c) => {
    const date = new Date(c.created_at).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return [
      escapeCsvCell(date),
      escapeCsvCell(c.company_name),
      escapeCsvCell(VERDICT_LABEL[c.verdict] ?? c.verdict),
      escapeCsvCell(RISK_LABEL[c.risk_level] ?? c.risk_level),
      escapeCsvCell(c.reason),
    ].join(",");
  });

  const header = "実施日時,取引先名,判定,リスク度,判断の根拠";
  const csv = [header, ...rows].join("\n");

  // BOMを付けてExcelでの文字化けを防ぐ
  const bom = "\uFEFF";

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="compliance_history_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
