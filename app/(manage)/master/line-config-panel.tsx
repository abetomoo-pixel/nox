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
import { LINE_CONFIG_KEYS, LINE_CONFIG_LABEL, LINE_LIMIT_NOTE, LINE_PLAN_TIERS, LINE_SECRET_KINDS, LINE_SECRET_LABEL, LINE_SECRET_PLACEHOLDER, siteOriginOf, lineConfigErrorOf, lineConfigPatchOf, lineConfiguredOf, lineLimitErrorOf, lineLimitLabelOf, lineLimitStepOf, lineLoginReadyOf, type LineConfig, type LineConfigKey, type LineSecretKind } from "@/lib/nox/line/liff-endpoint";
import { jstMonthOf, lineForecastOf, lineMonthLineOf, lineStatusOf, lineStatusTextOf, type LineMonthRow } from "@/lib/nox/line/push-forecast";
import { LINE_NOTIFY_COUNT_NOTE, LINE_NOTIFY_DEFAULT, LINE_NOTIFY_KINDS, LINE_NOTIFY_LABEL, LINE_NOTIFY_OWNER_NOTE, LINE_NOTIFY_SAVE_PENDING_NOTE, LINE_NOTIFY_SAVED_MSG, lineNotifyOf, lineNotifyPatchOf, type LineNotifyKind } from "@/lib/nox/line/notify-kinds"; // ★M-114（裁定459）★0199（種類ごとの保存）
import { mig0199On } from "@/lib/nox/rules-0175/flag"; // ★0199（M-114）: 保存は白名単 line_notify の後
import { errJa } from "@/lib/nox/errors"; // ★裁定467（M-126）
import LineUrls from "@/components/nox/line-urls"; // ★2026-11-22: LINE Developers に貼る URL（運営の代行と同じ部品）
import InfoTip from "@/components/ui/info-tip"; // ★2026-11-16（C）: 補足は項目の横の ⓘ（店舗情報のパネルと同じ形）
import { mig0201qOn } from "@/lib/nox/rules-0175/flag"; // ★2026-11-18 夜（相談役 ⑤）: 0201q の set_store_line_extra（公式アカウントの ID・リッチメニューの ID）
import { BOT_BASIC_ID_NOTE, RICHMENU_STATE_JA, botBasicIdErrorOf, botBasicIdNormOf, richMenuAutoOf, richMenuResultTextOf, richMenuStateOf, type RichMenuAction } from "@/lib/nox/line/richmenu";

type Store = { id: string; name: string };
/** ★2026-11-20 午後（相談役 ③）: 保存のあとに読み直す範囲＝押した節だけ（ほかの節の保存していない入力を DB の値で上書きしない）。all＝最初と店の切り替え */
type LoadPart = "all" | "config" | "notify" | "limit" | "cfg";
/** 結果の文を出す場所＝押したボタンの近く */
type MsgAt = "config" | "notify" | "limit";

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
  const [msgAt, setMsgAt] = useState<MsgAt>("config"); // ★相談役 ③: 結果の文は押したボタンの近くに
  const [botId, setBotId] = useState(""); // ★相談役 ⑤: 公式アカウントの ID（入れると友だち追加が必須）
  const [rmMsg, setRmMsg] = useState<{ ok: boolean; text: string } | null>(null); // ★相談役 ⑤: リッチメニューの結果（設定の保存とは別の行＝失敗しても保存は止めない）
  const extraOn = mig0201qOn();
  const [notify, setNotify] = useState<Record<LineNotifyKind, boolean>>({ ...LINE_NOTIFY_DEFAULT }); // ★M-114（裁定459）: 通知の種類ごと ON／OFF（保存＝★0199 の白名単 line_notify・owner 限定）
  const [savedNotify, setSavedNotify] = useState<Record<LineNotifyKind, boolean>>({ ...LINE_NOTIFY_DEFAULT }); // ★相談役 ③: DB の値（まだ保存していない変更の印）
  const notifyEditable = isOwner && !isDemo && mig0199On(); // ★0199（M-114）: 保存できるのは管理者（set_store_profile は owner 限定）・デモは変更不可・フラグ false は表示だけ
  const origin = siteOriginOf(typeof window !== "undefined" ? window.location.origin : ""); // ★便 D M-102: 発行する URL は site 固定の 1 値

  const load = useCallback(async (part: LoadPart = "all") => {
    if (!storeId) return;
    const { data: s } = await supabase.from("stores").select("line_config, line_monthly_limit, settings_json").eq("id", storeId).maybeSingle();
    const c = ((s?.line_config ?? {}) as LineConfig);
    const nf = lineNotifyOf((s?.settings_json ?? null) as Record<string, unknown> | null); // ★M-114（裁定459）: 種類ごとの ON／OFF（キーが無ければ既定）
    setSavedNotify(nf);
    // ★2026-11-20 午後（相談役 ③）: 入力の欄を DB の値に戻すのは、最初・店の切り替え・その節の保存のときだけ（ほかのボタンでは戻さない）
    if (part === "all" || part === "notify") setNotify(nf);
    setCfg(c); setLimit(Number(s?.line_monthly_limit ?? 200));
    if (part === "all" || part === "limit") setLimitInput(String(s?.line_monthly_limit ?? 200));
    if (part === "all" || part === "config") {
      setForm({ login_channel_id: c.login_channel_id ?? "", liff_id: c.liff_id ?? "", bot_destination: c.bot_destination ?? "" });
      setBotId(c.bot_basic_id ?? "");
    }
    const { data: m } = await supabase.rpc("line_push_month_summary", { p_month: jstMonthOf(Date.now()).month });
    setMonth((((m ?? []) as LineMonthRow[]).find((r) => r.store_id === storeId)) ?? null);
  }, [supabase, storeId]);
  useEffect(() => { void load(); }, [load]);

  async function richMenu(action: RichMenuAction) { // ★2026-11-18 夜（相談役 ⑤）: NOX から LINE にリッチメニューを登録（友だち全員）／作り直す／外す＝route（トークンはサーバーだけ）
    setRmMsg(null);
    const res = await fetch("/api/line/richmenu", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storeId, action }) }).catch(() => null);
    const j = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; status?: string; reason?: string; detail?: string; error?: string };
    const r = { ok: !!j.ok, status: j.status, reason: j.reason ?? j.error ?? (res ? String(res.status) : "network"), detail: j.detail };
    setRmMsg({ ok: r.ok, text: richMenuResultTextOf(r) });
    await load("cfg"); // ★相談役 ③: リッチメニューの状態だけ読み直す（保存していない入力は残す）
  }
  async function saveConfig() {
    setMsgAt("config");
    const v = lineConfigErrorOf(form); if (v) { setErr(v); return; }
    const vb = extraOn ? botBasicIdErrorOf(botId) : null; if (vb) { setErr(vb); return; }
    const patch = lineConfigPatchOf(form, cfg);
    const botNext = botBasicIdNormOf(botId) || null, botChanged = extraOn && botNext !== (cfg?.bot_basic_id ?? null);
    const auto = extraOn && !isDemo && richMenuAutoOf(!!patch && "liff_id" in patch, !!secrets.access_token.trim()); // ★相談役 ⑤: LIFF ID かアクセストークンを入れた保存のときだけ自動で登録
    setBusy(true); setErr(null); setMsg(null); setRmMsg(null);
    try {
      if (patch) { const { error } = await supabase.rpc("set_store_line_config", { p_store_id: storeId, p_patch: patch }); if (error) { setErr(rpcErrJa(error.message)); return; } }
      if (botChanged) { const { error } = await supabase.rpc("set_store_line_extra", { p_store_id: storeId, p_patch: { bot_basic_id: botNext } }); if (error) { setErr(rpcErrJa(error.message)); return; } }
      for (const k of LINE_SECRET_KINDS) {
        if (!secrets[k].trim()) continue;
        const res = await fetch("/api/line/secret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storeId, kind: k, secret: secrets[k] }) });
        if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string }; setErr(`${LINE_SECRET_LABEL[k]}の保存に失敗: ${rpcErrJa(j.error ?? String(res.status))}`); return; }
      }
      setSecrets({ channel_secret: "", access_token: "" });
      setMsg(patch || botChanged || secrets.channel_secret || secrets.access_token ? "LINE の設定を保存しました" : "変更がありません");
      await load("config");
      if (auto) await richMenu("ensure"); // ★相談役 ⑤: 失敗しても設定の保存は済んでいる（理由は別の行）
    } finally { setBusy(false); }
  }
  async function saveLimit(n: number) {
    setMsgAt("limit");
    const v = lineLimitErrorOf(n); if (v) { setErr(v); return; }
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await supabase.rpc("set_store_line_limit", { p_store_id: storeId, p_limit: n });
    setBusy(false);
    if (error) { setErr(rpcErrJa(error.message)); return; }
    setMsg(`月の上限を ${lineLimitLabelOf(n)} にしました`); await load("limit");
  }
  async function saveNotify() { // ★0199（M-114・裁定459）: set_store_profile に {line_notify: 4 鍵を常に明示}（原則7）＝RPC が object／boolean／鍵名を検査（'bad line_notify'）
    if (!notifyEditable || !storeId) return;
    setMsgAt("notify");
    setBusy(true); setErr(null); setMsg(null);
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: lineNotifyPatchOf(notify) });
    setBusy(false);
    if (error) { setErr(errJa(error.message)); return; }
    setMsg(LINE_NOTIFY_SAVED_MSG); await load("notify");
  }
  const jm = jstMonthOf(Date.now());
  const st = month ? lineStatusOf(month.sent, month.monthly_limit, lineForecastOf(month.sent, jm.dayOfMonth, jm.daysInMonth), jm.dayOfMonth) : null;
  const row: React.CSSProperties = { display: "grid", gap: 4 };
  const notifyDirty = LINE_NOTIFY_KINDS.some((k) => notify[k] !== savedNotify[k]); // ★相談役 ③: 通知の種類に保存していない変更がある
  const outAt = (w: MsgAt) => (msgAt === w && (err || msg) ? <div data-line-msg-at={w} style={{ marginTop: 6 }}>{err && <Message kind="error">{err}</Message>}{msg && <Toast msg={msg} />}</div> : null); // ★相談役 ③: 押したボタンの近くに

  return (
    <section className="nox-panel" data-line-config-panel="1" data-line-configured={lineConfiguredOf(cfg) ? "1" : "0"}>
      <h3>LINE 連携</h3>
      {isOwner && stores.length > 1 && (
        <label style={{ ...row, maxWidth: 320, marginBottom: 10 }}><span style={t.fieldLabel}>店舗</span>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={t.input}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
      )}
      <details className="nox-settings-fold" style={{ marginBottom: 12 }} data-settings-fold="line-urls"><summary>詳しい設定（LINE Developers に貼る URL）</summary>{/* ★2026-11-16（C）: 特殊な設定は畳む */}
      <div className="nox-inset" style={{ padding: "10px 12px", marginTop: 8, display: "grid", gap: 6 }} data-line-urls="1">
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--champ)" }}>LINE Developers に貼る URL（店ごとにチャネルを 2 つ＝Messaging API と LINE ログイン）</p>
        <LineUrls origin={origin} storeId={storeId} />{/* ★2026-11-22（相談役 17:50 の 2-a）: 運営の代行と同じ部品（どこに貼るかを 1 行ずつ） */}
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--sub)" }}>状態: {lineLoginReadyOf(cfg) ? "ログイン可（チャネル ID・LIFF ID あり）" : "ログイン未設定"}・{lineConfiguredOf(cfg) ? "通知可（アクセストークンあり）" : "通知未設定（アクセストークンなし）"}</p>
      </div>
      </details>
      <div style={{ display: "grid", gap: 10, maxWidth: 560 }} data-line-form="1">
        {LINE_CONFIG_KEYS.map((k) => (
          <label key={k} style={row}><span style={t.fieldLabel}>{LINE_CONFIG_LABEL[k]}</span>
            <input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={t.input} maxLength={100} placeholder={k === "bot_destination" ? "U で始まる 33 文字（任意）" : ""} data-line-field={k} />
          </label>
        ))}
        {extraOn && (/* ★2026-11-18 夜（相談役 ⑤）: 公式アカウントの ID＝入れると友だち追加が必須（set_store_line_extra） */
          <label style={row}><span style={t.fieldLabel}>公式アカウントの ID（任意）<InfoTip>{BOT_BASIC_ID_NOTE}</InfoTip></span>
            <input value={botId} onChange={(e) => setBotId(e.target.value)} style={t.input} maxLength={41} placeholder="@ で始まる ID（例 @123abcde）" data-line-field="bot_basic_id" />
          </label>
        )}
        {LINE_SECRET_KINDS.map((k) => (
          <label key={k} style={row}><span style={t.fieldLabel}>{LINE_SECRET_LABEL[k]}{cfg?.[k === "channel_secret" ? "channel_secret_ref" : "access_token_ref"] ? "（設定済み）" : "（未設定）"}</span>
            <input type="password" value={secrets[k]} onChange={(e) => setSecrets((s) => ({ ...s, [k]: e.target.value }))} style={t.input} placeholder={LINE_SECRET_PLACEHOLDER} autoComplete="off" data-line-secret={k} />
          </label>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>{/* ★便 BTN: 保存はフォームの列（最大 560px）の外＝カードの中央 */}
        {isDemo ? <p style={{ ...t.sub, margin: 0 }}>デモ環境では LINE の設定を変更できません。</p>
          : <div className="nox-actions nox-settings-save" data-settings-save="1">{/* ★便 BTN（裁定242）: 主ボタンは行の中央 */}<button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !storeId} onClick={() => void saveConfig()} data-line-save="1">{busy ? "保存中…" : "LINE の設定を保存"}</button></div>}
        {outAt("config")}
      </div>
      {extraOn && (/* ★2026-11-18 夜（相談役 ⑤）: リッチメニュー＝保存（LIFF ID かトークンを入れたとき）で自動に登録（友だち全員）・作り直す・外す */
        <div style={{ marginTop: 16, display: "grid", gap: 6 }} data-line-richmenu={richMenuStateOf(cfg)}>
          <span style={t.fieldLabel}>リッチメニュー：{RICHMENU_STATE_JA[richMenuStateOf(cfg)]}<InfoTip>LINE のトーク画面の下に「ホーム／シフト／お知らせ」のボタンを出します。LINE の設定を保存したとき（LIFF ID かアクセストークンを入れたとき）に自動で登録します。</InfoTip></span>
          {isDemo ? <p style={{ ...t.sub, margin: 0 }} data-demo-reason="line-richmenu">デモ環境ではリッチメニューを登録できません（本番の店で使えます）。</p> : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || !storeId} onClick={() => { setBusy(true); void richMenu("rebuild").finally(() => setBusy(false)); }} data-line-richmenu-rebuild="1">作り直す</button>
              <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || !storeId || richMenuStateOf(cfg) === "off"} onClick={() => { setBusy(true); void richMenu("remove").finally(() => setBusy(false)); }} data-line-richmenu-remove="1">外す</button>
            </div>
          )}
          {rmMsg && <Message kind={rmMsg.ok ? "info" : "error"}>{rmMsg.text}</Message>}
        </div>
      )}
      {/* ★M-114（裁定459・2026-11-06）: 通知の種類ごと ON／OFF＝既定はお知らせだけ ON・シフト系は OFF。★0199（2026-11-10）: 保存＝settings_json.line_notify（白名単）＝管理者だけ・4 鍵を常に明示 */}
      <div style={{ marginTop: 16, display: "grid", gap: 6 }} data-line-notify-kinds="1" data-line-notify-editable={notifyEditable ? "1" : "0"}>
        <span style={t.fieldLabel}>LINE で送る通知の種類<InfoTip>{LINE_NOTIFY_COUNT_NOTE}</InfoTip></span>
        <div style={{ display: "grid", gap: 4 }}>
          {LINE_NOTIFY_KINDS.map((k) => (
            <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, minHeight: 32 }} data-line-notify-kind={k} data-line-notify-on={notify[k] ? "1" : "0"}>
              <input type="checkbox" checked={notify[k]} disabled={!notifyEditable || busy} onChange={(e) => setNotify((n) => ({ ...n, [k]: e.target.checked }))} aria-label={LINE_NOTIFY_LABEL[k]} />{LINE_NOTIFY_LABEL[k]}{LINE_NOTIFY_DEFAULT[k] ? "（既定 ON）" : "（既定 OFF）"}
            </label>
          ))}
        </div>
        {notifyEditable
          ? <div className="nox-actions nox-settings-save" data-settings-save="1">{/* ★便 BTN（裁定242）: 主ボタンは行の中央 */}<button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !storeId} onClick={() => void saveNotify()} data-line-notify-save="1">{busy ? "保存中…" : "通知の種類を保存"}</button>{notifyDirty && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--warning)", alignSelf: "center" }} role="status" data-line-notify-unsaved="1">まだ保存していません</span>}</div>
          : <p style={{ ...t.sub, margin: 0, color: "var(--v2-muted)" }}>{isDemo ? "デモ環境では LINE の設定を変更できません。" : !mig0199On() ? LINE_NOTIFY_SAVE_PENDING_NOTE : LINE_NOTIFY_OWNER_NOTE}</p>}
        {outAt("notify")}
      </div>
      <div style={{ marginTop: 16, display: "grid", gap: 6 }} data-line-limit={limit}>
        <span style={t.fieldLabel}>月の送信上限（表示のための設定）<InfoTip>{LINE_PLAN_TIERS.map(lineLimitLabelOf).join("・")}。{LINE_LIMIT_NOTE}</InfoTip></span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || isDemo} onClick={() => void saveLimit(lineLimitStepOf(limit, -1))} aria-label="1 段下げる">−</button>
          <b className="num">{lineLimitLabelOf(limit)}</b>
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || isDemo} onClick={() => void saveLimit(lineLimitStepOf(limit, 1))} aria-label="1 段上げる">＋</button>
          <input inputMode="numeric" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} style={{ ...t.input, width: 110 }} aria-label="任意の上限" />
          {isDemo && <span style={{ fontSize: 11.5, color: "var(--sub)" }} data-demo-reason="line-limit">デモでは上限を変えられません（本番の店で使えます）</span>}{/* ★M-139: デモで使えない操作は近くに理由 */}
          {!isDemo && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} onClick={() => void saveLimit(Number(limitInput))}>この数にする</button>}
        </div>
        {outAt("limit")}
      </div>
      <div style={{ marginTop: 16 }} data-line-month={month ? st ?? "normal" : "none"}>
        <span style={t.fieldLabel}>今月の送信数（JST の暦月・sent の宛先数の合計）</span>
        {month ? (<>
          <p className="num" style={{ margin: "4px 0 0", fontSize: 13 }}>{lineMonthLineOf(month, jm.dayOfMonth, jm.daysInMonth)}</p>
          {st && st !== "normal" && <Message kind={st === "over" ? "error" : "warn"}>{lineStatusTextOf(st, month.monthly_limit, month.rejected_429)}</Message>}
          {st === "normal" && month.rejected_429 > 0 && <Message kind="warn">{lineStatusTextOf(st, month.monthly_limit, month.rejected_429)}</Message>}
        </>) : <p style={{ ...t.sub, margin: "4px 0 0" }}>まだ送信はありません。</p>}
      </div>
    </section>
  );
}
