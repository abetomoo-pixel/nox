"use client";

// ★便 ON-3（2026-10-26・0176 ★1＝401 LINE 連携と送信数）: 店舗設定 ＞ LINE 連携（?tab=line）。owner＝全店（select）／manager＝自店。
//   公開値（ログインチャネル ID・LIFF ID・destination）＝set_store_line_config／シークレット 2 本＝POST /api/line/secret（Vault・「変更時のみ入力」）／
//   月の上限＝set_store_line_limit（段 200／5,000／30,000・任意の数も可）／今月の送信数＝line_push_month_summary（JST 暦月・着地見込み・状態）。
//   入口 URL（LIFF エンドポイント）と Webhook URL はここで表示・コピー（LINE Developers に貼る＝手順書）。デモ org は保存ボタンを出さない（route が 403）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast, { Message } from "@/components/ui/toast";
import { rpcErrJa } from "@/lib/nox/ui/rpc-err";
import { useIsDemo } from "@/lib/nox/demo/context";
import { LINE_CONFIG_KEYS, LINE_CONFIG_LABEL, LINE_LIMIT_NOTE, LINE_PLAN_TIERS, LINE_SECRET_KINDS, LINE_SECRET_LABEL, LINE_SECRET_PLACEHOLDER, liffEntryUrlOf, lineConfigErrorOf, lineConfigPatchOf, lineConfiguredOf, lineLimitErrorOf, lineLimitLabelOf, lineLimitStepOf, lineLoginReadyOf, webhookUrlOf, type LineConfig, type LineConfigKey, type LineSecretKind } from "@/lib/nox/line/liff-endpoint";
import { jstMonthOf, lineForecastOf, lineMonthLineOf, lineStatusOf, lineStatusTextOf, type LineMonthRow } from "@/lib/nox/line/push-forecast";

type Store = { id: string; name: string };

export default function LineConfigPanel({ stores, isOwner }: { stores: Store[]; isOwner: boolean }) {
  const supabase = createClient();
  const isDemo = useIsDemo();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [cfg, setCfg] = useState<LineConfig | null>(null);
  const [limit, setLimit] = useState(200);
  const [form, setForm] = useState<Record<LineConfigKey, string>>({ login_channel_id: "", liff_id: "", bot_destination: "" });
  const [secrets, setSecrets] = useState<Record<LineSecretKind, string>>({ channel_secret: "", access_token: "" });
  const [limitInput, setLimitInput] = useState("200");
  const [month, setMonth] = useState<LineMonthRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const load = useCallback(async () => {
    if (!storeId) return;
    const { data: s } = await supabase.from("stores").select("line_config, line_monthly_limit").eq("id", storeId).maybeSingle();
    const c = ((s?.line_config ?? {}) as LineConfig);
    setCfg(c); setLimit(Number(s?.line_monthly_limit ?? 200)); setLimitInput(String(s?.line_monthly_limit ?? 200));
    setForm({ login_channel_id: c.login_channel_id ?? "", liff_id: c.liff_id ?? "", bot_destination: c.bot_destination ?? "" });
    const { data: m } = await supabase.rpc("line_push_month_summary", { p_month: jstMonthOf(Date.now()).month });
    setMonth((((m ?? []) as LineMonthRow[]).find((r) => r.store_id === storeId)) ?? null);
  }, [supabase, storeId]);
  useEffect(() => { void load(); }, [load]);

  async function saveConfig() {
    const v = lineConfigErrorOf(form); if (v) { setErr(v); return; }
    const patch = lineConfigPatchOf(form, cfg);
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (patch) { const { error } = await supabase.rpc("set_store_line_config", { p_store_id: storeId, p_patch: patch }); if (error) { setErr(rpcErrJa(error.message)); return; } }
      for (const k of LINE_SECRET_KINDS) {
        if (!secrets[k].trim()) continue;
        const res = await fetch("/api/line/secret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storeId, kind: k, secret: secrets[k] }) });
        if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(`${LINE_SECRET_LABEL[k]}の保存に失敗: ${j.error ?? res.status}`); return; }
      }
      setSecrets({ channel_secret: "", access_token: "" });
      setMsg(patch || secrets.channel_secret || secrets.access_token ? "LINE の設定を保存しました" : "変更がありません");
      await load();
    } finally { setBusy(false); }
  }
  async function saveLimit(n: number) {
    const v = lineLimitErrorOf(n); if (v) { setErr(v); return; }
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await supabase.rpc("set_store_line_limit", { p_store_id: storeId, p_limit: n });
    setBusy(false);
    if (error) { setErr(rpcErrJa(error.message)); return; }
    setMsg(`月の上限を ${lineLimitLabelOf(n)} にしました`); await load();
  }
  const copy = (k: string, v: string) => { void navigator.clipboard?.writeText(v).then(() => setCopied(k)).catch(() => undefined); };
  const jm = jstMonthOf(Date.now());
  const st = month ? lineStatusOf(month.sent, month.monthly_limit, lineForecastOf(month.sent, jm.dayOfMonth, jm.daysInMonth), jm.dayOfMonth) : null;
  const row: React.CSSProperties = { display: "grid", gap: 4 };

  return (
    <section className="nox-panel" data-line-config-panel="1" data-line-configured={lineConfiguredOf(cfg) ? "1" : "0"}>
      <h3>LINE 連携</h3>
      {isOwner && stores.length > 1 && (
        <label style={{ ...row, maxWidth: 320, marginBottom: 10 }}><span style={t.fieldLabel}>店舗</span>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={t.input}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
      )}
      <div className="nox-inset" style={{ padding: "10px 12px", marginBottom: 12, display: "grid", gap: 6 }} data-line-urls="1">
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--champ)" }}>LINE Developers に貼る URL（店ごとにチャネルを 2 つ＝Messaging API と LINE ログイン）</p>
        {([["LIFF エンドポイント URL（LINE ログインチャネル ＞ LIFF・サイズ Full・Scope openid）", liffEntryUrlOf(origin, storeId), "liff"], ["Webhook URL（Messaging API チャネル ＞ Webhook の利用 ON・応答メッセージ OFF）", webhookUrlOf(origin, storeId), "webhook"]] as const).map(([l, v, k]) => (
          <div key={k} style={{ display: "grid", gap: 2, fontSize: 12 }}>
            <span style={{ color: "var(--sub)" }}>{l}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><code style={{ fontSize: 11.5, wordBreak: "break-all" }} data-line-url={k}>{v}</code><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => copy(k, v)}>{copied === k ? "コピーしました ✓" : "コピー"}</button></span>
          </div>
        ))}
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--sub)" }}>状態: {lineLoginReadyOf(cfg) ? "ログイン可（チャネル ID・LIFF ID あり）" : "ログイン未設定"}・{lineConfiguredOf(cfg) ? "通知可（アクセストークンあり）" : "通知未設定（アクセストークンなし）"}</p>
      </div>
      <div style={{ display: "grid", gap: 10, maxWidth: 560 }} data-line-form="1">
        {LINE_CONFIG_KEYS.map((k) => (
          <label key={k} style={row}><span style={t.fieldLabel}>{LINE_CONFIG_LABEL[k]}</span>
            <input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={t.input} maxLength={100} placeholder={k === "bot_destination" ? "U で始まる 33 文字（任意）" : ""} data-line-field={k} />
          </label>
        ))}
        {LINE_SECRET_KINDS.map((k) => (
          <label key={k} style={row}><span style={t.fieldLabel}>{LINE_SECRET_LABEL[k]}{cfg?.[k === "channel_secret" ? "channel_secret_ref" : "access_token_ref"] ? "（設定済み）" : "（未設定）"}</span>
            <input type="password" value={secrets[k]} onChange={(e) => setSecrets((s) => ({ ...s, [k]: e.target.value }))} style={t.input} placeholder={LINE_SECRET_PLACEHOLDER} autoComplete="off" data-line-secret={k} />
          </label>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>{/* ★便 BTN: 保存はフォームの列（最大 560px）の外＝カードの中央 */}
        {isDemo ? <p style={{ ...t.sub, margin: 0 }}>デモ環境では LINE の設定を変更できません。</p>
          : <div className="nox-actions">{/* ★便 BTN（裁定242）: 主ボタンは行の中央 */}<button type="button" style={{ ...t.btnPrimary56, width: "auto", padding: "0 28px" }} disabled={busy || !storeId} onClick={() => void saveConfig()} data-line-save="1">{busy ? "保存中…" : "LINE の設定を保存"}</button></div>}
      </div>
      <div style={{ marginTop: 16, display: "grid", gap: 6 }} data-line-limit={limit}>
        <span style={t.fieldLabel}>月の送信上限（表示のための設定）</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || isDemo} onClick={() => void saveLimit(lineLimitStepOf(limit, -1))} aria-label="1 段下げる">−</button>
          <b className="num">{lineLimitLabelOf(limit)}</b>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || isDemo} onClick={() => void saveLimit(lineLimitStepOf(limit, 1))} aria-label="1 段上げる">＋</button>
          <input inputMode="numeric" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} style={{ ...t.input, width: 110 }} aria-label="任意の上限" />
          {!isDemo && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => void saveLimit(Number(limitInput))}>この数にする</button>}
        </div>
        <p style={{ ...t.sub, margin: 0 }}>{LINE_PLAN_TIERS.map(lineLimitLabelOf).join("・")}。{LINE_LIMIT_NOTE}</p>
      </div>
      <div style={{ marginTop: 16 }} data-line-month={month ? st ?? "normal" : "none"}>
        <span style={t.fieldLabel}>今月の送信数（JST の暦月・sent の宛先数の合計）</span>
        {month ? (<>
          <p className="num" style={{ margin: "4px 0 0", fontSize: 13 }}>{lineMonthLineOf(month, jm.dayOfMonth, jm.daysInMonth)}</p>
          {st && st !== "normal" && <Message kind={st === "over" ? "error" : "warn"}>{lineStatusTextOf(st, month.monthly_limit, month.rejected_429)}</Message>}
          {st === "normal" && month.rejected_429 > 0 && <Message kind="warn">{lineStatusTextOf(st, month.monthly_limit, month.rejected_429)}</Message>}
        </>) : <p style={{ ...t.sub, margin: "4px 0 0" }}>まだ送信はありません。</p>}
      </div>
      {err && <Message kind="error">{err}</Message>}
      {msg && <Toast msg={msg} />}
    </section>
  );
}
