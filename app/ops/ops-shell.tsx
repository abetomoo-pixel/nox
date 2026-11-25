"use client";
// ★運営コンソール 版 1（夜便 2026-11-20 N5）: 上の帯（「NOX 運営」・運営者の名前・ログアウト）と本文の枠。
// ★2026-11-21 夕（相談役 16:15）: 器に店の画面と同じ暗い配色（nox-dark＋t.appBg）を付けた＝それまで地は body の明るい色・文字は --ink の黒のままで、
//   カード（t.card は暗い色の固定）の中の文字が読めなかった（/ops・/ops/orgs/new・/ops/orgs/[id]）。OS の表示設定（ライト・ダーク）では変わらない。
// ★【D8】起票155 の 2（2026-11-25・旗 MIG_0209_APPLIED の後ろ）: 帯に「運営者」（管理者だけ＝担当には出さない）と「自分の設定」。role を渡さない呼び出し（配色の検査）は今のまま。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { mig0209On } from "@/lib/nox/rules-0175/flag";
import { isOpsAdminRole } from "@/lib/nox/ops/operators";

export default function OpsShell({ name, role, children }: { name: string; /** ★0209: 運営者の役（ops_admin＝管理者のときだけ「運営者」のリンク） */ role?: string; children: React.ReactNode }) {
  const router = useRouter();
  async function logout() {
    await createClient().auth.signOut();
    router.replace("/ops/login");
    router.refresh();
  }
  return (
    <div className="nox-dark nox-ops" data-ops-shell="1" style={t.appBg}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
        <Link href="/ops" style={{ fontWeight: 800, fontSize: 15, color: "var(--v2-text, var(--ink))", textDecoration: "none" }}>NOX 運営</Link>
        <span style={{ display: "inline-flex", gap: 10, alignItems: "center", fontSize: 12.5 }}>
          {mig0209On() && role !== undefined && isOpsAdminRole(role) && <Link href="/ops/operators" className="nox-link" data-ops-nav-operators="1">運営者</Link>}
          {mig0209On() && role !== undefined && <Link href="/ops/me" className="nox-link" data-ops-nav-me="1">自分の設定</Link>}
          <span data-ops-operator="1">{name}</span>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => void logout()}>ログアウト</button>
        </span>
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 16px 40px" }}>{children}</main>
    </div>
  );
}
