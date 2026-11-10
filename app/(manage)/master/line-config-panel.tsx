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
import { LINE_CONFIG_KEYS, LINE_CONFIG_LABEL, LINE_LIMIT_NOTE, LINE_PLAN_TIERS, LINE_SECRET_KINDS, LINE_SECRET_LABEL, LINE_SECRET_PLACEHOLDER, liffEntryUrlOf, siteOriginOf, lineConfigErrorOf, lineConfigPatchOf, lineConfiguredOf, lineLimitErrorOf, lineLimitLabelOf, lineLimitStepOf, lineLoginReadyOf, webhookUrlOf, type LineConfig, type LineConfigKey, type LineSecretKind } from "@/lib/nox/line/liff-endpoint";
import { jstMonthOf, lineForecastOf, lineMonthLineOf, lineStatusOf, lineStatusTextOf, type LineMonthRow } from "@/lib/nox/line/push-forecast";
import { LINE_NOTIFY_COUNT_NOTE, LINE_NOTIFY_DEFAULT, LINE_NOTIFY_KINDS, LINE_NOTIFY_LABEL, LINE_NOTIFY_OWNER_NOTE, LINE_NOTIFY_SAVE_PENDING_NOTE, LINE_NOTIFY_SAVED_MSG, lineNotifyOf, lineNotifyPatchOf, type LineNotifyKind } from "@/lib/nox/line/notify-kinds"; // ★M-114（裁定459）★0199（種類ごとの保存）
import { mig0199On } from "@/lib/nox/rules-0175/flag"; // ★0199（M-114）: 保存は白名単 line_notify の後
import { errJa } from "@/lib/nox/errors"; // ★裁定467（M-126）

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
  const [notify, setNotify] = useState<Record<LineNotifyKind, boolean>>({ ...LINE_NOTIFY_DEFAULT }); // ★M-114（裁定459）: 通知の種類ごと ON／OFF（保存＝★0199 の白名単 line_notify・owner 限定）
  const notifyEditable = isOwner && !isDemo && mig0199On(); // ★0199（M-114）: 保存できるのは管理者（set_store_profile は owner 限定）・デモは変更不可・フラグ false は表示だけ
  const origin = siteOriginOf(typeof window !== "undefined" ? window.location.origin : ""); // ★便 D M-102: 発行する URL は site 固定の 1 値

  const load = useCallback(async () => {
    if (!storeId) return;
    const { data: s } = await supabase.from("stores").select("line_config, line_monthly_limit, settings_json").eq("id", storeId).maybeSingle();
    const c = ((s?.line_config ?? {}) as LineConfig);
    setNotify(lineNotifyOf((s?.settings_json ?? null) as Record<string, unknown> | null)); // ★M-114（裁定459）: 種類ごとの ON／OFF（キーが無ければ既定）
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
  async function saveNotify() { // ★0199（M-114・裁定459）: set_store_profile に {line_notify: 4 鍵を常に明示}（原則7）＝RPC が object／boolean／鍵名を検査（'bad line_notify'）
    if (!notifyEditable || !storeId) return;
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: lineNotifyPatchOf(notify) });
    setBusy(false);
    if (error) { setErr(errJa(error.message)); return; }
    setMsg(LINE_NOTIFY_SAVED_MSG); await load();
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
      {/* ★M-114（裁定459・2026-11-06）: 通知の種類ごと ON／OFF＝既定はお知らせだけ ON・シフト系は OFF。★0199（2026-11-10）: 保存＝settings_json.line_notify（白名単）＝管理者だけ・4 鍵を常に明示 */}
      <div style={{ marginTop: 16, display: "grid", gap: 6 }} data-line-notify-kinds="1" data-line-notify-editable={notifyEditable ? "1" : "0"}>
        <span style={t.fieldLabel}>LINE で送る通知の種類</span>
        <div style={{ display: "grid", gap: 4 }}>
          {LINE_NOTIFY_KINDS.map((k) => (
            <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, minHeight: 32 }} data-line-notify-kind={k} data-line-notify-on={notify[k] ? "1" : "0"}>
              <input type="checkbox" checked={notify[k]} disabled={!notifyEditable || busy} onChange={(e) => setNotify((n) => ({ ...n, [k]: e.target.checked }))} aria-label={LINE_NOTIFY_LABEL[k]} />{LINE_NOTIFY_LABEL[k]}{LINE_NOTIFY_DEFAULT[k] ? "（既定 ON）" : "（既定 OFF）"}
            </label>
          ))}
        </div>
        <p style={{ ...t.sub, margin: 0 }}>{LINE_NOTIFY_COUNT_NOTE}</p>
        {notifyEditable
          ? <div className="nox-actions">{/* ★便 BTN（裁定242）: 主ボタンは行の中央 */}<button type="button" style={{ ...t.btnPrimary56, width: "auto", padding: "0 28px" }} disabled={busy || !storeId} onClick={() => void saveNotify()} data-line-notify-save="1">{busy ? "保存中…" : "通知の種類を保存"}</button></div>
          : <p style={{ ...t.sub, margin: 0, color: "var(--v2-muted)" }}>{isDemo ? "デモ環境では LINE の設定を変更できません。" : !mig0199On() ? LINE_NOTIFY_SAVE_PENDING_NOTE : LINE_NOTIFY_OWNER_NOTE}</p>}
      </div>
      <div style={{ marginTop: 16, display: "grid", gap: 6 }} data-line-limit={limit}>
        <span style={t.fieldLabel}>月の送信上限（表示のための設定）</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || isDemo} onClick={() => void saveLimit(lineLimitStepOf(limit, -1))} aria-label="1 段下げる">−</button>
          <b className="num">{lineLimitLabelOf(limit)}</b>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || isDemo} onClick={() => void saveLimit(lineLimitStepOf(limit, 1))} aria-label="1 段上げる">＋</button>
          <input inputMode="numeric" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} style={{ ...t.input, width: 110 }} aria-label="任意の上限" />
          {isDemo && <span style={{ fontSize: 11.5, color: "var(--sub)" }} data-demo-reason="line-limit">デモでは上限を変えられません（本番の店で使えます）</span>}{/* ★M-139: デモで使えない操作は近くに理由 */}
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
