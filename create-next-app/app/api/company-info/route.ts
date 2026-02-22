import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TavilyClient } from "tavily";
import { createClient } from "@/lib/supabase/server";

export interface CompanyInfoResponse {
  official_name: string;
  is_name_current: boolean;
  name_note: string;
  representative: string;
  representative_note: string;
  sources: { title: string; url: string; summary: string }[];
}

async function searchCompanyBasicInfo(companyName: string) {
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) throw new Error("TAVILY_API_KEY が設定されていません");

  const client = new TavilyClient({ apiKey: tavilyApiKey });

  const queries = [
    `${companyName} 代表取締役 代表者名`,
    `${companyName} 会社概要 正式名称`,
    `${companyName} 商号変更 社名変更`,
  ];

  const allResults: { title: string; url: string; summary: string }[] = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    const result = await client.search({
      query,
      max_results: 3,
      search_depth: "basic",
    });

    for (const item of result.results) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        allResults.push({
          title: item.title,
          url: item.url,
          summary: item.content.slice(0, 300),
        });
      }
    }
  }

  return allResults;
}

async function analyzeCompanyInfo(
  companyName: string,
  sources: { title: string; url: string; summary: string }[]
): Promise<Omit<CompanyInfoResponse, "sources">> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY が設定されていません");

  const client = new Anthropic({ apiKey: anthropicApiKey });

  const sourcesText = sources
    .map((s, i) => `[${i + 1}] タイトル: ${s.title}\nURL: ${s.url}\n内容: ${s.summary}`)
    .join("\n\n");

  const prompt = `あなたは企業情報を調査するアシスタントです。
以下の情報をもとに、入力された会社名の正式名称・最新性・代表者名を調査してください。

【入力された会社名】
${companyName}

【収集した情報】
${sourcesText || "情報が見つかりませんでした"}

以下のJSON形式のみで回答してください（説明文なし）:
{
  "official_name": "現在の正式な会社名（わからなければ入力値をそのまま返す）",
  "is_name_current": true または false（入力された会社名が現在も有効かどうか。社名変更されていれば false）,
  "name_note": "会社名に関する補足（変更があれば旧名称と新名称、変更がなければ「変更の情報は見つかりませんでした」など）",
  "representative": "現在の代表者名（わからなければ「不明」）",
  "representative_note": "代表者に関する補足（就任時期など。わからなければ「詳細不明」）"
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("予期しないレスポンス形式です");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("レスポンスからJSONを解析できませんでした");

  return JSON.parse(jsonMatch[0]) as Omit<CompanyInfoResponse, "sources">;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await request.json() as { company_name?: string };
    const { company_name } = body;

    if (!company_name || typeof company_name !== "string" || company_name.trim() === "") {
      return NextResponse.json({ error: "会社名を入力してください" }, { status: 400 });
    }

    const trimmedName = company_name.trim();
    const sources = await searchCompanyBasicInfo(trimmedName);
    const analysis = await analyzeCompanyInfo(trimmedName, sources);

    const response: CompanyInfoResponse = { ...analysis, sources };

    // 結果をSupabaseに保存
    const { error: insertError } = await supabase
      .from("company_info_checks")
      .insert({
        user_id: user.id,
        company_name: trimmedName,
        official_name: response.official_name,
        is_name_current: response.is_name_current,
        name_note: response.name_note,
        representative: response.representative,
        representative_note: response.representative_note,
        sources: response.sources,
      });

    if (insertError) {
      console.error("[company-info] DB保存エラー:", insertError);
    }

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "予期しないエラーが発生しました";
    console.error("[company-info] エラー:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
