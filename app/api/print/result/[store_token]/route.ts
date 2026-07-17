// レシート印刷 result（F4b-2・認証外＝プリンタが印刷結果を POST・poll と対）。
// print_result RPC（service_role・printing のときだけ printed/failed へ冪等遷移）へ流すだけの薄層。
// 応答は常に 200（★偽 token・不明 job も 200 の無害 ack＝存在オラクル封じ＋プリンタの無限 retry 防止。
// 冪等リプレイは RPC 側が idempotent:true で吸収）。実フィールド名は P4.6 実機確認＝パースは寛容に。
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ack = () => new Response("", { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } });

type ParsedResult = { printToken: string | null; success: boolean; errorCode: string | null };

async function parseBody(req: Request): Promise<ParsedResult> {
  const pick = (get: (k: string) => string | null): ParsedResult => {
    const printToken =
      get("printjobid") ?? get("PrintJobId") ?? get("print_token") ?? get("printJobId");
    const rawSuccess = (get("Success") ?? get("success") ?? "").toLowerCase();
    const success = rawSuccess === "true" || rawSuccess === "1" || rawSuccess === "ok";
    const errorCode = get("Code") ?? get("code") ?? get("error_code");
    return { printToken: printToken?.trim() || null, success, errorCode: errorCode?.trim() || null };
  };
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>;
      return pick((k) => (typeof j[k] === "string" || typeof j[k] === "boolean" || typeof j[k] === "number" ? String(j[k]) : null));
    }
    const fd = await req.formData();
    return pick((k) => {
      const v = fd.get(k);
      return typeof v === "string" ? v : null;
    });
  } catch {
    return { printToken: null, success: false, errorCode: null };
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ store_token: string }> }) {
  try {
    const { store_token } = await ctx.params;
    const { printToken, success, errorCode } = await parseBody(req);
    if (!printToken) return ack(); // token 不明＝無害 ack（RPC を叩く材料がない）

    const admin = createAdminClient();
    await admin.rpc("print_result", {
      p_store_token: store_token,
      p_print_token: printToken,
      p_success: success,
      p_error_code: errorCode,
    });
    // 返り値（unknown_token/unknown_job/bad_state/idempotent）は問わず 200 ack（無害・冪等）
    return ack();
  } catch {
    return ack();
  }
}
