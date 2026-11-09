"use client";

import { siteHrefOf, siteOriginOf } from "@/lib/nox/line/liff-endpoint"; // ★便 D M-102
// ★便 ON-3（2026-10-26・0176 ★1＝401）: LIFF の橋＝SDK を読み込み liff.init → 未ログインなら liff.login → getIDToken → クエリで分岐（t と m=bind＝POST /api/line/bind／無し＝POST /api/line/session）→ 行き先へ。
//   id_token はこの POST にだけ乗せる（URL・ログに出さない）。失敗は画面に 1 行（route の語→日本語）。
import { useEffect, useState } from "react";
import { errJa } from "@/lib/nox/errors"; // ★裁定467（M-126）: 利用者向けの文言は辞書 1 本

type Liff = { init: (o: { liffId: string }) => Promise<void>; isLoggedIn: () => boolean; login: (o?: { redirectUri?: string }) => void; logout: () => void; getIDToken: () => string | null };
// ★M-116（2026-11-06・便 F・相談役 承認）: 期限切れ ID トークン＝LIFF はログイン状態を保ったまま古い id_token を返す（LINE の verify が 400）→ route の 401「bad id_token」を受けたら
//   1 回だけ liff.logout() → liff.login() で取り直す（sessionStorage の鍵でループ防止）。2 回目も 401 なら案内を出して止まる。成功したら鍵を消す。
export const LIFF_RETRY_KEY_PREFIX = "nox_liff_retry:";
export const LIFF_EXPIRED_TEXT = "LINE のログインが期限切れです。LINE アプリを閉じて開き直してください（それでも通らなければお店にご確認ください）";
const retryKeyOf = (storeId: string): string => `${LIFF_RETRY_KEY_PREFIX}${storeId}`;
const readRetry = (k: string): boolean => { try { return window.sessionStorage.getItem(k) === "1"; } catch { return false; } };
const writeRetry = (k: string, on: boolean): void => { try { if (on) window.sessionStorage.setItem(k, "1"); else window.sessionStorage.removeItem(k); } catch { /* noop */ } };
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
        if (!liff.isLoggedIn()) { setMsg("LINE のログイン画面へ移動します…"); liff.login({ redirectUri: siteHrefOf(window.location.href, siteOriginOf(window.location.origin)) }); return; } // ★便 D M-102: redirectUri は site 固定の host
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error("bad id_token");
        const q = new URLSearchParams(window.location.search);
        const token = q.get("t"), mode = q.get("m");
        const bind = !!token && mode === "bind";
        setMsg(bind ? "紐付けています…" : "ログインしています…");
        const res = await fetch(bind ? "/api/line/bind" : "/api/line/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bind ? { storeId, idToken, token } : { storeId, idToken }) });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; dest?: string; error?: string; reason?: string; detail?: string };
        if (cancelled) return;
        if (res.status === 401 && j.error === "bad id_token") { // ★M-116: 期限切れ（など）＝1 回だけ取り直す
          const key = retryKeyOf(storeId);
          if (!readRetry(key)) { writeRetry(key, true); setMsg("LINE のログインを更新しています…"); liff.logout(); liff.login({ redirectUri: siteHrefOf(window.location.href, siteOriginOf(window.location.origin)) }); return; }
          setErr(j.reason === "expired" ? LIFF_EXPIRED_TEXT : `${jaOf("bad id_token")}${j.detail ? `（${j.detail}）` : ""}`); setMsg(""); return;
        }
        if (!res.ok || !j.ok || !j.dest) { setErr(jaOf(j.error ?? String(res.status))); setMsg(""); return; }
        writeRetry(retryKeyOf(storeId), false); // ★M-116: 成功＝再試行の鍵を消す
        setMsg("移動します…");
        window.location.replace(j.dest);
      } catch (e) { if (!cancelled) { setErr(jaOf(e instanceof Error ? errJa(e.message) : "error")); setMsg(""); } }
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
