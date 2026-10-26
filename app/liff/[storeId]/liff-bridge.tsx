"use client";

// ★便 ON-3（2026-10-26・0176 ★1＝401）: LIFF の橋＝SDK を読み込み liff.init → 未ログインなら liff.login → getIDToken → クエリで分岐（t と m=bind＝POST /api/line/bind／無し＝POST /api/line/session）→ 行き先へ。
//   id_token はこの POST にだけ乗せる（URL・ログに出さない）。失敗は画面に 1 行（route の語→日本語）。
import { useEffect, useState } from "react";

type Liff = { init: (o: { liffId: string }) => Promise<void>; isLoggedIn: () => boolean; login: (o?: { redirectUri?: string }) => void; getIDToken: () => string | null };
declare global { interface Window { liff?: Liff } }

const SDK = "https://static.line-scdn.net/liff/edge/2/sdk.js";
const jaOf = (code: string): string => {
  if (/not linked/.test(code)) return "この LINE はまだ紐付いていません。お店から受け取ったリンク（招待）から開いてください。";
  if (/already linked/.test(code)) return "この LINE は別の人に紐付いています。お店にご確認ください。";
  if (/bad token/.test(code)) return "この招待は使えません（使用済みか期限切れ）。お店に再発行を依頼してください。";
  if (/no_login/.test(code)) return "紐付けは済みましたが、ログインの登録がまだです。お店に「招待」を依頼してください。";
  if (/not configured/.test(code)) return "この店の LINE 連携はまだ設定されていません。";
  if (/bad id_token/.test(code)) return "LINE の確認に失敗しました。もう一度開いてください。";
  return `ログインできませんでした（${code}）`;
};

export default function LiffBridge({ storeId, liffId }: { storeId: string; liffId: string }) {
  const [msg, setMsg] = useState("LINE に接続しています…");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.liff) await new Promise<void>((ok, ng) => { const s = document.createElement("script"); s.src = SDK; s.async = true; s.onload = () => ok(); s.onerror = () => ng(new Error("sdk")); document.head.appendChild(s); });
        const liff = window.liff!;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) { setMsg("LINE のログイン画面へ移動します…"); liff.login({ redirectUri: window.location.href }); return; }
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error("bad id_token");
        const q = new URLSearchParams(window.location.search);
        const token = q.get("t"), mode = q.get("m");
        const bind = !!token && mode === "bind";
        setMsg(bind ? "紐付けています…" : "ログインしています…");
        const res = await fetch(bind ? "/api/line/bind" : "/api/line/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bind ? { storeId, idToken, token } : { storeId, idToken }) });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; dest?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !j.ok || !j.dest) { setErr(jaOf(j.error ?? String(res.status))); setMsg(""); return; }
        setMsg("移動します…");
        window.location.replace(j.dest);
      } catch (e) { if (!cancelled) { setErr(jaOf(e instanceof Error ? e.message : "error")); setMsg(""); } }
    })();
    return () => { cancelled = true; };
  }, [storeId, liffId]);
  return (
    <div data-liff-bridge="1">
      {msg && <p style={{ fontSize: 13.5, color: "#555" }}>{msg}</p>}
      {err && <p role="alert" style={{ fontSize: 13.5, color: "#b3261e", fontWeight: 700, lineHeight: 1.7 }}>{err}</p>}
    </div>
  );
}
