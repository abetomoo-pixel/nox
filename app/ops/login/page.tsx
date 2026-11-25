// ★運営コンソール 版 1（夜便 2026-11-20 N5）: /ops/login＝運営者のログイン（メール・パスワード）。失敗の文は運営者でない人にも同じ（運営の画面があることを教えない）。
//   旗 MIG_0202A_APPLIED が false の間は 404（layout）。ログインできたら /ops/mfa（登録か 6 桁）。運営者かどうかは /ops/mfa の後の requireOperator が決める。
import OpsLoginForm from "./login-form";
import { mig0209On } from "@/lib/nox/rules-0175/flag";

export const dynamic = "force-dynamic";

export default async function OpsLoginPage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const sp = await searchParams;
  return <OpsLoginForm again={mig0209On() && sp.again === "1"} />;   // ★0209（起票155 の 2）: requireOperator の relogin から来たときの 1 行
}
