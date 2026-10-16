"use client";

// ★0172（裁定351・便 P172・2026-10-16）: 本番 org の開通ゲート＝店舗向け利用規約への同意（owner のみ・org 単位・冪等＝RPC terms_accept）。
//   デモ規約（demo-terms.tsx）と同じ形＝チェック→主ボタン 56。manager／staff は同意できない＝「オーナーの同意待ち」の案内だけ。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { TERMS_PATH, TERMS_VERSION, TERMS_VERSION_LABEL } from "@/lib/nox/terms";

export default function TermsAcceptForm({ isOwner, orgName }: { isOwner: boolean; orgName: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    if (!agreed || busy) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("terms_accept", { p_version: TERMS_VERSION });
    setBusy(false);
    if (error) { setErr(`同意の記録に失敗: ${rpcErrJa(error.message)}`); return; }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <section className="nox-cardtop" style={{ ...t.card, maxWidth: 560, margin: "0 auto" }} data-terms-accept="1">
      <h1 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 6px" }}>店舗向け利用規約への同意</h1>
      <p style={{ ...t.sub, margin: "0 0 12px", lineHeight: 1.7 }}>
        {orgName} で NOX を使い始めるには、店舗向け利用規約（{TERMS_VERSION_LABEL}）への同意が必要です。同意は店舗（法人）単位で 1 回・オーナーが行います。
      </p>
      <p style={{ margin: "0 0 12px" }}><a href={TERMS_PATH} target="_blank" rel="noreferrer" style={{ color: "var(--gold)", fontWeight: 700 }}>規約の全文を読む（別タブ）</a></p>
      {isOwner ? (
        <>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={busy} data-terms-agree="1" />
            利用規約（{TERMS_VERSION_LABEL}）に同意する
          </label>
          {err && <Message kind="error" style={{ margin: "10px 0 0" }}>{err}</Message>}
          <button type="button" style={{ ...t.btnPrimary56, marginTop: 14, opacity: agreed ? 1 : 0.5 }} disabled={!agreed || busy} onClick={() => void accept()} data-terms-submit="1">
            {busy ? "記録中…" : "同意して使い始める"}
          </button>
        </>
      ) : (
        <Message kind="warn" style={{ margin: 0 }}>オーナーの同意待ちです。オーナーがログインして同意すると、店舗の全員が使えるようになります。</Message>
      )}
    </section>
  );
}
