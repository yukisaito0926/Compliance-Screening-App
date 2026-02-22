import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TavilyClient } from "tavily";
import { createClient } from "@/lib/supabase/server";

export interface HotelLookupSource {
  title: string;
  url: string;
  summary: string;
}

export interface HotelLookupResponse {
  company_name: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
  sources: HotelLookupSource[];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await request.json() as { inn_name?: string };
    const { inn_name } = body;

    if (!inn_name || typeof inn_name !== "string" || inn_name.trim() === "") {
      return NextResponse.json({ error: "旅館・ホテル名を入力してください" }, { status: 400 });
    }

    const trimmedName = inn_name.trim();

    const tavilyApiKey = process.env.TAVILY_API_KEY;
    if (!tavilyApiKey) throw new Error("TAVILY_API_KEY が設定されていません");

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY が設定されていません");

    // Tavily で運営会社を検索
    const tavilyClient = new TavilyClient({ apiKey: tavilyApiKey });
    const allResults: HotelLookupSource[] = [];
    const seenUrls = new Set<string>();

    const queries = [
      `${trimmedName} 運営会社 経営会社`,
      `${trimmedName} 運営 株式会社 合同会社`,
      `${trimmedName} 施設概要 運営者`,
    ];

    for (const query of queries) {
      const result = await tavilyClient.search({ query, max_results: 3, search_depth: "basic" });
      for (const item of result.results) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allResults.push({ title: item.title, url: item.url, summary: item.content.slice(0, 300) });
        }
      }
    }

    // Claude で運営会社名を抽出
    const anthropicClient = new Anthropic({ apiKey: anthropicApiKey });

    const sourcesText = allResults
      .map((s, i) => `[${i + 1}] タイトル: ${s.title}\nURL: ${s.url}\n内容: ${s.summary}`)
      .join("\n\n");

    const prompt = `あなたは宿泊施設の運営会社を調査するアシスタントです。
以下の情報をもとに、「${trimmedName}」の運営会社（法人名）を特定してください。

【収集した情報】
${sourcesText || "情報が見つかりませんでした"}

【判定ルール】
- 運営会社とは、その施設を実際に経営・運営している法人（株式会社・合同会社・有限会社等）のこと
- 施設名と同じ名前の法人がある場合はそれを優先
- 親会社・グループ会社ではなく、直接運営している法人を特定すること
- 情報が不十分で特定できない場合は company_name を null にすること

【信頼度の基準】
- high: 複数の情報源で一致、または公式サイト・公的情報で明確に記載
- medium: 1つの情報源で確認、または間接的に示されている
- low: 推測の要素が強い、または情報が断片的

以下のJSON形式のみで回答してください（説明文なし）:
{
  "company_name": "運営会社の正式名称（法人格を含む）またはnull",
  "confidence": "high" | "medium" | "low",
  "reason": "判断の根拠を150文字以内で記述"
}`;

    const message = await anthropicClient.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Claude APIから予期しないレスポンス");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Claude APIのレスポンスを解析できませんでした");

    const parsed = JSON.parse(jsonMatch[0]) as {
      company_name: string | null;
      confidence: "high" | "medium" | "low";
      reason: string;
    };

    const response: HotelLookupResponse = {
      company_name: parsed.company_name,
      confidence: parsed.confidence,
      reason: parsed.reason,
      sources: allResults,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "予期しないエラーが発生しました";
    console.error("[hotel-lookup] エラー:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
