// F2d 支払調書「作成用データ」CSV（★owner 限定・manager も forbidden＝mynumber 平文経路のため最狭）。
// 対象=mode='委託'（報酬）の cast × 指定暦年の finalized/paid run を合算。
// 支払金額=Σgross（源泉控除前）・源泉徴収税額=Σwithholding（凍結値）・区分/登録番号=cast_tax_profiles。
// 本名/生年月日は cast_sensitive（service・RLS バイパスは本 route の owner authz が防御＝payroll preview 前例）、
// マイナンバーは get_cast_mynumber（service 限定・呼ぶ度 audit＝全件監査・未取得は空欄）経由のみ。
// ★法定様式ではない（様式は税理士確認・留保#7）＝ヘッダ行に明記。BOM 付き UTF-8。
import { mig0201fOn } from "@/lib/nox/rules-0175/flag";
import { decryptMynumberEnv } from "@/lib/nox/mynumber/crypto";
// ★0201f: フラグ true の間は DB が暗号文を返す＝復号して出す（フラグ false は今のまま）。復号の失敗は例外のまま＝route の 500
const mynumberCsvOf = (v: string | null, castId: string): string => (v == null ? "" : mig0201fOn() ? decryptMynumberEnv(v, castId) : v);
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decideTaxReportAccess } from "@/lib/nox/payroll/authz";
import { TAX_REPORT_NOTE_BASIS, isTaxReportTarget, taxSumOf, type SlipPay } from "@/lib/nox/payroll/tax-report"; // ★裁定482: 日次精算の源泉・年 50 万円超・年分の 1 行

type PayBreakdown = { pay?: SlipPay };

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { storeId?: unknown; year?: unknown; onlyTargets?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const storeId = body.storeId;
  const year = body.year;
  const onlyTargets = body.onlyTargets === true; // ★裁定482: 提出対象（年 50 万円超）だけを出す
  if (typeof storeId !== "string" || !storeId) return NextResponse.json({ error: "storeId required" }, { status: 400 });
  if (typeof year !== "string" || !/^\d{4}$/.test(year)) return NextResponse.json({ error: "year must be YYYY" }, { status: 400 });

  const [{ data: role }, { data: orgId }] = await Promise.all([
    supabase.rpc("auth_role"),
    supabase.rpc("auth_org_id"),
  ]);
  // ★owner 限定（manager も forbidden）
  if (decideTaxReportAccess(role as string | null, storeId) !== "ok") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!orgId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();
  // store が org 内か照合（owner の他 org 遮断）
  const { data: store, error: eStore } = await admin.from("stores").select("org_id").eq("id", storeId).single();
  if (eStore || !store || store.org_id !== orgId) return NextResponse.json({ error: "forbidden store" }, { status: 403 });

  // p_actor = 操作者の users.id（get_cast_mynumber の監査 actor）
  const { data: actorRow } = await admin.from("users").select("id").eq("auth_user_id", user.id).single();
  const actorId = actorRow?.id as string | undefined;
  if (!actorId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    // 対象 cast = mode='委託'（報酬）の税プロファイル（自店）
    const { data: taxRows, error: eTax } = await admin
      .from("cast_tax_profiles").select("cast_id, mode, invoice, reg_no").eq("store_id", storeId).eq("mode", "委託");
    if (eTax) throw new Error(eTax.message);
    const targets = (taxRows ?? []) as { cast_id: string; mode: string; invoice: string | null; reg_no: string | null }[];
    if (targets.length === 0) {
      return csvResponse(year, []); // 対象0でもヘッダのみ返す
    }
    const targetIds = targets.map((t) => t.cast_id);

    // 指定暦年の finalized/paid run（自店）→ payslip 合算
    const { data: runs, error: eRun } = await admin
      .from("payroll_runs").select("id").eq("store_id", storeId).like("period", `${year}-%`).in("status", ["finalized", "paid"]);
    if (eRun) throw new Error(eRun.message);
    const runIds = ((runs ?? []) as { id: string }[]).map((r) => r.id);

    const paysByCast = new Map<string, SlipPay[]>(); // ★裁定482: 月末の源泉＋日次精算の源泉（pay.dailyWithheld）を合算（taxSumOf）
    if (runIds.length > 0) {
      const { data: ps, error: ePs } = await admin
        .from("payslips").select("cast_id, breakdown_json").in("run_id", runIds).in("cast_id", targetIds);
      if (ePs) throw new Error(ePs.message);
      for (const p of (ps ?? []) as Record<string, unknown>[]) {
        const cid = p.cast_id as string;
        const bj = p.breakdown_json as PayBreakdown;
        paysByCast.set(cid, [...(paysByCast.get(cid) ?? []), bj.pay ?? {}]);
      }
    }

    // 源氏名・本名（cast_sensitive）
    const [{ data: castRows }, { data: sens }] = await Promise.all([
      admin.from("casts").select("id, name").in("id", targetIds),
      admin.from("cast_sensitive").select("cast_id, real_name").in("cast_id", targetIds),
    ]);
    const nameById = new Map<string, string>(((castRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    const realById = new Map<string, string | null>(((sens ?? []) as { cast_id: string; real_name: string | null }[]).map((s) => [s.cast_id, s.real_name]));

    // マイナンバー（get_cast_mynumber・service・呼ぶ度 audit・未取得は null）。人数分の read_cast_mynumber 監査が出る。
    const csvRows: TaxRow[] = [];
    for (const tgt of targets) {
      const { data: myn } = await admin.rpc("get_cast_mynumber", { p_org_id: orgId, p_actor: actorId, p_cast_id: tgt.cast_id });
      const sum = taxSumOf(paysByCast.get(tgt.cast_id) ?? []);
      if (onlyTargets && !isTaxReportTarget(sum.gross)) continue;
      csvRows.push({
        name: nameById.get(tgt.cast_id) ?? "",
        realName: realById.get(tgt.cast_id) ?? "",
        mynumber: mynumberCsvOf(myn as string | null, tgt.cast_id), // ★0201f（フラグ true）: 暗号文を復号（失敗は空欄にせず 500＝鍵の取り違えを見逃さない）
        gross: sum.gross,
        withholding: sum.withholding,
        target: isTaxReportTarget(sum.gross),
        invoice: tgt.invoice ?? "",
        regNo: tgt.reg_no ?? "",
      });
    }
    return csvResponse(year, csvRows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

type TaxRow = { name: string; realName: string | null; mynumber: string; gross: number; withholding: number; target: boolean; invoice: string; regNo: string };

function csvField(v: string | number): string {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function csvResponse(year: string, rows: TaxRow[]): NextResponse {
  const note = `支払調書作成用データ ${year}年（法定様式ではありません・様式は税理士にご確認ください）・${TAX_REPORT_NOTE_BASIS}`;
  const header = ["源氏名", "本名", "マイナンバー", "支払金額(源泉控除前)", "源泉徴収税額", "提出対象（年50万円超）", "インボイス区分", "登録番号"];
  const lines = [
    csvField(note),
    header.map(csvField).join(","),
    ...rows.map((r) =>
      [r.name, r.realName ?? "", r.mynumber, r.gross, r.withholding, r.target ? "対象" : "", r.invoice, r.regNo].map(csvField).join(",")),
  ];
  const body = "﻿" + lines.join("\r\n") + "\r\n"; // BOM 付き UTF-8
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tax-report-${year}.csv"`,
    },
  }) as unknown as NextResponse;
}
