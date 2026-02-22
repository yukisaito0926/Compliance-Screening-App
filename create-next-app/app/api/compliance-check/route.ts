import { NextRequest, NextResponse } from "next/server";
import { TavilyClient } from "tavily";

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
}

// 問題ありと判断するキーワード
const PROBLEM_KEYWORDS = [
  "反社会的勢力", "暴力団", "詐欺", "逮捕", "起訴", "有罪", "刑事",
  "振り込め詐欺", "特殊詐欺", "マネーロンダリング", "資金洗浄",
];

// 要注意と判断するキーワード
const CAUTION_KEYWORDS = [
  "不祥事", "行政処分", "業務停止", "訴訟", "トラブル", "苦情",
  "クレーム", "問題", "違反", "処分", "警告", "摘発", "捜査",
  "倒産", "破産", "民事再生",
];

// Tavily で企業名を検索し、関連情報を収集する
async function searchCompanyInfo(companyName: string): Promise<ComplianceSource[]> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    throw new Error("TAVILY_API_KEY が設定されていません");
  }

  const client = new TavilyClient({ apiKey: tavilyApiKey });

  const queries = [
    `${companyName} 反社会的勢力 暴力団`,
    `${companyName} 不祥事 行政処分 詐欺 逮捕`,
    `${companyName} 企業情報 評判`,
  ];

  const allResults: ComplianceSource[] = [];
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

// キーワードマッチングで判定する
function analyzeByKeywords(
  sources: ComplianceSource[]
): Omit<ComplianceCheckResponse, "sources"> {
  // 全ソースのテキストを結合してスキャン
  const allText = sources
    .map((s) => `${s.title} ${s.summary}`)
    .join(" ");

  const foundProblem = PROBLEM_KEYWORDS.filter((kw) => allText.includes(kw));
  const foundCaution = CAUTION_KEYWORDS.filter((kw) => allText.includes(kw));

  if (foundProblem.length > 0) {
    return {
      verdict: "problem",
      risk_level: "high",
      reason: `以下のキーワードが検索結果に含まれていました：${foundProblem.join("、")}。反社会的勢力との関係や重大な法令違反の可能性があります。担当者による詳細確認を推奨します。`,
    };
  }

  if (foundCaution.length > 0) {
    return {
      verdict: "caution",
      risk_level: "medium",
      reason: `以下のキーワードが検索結果に含まれていました：${foundCaution.join("、")}。リスク要素の可能性があるため、担当者による内容確認を推奨します。`,
    };
  }

  if (sources.length === 0) {
    return {
      verdict: "ok",
      risk_level: "low",
      reason: "検索結果が見つかりませんでした。ネット上に問題を示す情報はありませんでしたが、情報が少ないため担当者による確認を推奨します。",
    };
  }

  return {
    verdict: "ok",
    risk_level: "low",
    reason: "検索結果にリスクキーワードは検出されませんでした。重大な問題を示す情報は見つかりませんでした。",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { company_name?: string };
    const { company_name } = body;

    if (!company_name || typeof company_name !== "string" || company_name.trim() === "") {
      return NextResponse.json(
        { error: "取引先名を入力してください" },
        { status: 400 }
      );
    }

    const trimmedName = company_name.trim();

    // Web検索で情報収集
    const sources = await searchCompanyInfo(trimmedName);

    // キーワードマッチングで判定
    const analysis = analyzeByKeywords(sources);

    const response: ComplianceCheckResponse = {
      ...analysis,
      sources,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "予期しないエラーが発生しました";
    console.error("[compliance-check] エラー:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
