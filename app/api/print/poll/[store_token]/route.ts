// レシート印刷 poll（F4b-2・認証外＝プリンタが定期 POST・LINE/Stripe webhook 同型）。
// 認証は URL パスの store_token のみ（rotate_store_token 発行の 24hex・printer_config 隔離テーブル照合）。
// フロー: print_claim（service_role・queued→printing の状態ガード付き claim）
//   → found:false / unknown_token / printer_disabled / serial_mismatch は全て 200 空ボディ
//     （★存在オラクル封じ＋プリンタが延々エラー retry しない形＝ePOS の「ジョブなし」応答）
//   → found:true は service_role で checks/check_lines(pay_group)/payments(pay_group)/stores を収集し
//     buildReceiptXml → Server Direct Print エンベロープ（BOM 無し）で返却。
// ★group_due は check-calc.ts（check_group_due の TS 鏡像・0035 discount 対応と同式）で算出:
//   check_group_due の EXECUTE は postgres のみ（内部専用 ACL）＝service_role から呼べないため。
//   closed 伝票は金額不変＝同式順算は決定的（権威コメントは check-calc.ts 冒頭）。
// 印刷確定は result route（print_result）＝ここでは printed にしない（printing 止まり）。
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReceiptXml, type ReceiptLine, type ReceiptPayment } from "@/lib/nox/receipt";
import { buildPrintEnvelope, EMPTY_POLL_RESPONSE } from "@/lib/nox/print-envelope";
import { groupDue } from "@/lib/nox/check-calc";

export const dynamic = "force-dynamic";

const XML_HEADERS = { "content-type": "text/xml; charset=utf-8" };
const emptyOk = () => new Response(EMPTY_POLL_RESPONSE, { status: 200, headers: XML_HEADERS });

// プリンタ POST のボディからシリアル名を寛容に拾う（ePOS の実フィールドは P4.6 実機確認＝薄層）。
async function extractSerial(req: Request): Promise<string | null> {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>;
      for (const k of ["Name", "name", "ID", "id", "serial"]) {
        if (typeof j[k] === "string" && (j[k] as string).trim()) return (j[k] as string).trim();
      }
      return null;
    }
    // x-www-form-urlencoded / multipart とも formData で読める
    const fd = await req.formData();
    for (const k of ["Name", "name", "ID", "id", "serial"]) {
      const v = fd.get(k);
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ store_token: string }> }) {
  try {
    const { store_token } = await ctx.params;
    const serial = await extractSerial(req);
    const admin = createAdminClient();

    // 形式不正 token は RPC が raise（bad token）→ 無害応答へ落とす
    const { data: claim, error: eClaim } = await admin.rpc("print_claim", {
      p_store_token: store_token,
      p_serial: serial,
    });
    if (eClaim) return emptyOk();
    const c = claim as {
      ok: boolean; found?: boolean; job_id?: string; print_token?: string;
      check_id?: string; pay_group?: string; is_reprint?: boolean; reason?: string;
    };
    if (!c?.ok || !c.found || !c.check_id || !c.pay_group || !c.print_token) return emptyOk();

    // ── レシート素材の収集（service_role＝RLS バイパス・store_token で店は確定済み）──
    const [{ data: chk }, { data: lines }, { data: pays }] = await Promise.all([
      admin.from("checks")
        .select("id, store_id, closed_at, nom_type, service_rate, round_unit, round_mode")
        .eq("id", c.check_id).single(),
      admin.from("check_lines")
        .select("name_snapshot, qty, unit_price_snapshot, line_total, kind, sort_order, created_at")
        .eq("check_id", c.check_id).eq("pay_group", c.pay_group)
        .order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      admin.from("payments")
        .select("method, amount, tendered, paid_at")
        .eq("check_id", c.check_id).eq("pay_group", c.pay_group)
        .order("paid_at", { ascending: true }),
    ]);
    if (!chk || !lines || lines.length === 0) return emptyOk(); // 素材欠損＝この poll では刷らない（job は printing のまま→result 経路や運用で回収）

    const { data: store } = await admin.from("stores")
      .select("name, settings_json").eq("id", chk.store_id).single();
    const sj = (store?.settings_json ?? {}) as Record<string, unknown>;
    const sjs = (k: string) => (typeof sj[k] === "string" ? (sj[k] as string).trim() : "");

    // group_due = 割引後 net → check-calc.ts（DB 同式 TS 鏡像）
    const ls = lines as ReceiptLine[];
    const gross = ls.filter((l) => l.kind !== "discount").reduce((s, l) => s + l.line_total, 0);
    const discount = ls.filter((l) => l.kind === "discount").reduce((s, l) => s + l.line_total, 0);
    const net = Math.max(0, gross - discount);
    const due = groupDue(net, {
      service_rate: chk.service_rate as number,
      round_unit: chk.round_unit as number,
      round_mode: chk.round_mode as string,
    });

    const xml = buildReceiptXml({
      store: {
        name: (store?.name as string) ?? "",
        address: sjs("receipt_address"),
        tel: sjs("receipt_tel"),
        reg_no: sjs("invoice_reg_no"),
        footer: sjs("receipt_footer"),
      },
      check: { id: chk.id as string, closed_at: chk.closed_at as string, nom_type: chk.nom_type as string },
      payGroup: c.pay_group,
      lines: ls,
      payments: (pays ?? []) as ReceiptPayment[],
      serviceRate: chk.service_rate as number,
      groupDue: due,
      isReprint: c.is_reprint === true,
    });

    // BOM 無し（print-envelope.ts 冒頭の実機教訓）
    return new Response(buildPrintEnvelope(c.print_token, xml), { status: 200, headers: XML_HEADERS });
  } catch {
    return emptyOk(); // 認証外経路＝内部事情を漏らさない
  }
}
