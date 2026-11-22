"use client";

// ★0172（裁定351・便 P172・2026-10-16）: 本番 org の開通ゲート＝店舗向け利用規約への同意（owner のみ・org 単位・冪等＝RPC terms_accept）。
//   デモ規約（demo-terms.tsx）と同じ形＝チェック→主ボタン 56。manager／staff は同意できない＝「オーナーの同意待ち」の案内だけ。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { TERMS_ACCEPT_LABEL, TERMS_PATH, TERMS_VERSION } from "@/lib/nox/terms";

export default function TermsAcceptForm({ isOwner, orgName }: { isOwner: boolean; orgName: string }) {
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
    window.location.replace("/dashboard"); // ★2026-11-22（相談役 14:10 の 1）: 読み直す移動＝初期設定が途中の店で殻の戻しがくり返して白くなるのを避ける（ログインと同じ形）
  }

  return (
    <section className="nox-cardtop" style={{ ...t.card, width: "100%", maxWidth: 560, margin: "0 auto" }} data-terms-accept="1">
      <h1 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 6px" }}>店舗向け利用規約への同意</h1>
      <p style={{ ...t.sub, margin: "0 0 12px", lineHeight: 1.7 }}>
        {orgName} で NOX を使い始めるには、店舗向け利用規約（{TERMS_ACCEPT_LABEL}）への同意が必要です。同意は店舗（法人）単位で 1 回・管理者が行います。
      </p>
      <p style={{ margin: "0 0 12px" }}><a href={TERMS_PATH} target="_blank" rel="noreferrer" style={{ color: "var(--gold)", fontWeight: 700 }}>規約の全文を読む（別タブ）</a></p>
      {isOwner ? (
        <>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} disabled={busy} data-terms-agree="1" />
            利用規約（{TERMS_ACCEPT_LABEL}）に同意する
          </label>
          {err && <Message kind="error" style={{ margin: "10px 0 0" }}>{err}</Message>}
          <div className="nox-actions" style={{ marginTop: 14 }}><button type="button" style={{ ...t.btnPrimary56, maxWidth: 360, ...(agreed ? {} : { background: "var(--card2)", borderColor: "var(--line2)", color: "var(--sub)", opacity: 1 }) }} disabled={!agreed || busy} onClick={() => void accept()} data-terms-submit="1">
            {busy ? "記録中…" : "同意して使い始める"}
          </button></div>
        </>
      ) : (
        <Message kind="warn" style={{ margin: 0 }}>管理者の同意待ちです。管理者がログインして同意すると、店舗の全員が使えるようになります。</Message>
      )}
    </section>
  );
}
