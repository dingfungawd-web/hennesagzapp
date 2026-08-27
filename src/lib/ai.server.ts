// ============= Full file contents =============
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GATEWAY_MODEL = "google/gemini-3.5-flash";
// Google Gemini direct API model (used when GEMINI_API_KEY is set, e.g. on Vercel)
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export const SCREENSHOT_PROMPT = `你是一个专门从纱窗公司订单 App 截图中提取订单资料的助手。
截图包含：订单号、订单类型标签、客户地址、客户姓名电话、排期日期、备注及订单内容。

请识别以下栏位，只输出 JSON（唔好有任何其他文字）：
{"orderType":"install"|"followup", "orderNo":..., "customerName":..., "customerPhone":..., "rawAddress":..., "orderContent":..., "depositDate":..., "notes":...}

注意：
1. orderType：截图最顶订单号旁边有一个灰底标签，写住「安装」就输出 "install"，写住「跟进」就输出 "followup"。订单号带 -F 后缀通常系跟进单。睇唔到就用 "install"
2. 地址要完整，包含城市（广州市/佛山市）、区、小区、栋号、室号；标题同绿色大字都系地址
3. customerName 只要姓名（例如「陈先生」「林太太」），唔好包电话
4. depositDate：收订日期／订料日期／手尾订料日期，格式 YYYY-MM-DD，睇唔到就 null
5. orderContent：产品／备注内的产品资料（例如 H2 x 4、H1）
6. 跟进单请将「跟进原因」及跟进位置内容放入 notes
7. 睇唔到嘅栏位就返回 null；日期统一 YYYY-MM-DD
8. 所有文字输出必须为【中文简体字】（简体中文），即使截图用繁体字或粤语，都要转换成简体中文再输出（地址、姓名、订单内容、备注全部一样）`;

type AiMessage = {
  role: "system" | "user";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

type AiConfig = { mode: "gemini"; key: string } | { mode: "gateway"; key: string };

/**
 * 优先用 GEMINI_API_KEY 直连 Google Gemini API（适合 Vercel 等外部部署），
 * 其次用 LOVABLE_API_KEY 经 Lovable AI Gateway（Lovable 预览用）。
 */
function resolveAiConfig(): AiConfig | null {
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (geminiKey) return { mode: "gemini", key: geminiKey };
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (lovableKey) return { mode: "gateway", key: lovableKey };
  return null;
}

/** 从 data URL（data:image/jpeg;base64,...）拆出 mime 与 base64 数据 */
function parseDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return { mime: "image/jpeg", base64: dataUrl };
  return { mime: match[1] ?? "image/jpeg", base64: match[2] ?? dataUrl };
}

async function callGeminiDirect(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (resp.status === 429) throw new Error("AI 请求太频密，请稍后再试");
  if (resp.status === 402 || resp.status === 403) {
    throw new Error("AI 额度不足或密钥无效，请检查 GEMINI_API_KEY");
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`AI 服务错误 (${resp.status}) ${txt.slice(0, 200)}`);
  }
  const json = (await resp.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

async function callGatewayDirect(apiKey: string, body: Record<string, unknown>): Promise<string> {
  const resp = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: GATEWAY_MODEL, ...body }),
  });
  if (resp.status === 429) throw new Error("AI 请求太频密，请稍后再试");
  if (resp.status === 402) throw new Error("AI 额度不足，请于设定增值");
  if (!resp.ok) throw new Error(`AI 服务错误 (${resp.status})`);
  const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

/**
 * 统一调用入口，返回模型输出的纯文本。
 * - 截图识别：传入 systemPrompt 与 multimodal user 内容（messages 格式）
 */
export async function callAi(messages: AiMessage[]): Promise<string> {
  const cfg = resolveAiConfig();
  if (!cfg) {
    throw new Error(
      "AI 服务未设定：请在部署环境设置 GEMINI_API_KEY（推荐，Vercel 用）或 LOVABLE_API_KEY",
    );
  }

  if (cfg.mode === "gemini") {
    const systemText = messages.find((m) => m.role === "system");
    const userMsg = messages.find((m) => m.role === "user");
    const geminiParts: Array<{ text?: string } | { inline_data: { mime_type: string; data: string } }> = [];
    if (userMsg && Array.isArray(userMsg.content)) {
      for (const part of userMsg.content) {
        if (part.type === "text" && part.text) geminiParts.push({ text: part.text });
        else if (part.type === "image_url" && part.image_url?.url) {
          const { mime, base64 } = parseDataUrl(part.image_url.url);
          geminiParts.push({ inline_data: { mime_type: mime, data: base64 } });
        }
      }
    } else if (userMsg && typeof userMsg.content === "string") {
      geminiParts.push({ text: userMsg.content });
    }
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: geminiParts }],
      generationConfig: { temperature: 0.1 },
    };
    if (systemText && typeof systemText.content === "string") {
      body["systemInstruction"] = { parts: [{ text: systemText.content }] };
    }
    return await callGeminiDirect(cfg.key, body);
  }

  // Lovable gateway 走 OpenAI 兼容格式
  return await callGatewayDirect(cfg.key, { messages });
}

/** 旧名兼容：截图导入仍以 callGateway 调用，转接至 callAi */
export async function callGateway(body: Record<string, unknown>): Promise<string> {
  const messages = (body["messages"] as AiMessage[] | undefined) ?? [];
  return await callAi(messages);
}

export function parseJsonBlock<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
