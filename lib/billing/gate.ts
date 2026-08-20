// 管理系書込の billing ゲート（API ルート用・設計書 v1 §5＝BIL-7・donor lib/billing/gate.ts 型）。
//   SQL 述語 public.auth_org_billing_writable() を **user client** で RPC 呼び＝
//   RPC 冒頭ゲート（対象94本）と writable 集合が完全一致（ドリフト防止）。
//   writable なら null（続行）・そうでなければ 402 を返す。
//
//   ★★現状 **未適用**（適用対象が確定していない＝申告①・要裁定）。下の当初列挙は実装照合で崩れた:
//     - advance/issue・advance/cancel・incentive/publish・incentive/cancel・cast/invite・kiosk/provision
//       … いずれも **user client で RPC を呼ぶ**（admin は auth ユーザー作成と GET 読取のみ）。
//       これらの RPC は課金ゲート名簿 A4/A10/A11 の対象＝**RPC 冒頭で既にゲート済み**＝route ゲートは冗長。
//     - payment/record（payment_record_add）・payroll/finalize（payroll_finalize）・payroll/reopen（payroll_reopen）
//       … 名簿 **B(e)「payroll 系一式＝給与は過去労働の清算」/ B(a) 構造除外** で**意図的に対象外**。
//       ここに route ゲートを噛ませると、名簿が明文で外した操作を新たに止める＝挙動変更になる。
//     → 結果、「RPC ゲートを迂回していて、かつ名簿が止めるべきとしている書込 route」は**現状ゼロ**。
//       BIL-7 を空適用のまま置くか／payroll 系を route 側で止める裁定を出すかは Agoora 判断。
//   ★噛ませない（これは確定）: payroll/preview（読取）・mine/*（cast 自己）・print/*（「出せる」原則）・
//     cron/*（service・ユーザー文脈なし）・stripe/webhook（Stripe→自分）・billing/*（課金操作そのもの）
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BILLING_LOCKED_MSG, BILLING_LOCKED_CODE } from "./messages";

export async function billingGate(supabase: SupabaseClient): Promise<NextResponse | null> {
  const { data, error } = await supabase.rpc("auth_org_billing_writable");
  if (error) return NextResponse.json({ error: "ご契約状態を確認できませんでした" }, { status: 500 });
  if (data === true) return null;
  return NextResponse.json({ error: BILLING_LOCKED_MSG, code: BILLING_LOCKED_CODE }, { status: 402 });
}
