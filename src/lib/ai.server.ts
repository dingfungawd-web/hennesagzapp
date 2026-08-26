const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.5-flash";

export const SCREENSHOT_PROMPT = `你是一個專門從紗窗公司訂單 App 截圖中提取訂單資料的助手。
截圖包含：訂單號、訂單類型標籤、客戶地址、客戶姓名電話、排期日期、備註及訂單內容。

請識別以下欄位，只輸出 JSON（唔好有任何其他文字）：
{"orderType":"install"|"followup", "orderNo":..., "customerName":..., "customerPhone":..., "rawAddress":..., "orderContent":..., "measureDate":..., "depositDate":..., "notes":...}

注意：
1. orderType：截圖最頂訂單號旁邊有一個灰底標籤，寫住「安裝」就輸出 "install"，寫住「跟進」就輸出 "followup"。訂單號帶 -F 後綴通常係跟進單。睇唔到就用 "install"
2. 地址要完整，包含城市（廣州市/佛山市）、區、小區、棟號、室號；標題同綠色大字都係地址
3. customerName 只要姓名（例如「陳先生」「林太太」），唔好包電話
4. depositDate：收訂日期／訂料日期／手尾訂料日期，格式 YYYY-MM-DD，睇唔到就 null
5. measureDate：度呎日期，格式 YYYY-MM-DD
6. orderContent：產品／備註內的產品資料（例如 H2 x 4、H1）
7. 跟進單請將「跟進原因」及跟進位置內容放入 notes
8. 睇唔到嘅欄位就返回 null；日期統一 YYYY-MM-DD
9. 所有文字輸出必須為【中文簡體字】（简体中文），即使截圖用繁體字或粵語，都要轉換成簡體中文再輸出（地址、姓名、訂單內容、備註全部一樣）`;


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
