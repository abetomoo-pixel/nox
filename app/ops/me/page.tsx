// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: /ops/me＝自分の設定（管理者も担当も）＝名前・メール・役（読むだけ）とパスワードの変更。
//   認証アプリを替えるときは管理者にリセットを頼む（自分のリセットはできない）。旗 false は 404。
import { notFound } from "next/navigation";
import { requireOperatorPage } from "@/lib/nox/ops/require-operator";
import { mig0209On } from "@/lib/nox/rules-0175/flag";
import OpsShell from "../ops-shell";
import OpsMeForm from "./me-form";

export const dynamic = "force-dynamic";

export default async function OpsMePage() {
  if (!mig0209On()) notFound();
  const op = await requireOperatorPage();
  return <OpsShell name={op.name} role={op.role}><OpsMeForm name={op.name} email={op.email} role={op.role} /></OpsShell>;
}
