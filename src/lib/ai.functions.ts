import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callGateway, parseJsonBlock, SCREENSHOT_PROMPT } from "./ai.server";

export type ExtractedOrder = {
  orderType: "install" | "followup";
  orderNo: string;
  customerName: string;
  customerPhone: string;
  rawAddress: string;
  orderContent: string;
  measureDate: string;
  depositDate: string;
  notes: string;
};


export const analyzeScreenshot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ imageDataUrl: z.string().min(20) }).parse(data))
  .handler(async ({ data }) => {
    try {
      const content = await callGateway({
        messages: [
          { role: "system", content: SCREENSHOT_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: data.imageDataUrl } },
              { type: "text", text: "请从这张截图提取订单资料，只输出 JSON，所有文字用简体中文。" },
            ],
          },
        ],
      });
      const parsed = parseJsonBlock<Record<string, string | null>>(content);
      const order: ExtractedOrder = {
        orderType: parsed["orderType"] === "followup" ? "followup" : "install",
        orderNo: parsed["orderNo"] ?? "",
        customerName: parsed["customerName"] ?? "",
        customerPhone: parsed["customerPhone"] ?? "",
        rawAddress: parsed["rawAddress"] ?? "",
        orderContent: parsed["orderContent"] ?? "",
        measureDate: parsed["measureDate"] ?? "",
        depositDate: parsed["depositDate"] ?? "",
        notes: parsed["notes"] ?? "",
      };
      return { success: true, error: undefined as string | undefined, order };

    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        order: undefined as ExtractedOrder | undefined,
      };
    }
  });

export const suggestAddress = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ rawAddress: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    try {
      const content = await callGateway({
        messages: [
          { role: "system", content: "你是广佛地区地址补全助手，只输出 JSON，所有文字必须用简体中文。" },
          {
            role: "user",
            content: `用戶輸入咗一個可能唔完整嘅地址：「${data.rawAddress}」
請補全成標準完整地址（省市區 + 街道/鎮 + 小區/大廈 + 棟室），最多列 3 個可能。所有輸出文字必須為簡體中文。
只輸出 JSON：{"suggestions":[{"address":"...","confidence":"high|medium|low","reason":"..."}]}`,
          },
        ],
      });
      const parsed = parseJsonBlock<{
        suggestions?: { address: string; confidence: string; reason: string }[];
      }>(content);
      return {
        success: true,
        error: undefined as string | undefined,
        suggestions: parsed.suggestions ?? [],
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        suggestions: [] as { address: string; confidence: string; reason: string }[],
      };
    }
  });
