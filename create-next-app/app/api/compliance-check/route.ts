import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TavilyClient } from "tavily";
import { createClient } from "@/lib/supabase/server";

export interface ComplianceSource {
  title: string;
  url: string;
  summary: string;
}

export interface ComplianceCheckResponse {
  verdict: "ok" | "caution" | "problem";
  risk_level: "high" | "medium" | "low";
  reason: string;
  sources: ComplianceSource[];
  // 代表者チェック（representative_name が渡された場合のみ）
  representative_verdict: "ok" | "caution" | "problem" | null;
  representative_risk_level: "high" | "medium" | "low" | null;
  representative_reason: string | null;
  representative_sources: ComplianceSource[];
}

async function searchByQueries(queries: string[], tavilyApiKey: string): Promise<ComplianceSource[]> {
  const client = new TavilyClient({ apiKey: tavilyApiKey });
  const allResults: ComplianceSource[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    const result = await client.search({ query, max_results: 3, search_depth: "basic" });
    for (const item of result.results) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        allResults.push({ title: item.title, url: item.url, summary: item.content.slice(0, 300) });
      }
    }
  }
  return allResults;
}

// 会社名で反社検索
async function searchCompanyInfo(companyName: string): Promise<ComplianceSource[]> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) throw new Error("TAVILY_API_KEY が設定されていません");
  return searchByQueries([
    `${companyName} 反社会的勢力 暴力団`,
    `${companyName} 不祥事 行政処分 詐欺 逮捕`,
    `${companyName} 企業情報 評判`,
  ], tavilyApiKey);
}

// 代表者名で反社検索
async function searchRepresentativeInfo(representativeName: string): Promise<ComplianceSource[]> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) throw new Error("TAVILY_API_KEY が設定されていません");
  return searchByQueries([
    `${representativeName} 反社会的勢力 暴力団 逮捕`,
    `${representativeName} 詐欺 不祥事 行政処分`,
  ], tavilyApiKey);
}

// 会社の反社チェック
async function analyzeCompany(
  companyName: string,
  sources: ComplianceSource[]
): Promise<Pick<ComplianceCheckResponse, "verdict" | "risk_level" | "reason">> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY が設定されていません");
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const sourcesText = sources
    .map((s, i) => `[${i + 1}] タイトル: ${s.title}\nURL: ${s.url}\n内容: ${s.summary}`)
    .join("\n\n");

  const prompt = `あなたは反社会的勢力との関係を調査するコンプライアンス担当者です。
以下の取引先企業に関するネット上の情報を分析し、反社チェックの判定を行ってください。

【調査対象企業名】
${companyName}

【収集した情報】
${sourcesText || "情報が見つかりませんでした"}

【重要な判定ルール】
- 記事の内容が「${companyName}」自体の問題を示しているか文脈をよく読んで判断すること
- 検索クエリに含めたキーワード（反社・暴力団・詐欺など）が記事に登場するだけでは問題ありと判定しないこと
- 「${companyName}」が反社・犯罪・不祥事の当事者として具体的に記述されている場合のみリスクと判定すること

【判定基準】
- problem: ${companyName}が反社会的勢力との関係、詐欺、重大な法令違反、行政処分の当事者であることが明確
- caution: ${companyName}に関して疑わしい情報や確認が必要なリスク要素が具体的に記述されている
- ok: ${companyName}自体の重大なリスク要素が見つからない

以下のJSON形式のみで回答してください（説明文なし）:
{
  "verdict": "ok" | "caution" | "problem",
  "risk_level": "high" | "medium" | "low",
  "reason": "判断の根拠を200文字以内で記述"
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Claude APIから予期しないレスポンス");
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude APIのレスポンスを解析できませんでした");
  return JSON.parse(jsonMatch[0]) as Pick<ComplianceCheckResponse, "verdict" | "risk_level" | "reason">;
}

// 代表者の反社チェック
async function analyzeRepresentative(
  representativeName: string,
  companyName: string,
  sources: ComplianceSource[]
): Promise<Pick<ComplianceCheckResponse, "verdict" | "risk_level" | "reason">> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY が設定されていません");
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const sourcesText = sources
    .map((s, i) => `[${i + 1}] タイトル: ${s.title}\nURL: ${s.url}\n内容: ${s.summary}`)
    .join("\n\n");

  const prompt = `あなたは反社会的勢力との関係を調査するコンプライアンス担当者です。
以下の人物に関するネット上の情報を分析し、反社チェックの判定を行ってください。

【調査対象】
氏名: ${representativeName}（${companyName} の代表者）

【収集した情報】
${sourcesText || "情報が見つかりませんでした"}

【重要な判定ルール】
- 「${representativeName}」本人の問題を示しているか文脈をよく読んで判断すること
- 同姓同名の別人の情報と混同しないこと
- 「${representativeName}」が反社・犯罪・不祥事の当事者として具体的に記述されている場合のみリスクと判定すること

【判定基準】
- problem: 反社会的勢力との関係、詐欺、重大な犯罪への関与が明確に記述されている
- caution: 疑わしい情報や確認が必要なリスク要素が具体的に記述されている
- ok: 重大なリスク要素が見つからない

以下のJSON形式のみで回答してください（説明文なし）:
{
  "verdict": "ok" | "caution" | "problem",
  "risk_level": "high" | "medium" | "low",
  "reason": "判断の根拠を200文字以内で記述"
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Claude APIから予期しないレスポンス");
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude APIのレスポンスを解析できませんでした");
  return JSON.parse(jsonMatch[0]) as Pick<ComplianceCheckResponse, "verdict" | "risk_level" | "reason">;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await request.json() as { company_name?: string; representative_name?: string };
    const { company_name, representative_name } = body;

    if (!company_name || typeof company_name !== "string" || company_name.trim() === "") {
      return NextResponse.json({ error: "取引先名を入力してください" }, { status: 400 });
    }

    const trimmedName = company_name.trim();
    const trimmedRep = representative_name?.trim() || null;

    // 会社検索と代表者検索を並列実行
    const [companySources, representativeSources] = await Promise.all([
      searchCompanyInfo(trimmedName),
      trimmedRep && trimmedRep !== "不明" ? searchRepresentativeInfo(trimmedRep) : Promise.resolve([]),
    ]);

    // 会社判定と代表者判定を並列実行
    const [companyAnalysis, representativeAnalysis] = await Promise.all([
      analyzeCompany(trimmedName, companySources),
      trimmedRep && trimmedRep !== "不明" && representativeSources.length >= 0
        ? analyzeRepresentative(trimmedRep, trimmedName, representativeSources)
        : Promise.resolve(null),
    ]);

    const response: ComplianceCheckResponse = {
      ...companyAnalysis,
      sources: companySources,
      representative_verdict: representativeAnalysis?.verdict ?? null,
      representative_risk_level: representativeAnalysis?.risk_level ?? null,
      representative_reason: representativeAnalysis?.reason ?? null,
      representative_sources: representativeSources,
    };

    // DBに保存
    const { error: insertError } = await supabase
      .from("compliance_checks")
      .insert({
        user_id: user.id,
        company_name: trimmedName,
        verdict: response.verdict,
        risk_level: response.risk_level,
        reason: response.reason,
        sources: response.sources,
        representative_name: trimmedRep,
        representative_verdict: response.representative_verdict,
        representative_risk_level: response.representative_risk_level,
        representative_reason: response.representative_reason,
        representative_sources: response.representative_sources,
      });

    if (insertError) {
      console.error("[compliance-check] DB保存エラー:", insertError);
    }

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "予期しないエラーが発生しました";
    console.error("[compliance-check] エラー:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
