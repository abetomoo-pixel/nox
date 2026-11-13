// ★2026-11-13 夜（相談役■2 e・プライバシーポリシー第 7 条「操作の記録（監査ログ）7 年で消去」）: 監査ログの 7 年での消去を 1 日 1 回（Vercel Cron）。
//   呼ぶのは既存の audit_purge()（supabase/migrations/0155_compliance.sql:492・service_role だけ・テナントの JWT からは forbidden・7 年より前の行を org ごとに消し、
//   消した org だけ 'audit_purge' の行に件数・最古・最新・cutoff を残す＝0 件の日は何も書かない）。DB は変えない。今は 7 年を超える行が無い＝消える行は 0。
//   起動＝vercel.json の crons（JST 4:30＝デモの初期化 06:05 と重ならない）・保護＝Authorization: Bearer CRON_SECRET（ほかの cron と同じ）。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("audit_purge");
  if (error) {
    console.error(`cron audit-purge: 失敗 ${error.message}`);
    return new NextResponse("error", { status: 500 });
  }
  console.log(`cron audit-purge: ${JSON.stringify(data)}`);
  return NextResponse.json({ ok: true, result: data });
}
