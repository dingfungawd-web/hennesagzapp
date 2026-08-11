const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.5-flash";

export const SCREENSHOT_PROMPT = `你是一個專門從紗窗公司訂單 App 截圖中提取訂單資料的助手。
截圖包含：訂單號、客戶地址、客戶姓名電話、排期日期、備註及訂單內容。

請識別以下欄位，只輸出 JSON（唔好有任何其他文字）：
{"orderNo":..., "customerName":..., "customerPhone":..., "rawAddress":..., "orderContent":..., "measureDate":..., "notes":...}

注意：
1. 地址要完整，包含城市（廣州市/佛山市）、區、小區、棟號、室號
2. customerName 只要姓名（例如「陳先生」），唔好包電話
3. 睇唔到嘅欄位就返回 null
4. 日期統一 YYYY-MM-DD`;

export async function callGateway(body: Record<string, unknown>) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI 服務未設定");
  const resp = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (resp.status === 429) throw new Error("AI 請求太頻密，請稍後再試");
  if (resp.status === 402) throw new Error("AI 額度不足，請於設定增值");
  if (!resp.ok) throw new Error(`AI 服務錯誤 (${resp.status})`);
  const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

export function parseJsonBlock<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
