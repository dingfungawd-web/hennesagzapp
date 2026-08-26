const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.5-flash";

export const SCREENSHOT_PROMPT = `你是一个专门从纱窗公司订单 App 截图中提取订单资料的助手。
截图包含：订单号、订单类型标签、客户地址、客户姓名电话、排期日期、备注及订单内容。

请识别以下栏位，只输出 JSON（唔好有任何其他文字）：
{"orderType":"install"|"followup", "orderNo":..., "customerName":..., "customerPhone":..., "rawAddress":..., "orderContent":..., "measureDate":..., "depositDate":..., "notes":...}

注意：
1. orderType：截图最顶订单号旁边有一个灰底标签，写住「安装」就输出 "install"，写住「跟进」就输出 "followup"。订单号带 -F 后缀通常系跟进单。睇唔到就用 "install"
2. 地址要完整，包含城市（广州市/佛山市）、区、小区、栋号、室号；标题同绿色大字都系地址
3. customerName 只要姓名（例如「陈先生」「林太太」），唔好包电话
4. depositDate：收订日期／订料日期／手尾订料日期，格式 YYYY-MM-DD，睇唔到就 null
5. measureDate：度呎日期，格式 YYYY-MM-DD
6. orderContent：产品／备注内的产品资料（例如 H2 x 4、H1）
7. 跟进单请将「跟进原因」及跟进位置内容放入 notes
8. 睇唔到嘅栏位就返回 null；日期统一 YYYY-MM-DD
9. 所有文字输出必须为【中文简体字】（简体中文），即使截图用繁体字或粤语，都要转换成简体中文再输出（地址、姓名、订单内容、备注全部一样）`;


export async function callGateway(body: Record<string, unknown>) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI 服务未设定");
  const resp = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (resp.status === 429) throw new Error("AI 请求太频密，请稍后再试");
  if (resp.status === 402) throw new Error("AI 额度不足，请于设定增值");
  if (!resp.ok) throw new Error(`AI 服务错误 (${resp.status})`);
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
