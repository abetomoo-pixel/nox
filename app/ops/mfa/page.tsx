// ★運営コンソール 版 1（夜便 2026-11-20 N5）: /ops/mfa＝認証アプリの登録（初回）か 6 桁の確かめ（2 回目から）。
//   requireOperatorPage({ allowMfa: true })＝未ログイン→/ops/login・運営者でない→404・aal1 の運営者だけこの画面・aal2 なら /ops へ。
import { redirect } from "next/navigation";
import { operatorGate, requireOperatorPage } from "@/lib/nox/ops/require-operator";
import OpsMfaForm from "./mfa-form";

export const dynamic = "force-dynamic";

export default async function OpsMfaPage() {
  await requireOperatorPage({ allowMfa: true });
  const { gate } = await operatorGate();
  if (gate === "ok") redirect("/ops");
  return <OpsMfaForm />;
}
