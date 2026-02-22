import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font, Link } from "@react-pdf/renderer";
import path from "path";

// 日本語フォントを登録
Font.register({
  family: "NotoSansJP",
  src: path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"),
});

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

const VERDICT_COLOR: Record<string, string> = {
  ok: "#16a34a",
  caution: "#ca8a04",
  problem: "#dc2626",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    fontSize: 10,
    padding: 40,
    color: "#1a1a1a",
  },
  header: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 18,
    fontFamily: "NotoSansJP",
    marginBottom: 4,
  },
  meta: {
    fontSize: 9,
    color: "#6b7280",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    color: "#6b7280",
    marginBottom: 6,
    fontFamily: "NotoSansJP",
  },
  verdictRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  verdictBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "NotoSansJP",
    color: "#ffffff",
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    color: "#374151",
  },
  reasonBox: {
    backgroundColor: "#f9fafb",
    padding: 10,
    borderRadius: 4,
    fontSize: 10,
    lineHeight: 1.6,
  },
  sourceItem: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  sourceTitle: {
    fontSize: 10,
    fontFamily: "NotoSansJP",
    marginBottom: 2,
  },
  sourceUrl: {
    fontSize: 8,
    color: "#2563eb",
    marginBottom: 3,
  },
  sourceSummary: {
    fontSize: 9,
    color: "#6b7280",
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    marginBottom: 12,
  },
});

type ComplianceCheck = {
  id: string;
  created_at: string;
  company_name: string;
  verdict: "ok" | "caution" | "problem";
  risk_level: "high" | "medium" | "low";
  reason: string;
  sources: { title: string; url: string; summary: string }[];
};

function CompliancePdf({ check }: { check: ComplianceCheck }) {
  const date = new Date(check.created_at).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>反社チェック報告書</Text>
          <Text style={styles.meta}>実施日時：{date}　　※ AIによる自動判定。最終判断は担当者が行うこと。</Text>
        </View>

        {/* 取引先名・判定 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>調査対象</Text>
          <Text style={{ fontSize: 14, fontFamily: "NotoSansJP", marginBottom: 10 }}>
            {check.company_name}
          </Text>
          <View style={styles.verdictRow}>
            <Text style={[styles.verdictBadge, { backgroundColor: VERDICT_COLOR[check.verdict] }]}>
              {VERDICT_LABEL[check.verdict]}
            </Text>
            <Text style={styles.riskBadge}>
              リスク度：{RISK_LABEL[check.risk_level]}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* 判断の根拠 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>判断の根拠</Text>
          <Text style={styles.reasonBox}>{check.reason}</Text>
        </View>

        <View style={styles.divider} />

        {/* 参照した情報 */}
        {check.sources.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>参照した情報（{check.sources.length}件）</Text>
            {check.sources.map((source, i) => (
              <View key={i} style={styles.sourceItem}>
                <Text style={styles.sourceTitle}>{source.title}</Text>
                <Link style={styles.sourceUrl} src={source.url}>{source.url}</Link>
                <Text style={styles.sourceSummary}>{source.summary}</Text>
              </View>
            ))}
          </View>
        )}

        {/* フッター */}
        <Text style={styles.footer}>
          Compliance Screening App　チェックID: {check.id}
        </Text>
      </Page>
    </Document>
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id } = await params;

  const { data: check, error } = await supabase
    .from("compliance_checks")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !check) {
    return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
  }

  const buffer = await renderToBuffer(<CompliancePdf check={check as ComplianceCheck} />);

  const filename = `compliance_${(check as ComplianceCheck).company_name}_${new Date(check.created_at).toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
