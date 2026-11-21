"use client";
// ★運営コンソール 版 1（夜便 2026-11-20 N5）: 上の帯（「NOX 運営」・運営者の名前・ログアウト）と本文の枠。
// ★2026-11-21 夕（相談役 16:15）: 器に店の画面と同じ暗い配色（nox-dark＋t.appBg）を付けた＝それまで地は body の明るい色・文字は --ink の黒のままで、
//   カード（t.card は暗い色の固定）の中の文字が読めなかった（/ops・/ops/orgs/new・/ops/orgs/[id]）。OS の表示設定（ライト・ダーク）では変わらない。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";

export default function OpsShell({ name, children }: { name: string; children: React.ReactNode }) {
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
          <span data-ops-operator="1">{name}</span>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => void logout()}>ログアウト</button>
        </span>
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 16px 40px" }}>{children}</main>
    </div>
  );
}
