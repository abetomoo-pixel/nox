"use client";
// ★導入の代行 版 2（2026-11-21 夜・枝 night1121-ops-v2・旗 MIG_0202B_APPLIED の後ろ）: 1 歩ずつ＝① 初期設定の下書き ② LINE 連携（4 段） ③ キャストの仮の登録。ボタンは中央。
//   書けるのは導入中か、オーナーのサポート許可の間だけ（書けないときは理由を 1 行・欄は押せない）。シークレットとトークンは入れた後に画面へ出さない（「入力済み」とだけ・入れた欄は空に戻す）。
//   下書きは読んだときの updated_at を添えて送る＝オーナーが後から保存していたら 'stale'（読み直してから）。今ある下書きの中身（S）を土台にして、お店の欄だけ変える。
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast";
import TimeInput from "@/components/ui/time-input"; // 時刻の欄は共通の部品（M-51）
import { fmtJst } from "@/lib/nox/ops/labels";
import { assistedMarksOf, assistGateOf, lineStepsOf, linePublicErrOf, LINE_VERIFY_READY, BOT_BASIC_ID_WHERE, opsGateErrJa, verifiedAtJa } from "@/lib/nox/ops/assist";
import LineUrls from "@/components/nox/line-urls"; // ★2026-11-22（相談役 17:50 の 2-a）: 店の側の「詳しい設定」と同じ部品
import { siteOriginOf } from "@/lib/nox/line/liff-endpoint";
import { applyType, v5DefaultState, V5_TYPES, type V5State, type V5Type } from "@/lib/nox/setup/v5";

export type AssistProps = {
  orgId: string; orgName: string; onboardingState: string; isDemo: boolean; supportUntil: string | null;
  storeId: string; storeName: string; bizType: string | null; setupDone: boolean;
  draft: { updatedAt: string; assisted: unknown; data: unknown } | null;
  line: { login_channel_id: boolean; liff_id: boolean; bot_basic_id: boolean; channel_secret_ref: boolean; access_token_ref: boolean; line_verified_at: string | null };
  provisionals: { id: string; name: string; created_who: string | null; created_at: string; promoted_at: string | null; discarded_at: string | null }[];
  nowIso: string;
  /** 検査（verify:nox-assist-contrast）が各歩を静的に描くための口。画面（page.tsx）は渡さない */ initialStep?: number;
};
const STEPS = ["初期設定の下書き", "LINE 連携", "キャストの仮の登録"] as const;

export default function AssistWizard(p: AssistProps) {
  const router = useRouter();
  const gate = assistGateOf({ onboarding_state: p.onboardingState, is_demo: p.isDemo, support_until: p.supportUntil }, new Date(p.nowIso));
  const [step, setStep] = useState(p.initialStep ?? 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ at: string; ok: boolean; text: string; stale?: boolean } | null>(null);
  const baseS = (): V5State => {
    const d = p.draft?.data as { S?: V5State } | null;
    if (d?.S && typeof d.S === "object" && d.S.shop) return d.S;
    const type = (V5_TYPES.some((x) => x.id === p.bizType) ? p.bizType : "cabaret") as V5Type;
    const s = applyType(v5DefaultState(p.nowIso.slice(0, 10)), type); s.shop.name = p.storeName; return s;
  };
  const s0 = baseS();
  const [shop, setShop] = useState({ name: s0.shop.name || p.storeName, open: s0.shop.open, close: s0.shop.close });
  const [pub, setPub] = useState({ login_channel_id: "", liff_id: "", bot_basic_id: "" });
  const [secret, setSecret] = useState(""); const [token, setToken] = useState("");
  const [castName, setCastName] = useState("");
  const marks = assistedMarksOf(p.draft?.assisted);
  const lsteps = lineStepsOf(p.line);
  const dis = !gate.ok || !!busy;

  async function post(at: string, body: Record<string, unknown>, okText: string | ((j: { verified_at?: string | null }) => string), after?: () => void) {
    setBusy(at); setOut(null);
    const r = await fetch(`/api/ops/orgs/${p.orgId}/assist`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; stale?: boolean; reasons?: string[]; verified_at?: string | null };
    setBusy(null);
    if (!r.ok) { setOut({ at, ok: false, text: opsGateErrJa(j.error) ?? j.error ?? (j.reasons?.length ? `確かめが通りませんでした：${j.reasons.join("・")}` : "保存できませんでした"), stale: j.stale }); return; }
    setOut({ at, ok: true, text: typeof okText === "function" ? okText(j) : okText }); after?.(); router.refresh();
  }
  const msgAt = (at: string) => out && out.at === at && (
    <div data-assist-msg={at} style={{ marginTop: 8 }}>
      <Message kind={out.ok ? "success" : "error"}>{out.text}</Message>
      {out.stale && <div className="nox-actions" style={{ marginTop: 8 }}><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={() => { setOut(null); router.refresh(); }}>読み直す</button></div>}
    </div>);
  const card: React.CSSProperties = { ...t.card, marginBottom: 12 };
  const h2: React.CSSProperties = { ...t.cardTitle, margin: "0 0 8px" };
  const lbl = (s: string) => <span style={t.fieldLabel}>{s}</span>;

  function saveDraft() {
    const S = baseS(); S.shop = { ...S.shop, name: shop.name.trim(), open: shop.open, close: shop.close };
    void post("draft", { action: "draft", step: 1, data: { S, savedAt: new Date().toISOString(), ids: (p.draft?.data as { ids?: unknown } | null)?.ids ?? null, issued: (p.draft?.data as { issued?: unknown } | null)?.issued ?? null }, expected_at: p.draft?.updatedAt ?? null }, "下書きに入れました（オーナーが確定するまで店には効きません）");
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }} data-ops-assist={p.orgId}>
      <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>導入を代行する</h1>
      <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 12px" }}>{p.orgName}・{p.storeName}・<Link href={`/ops/orgs/${p.orgId}`} className="nox-link">詳細に戻る</Link></p>
      {!gate.ok && <div data-assist-gate="1" style={{ marginBottom: 12 }}><Message kind="warn">{gate.reason}</Message></div>}
      {gate.ok && p.onboardingState === "done" && p.supportUntil && <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 12px" }} data-assist-support="1">サポート許可の間（{fmtJst(p.supportUntil)} まで）</p>}
      <ol style={{ display: "flex", gap: 6, listStyle: "none", padding: 0, margin: "0 0 12px", flexWrap: "wrap" }} aria-label="代行の手順">
        {STEPS.map((n, i) => (
          <li key={n}><button type="button" aria-current={step === i ? "step" : undefined} onClick={() => setStep(i)} data-assist-step={i}
            style={{ ...t.btnGhost, ...t.btnSm, ...(step === i ? { background: "var(--primary-soft)", fontWeight: 800 } : {}) }}>{i + 1} {n}</button></li>))}
      </ol>

      {step === 0 && (
        <section style={card} aria-label="初期設定の下書き">
          <h2 style={h2}>① 初期設定の下書き</h2>
          {p.setupDone ? <p style={{ margin: 0, fontSize: 13 }}>初期設定は確定済みです。店の設定は店の画面で直します。</p> : (<>
            <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.7 }}>下書きに入れるだけです。オーナーが /setup で見直して「この内容で始める」を押すまで、店には効きません。業態はお申し込みのときの値（{V5_TYPES.find((x) => x.id === p.bizType)?.name ?? "未設定"}）です。</p>
            {marks.length > 0 && <p style={{ ...t.sub, fontSize: 12, margin: "0 0 10px" }} data-assist-marks="1">これまでの代行：{marks.map((m) => `STEP ${m.step}（${m.who}・${fmtJst(m.at)}）`).join("・")}</p>}
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>{lbl("店名")}<input value={shop.name} maxLength={60} onChange={(e) => setShop({ ...shop, name: e.target.value })} style={t.input} disabled={dis} /></label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 4 }}>{lbl("開店")}<TimeInput value={shop.open} onChange={(v) => setShop({ ...shop, open: v })} disabled={dis} ariaLabel="開店" /></label>
                <label style={{ display: "grid", gap: 4 }}>{lbl("閉店")}<TimeInput value={shop.close} onChange={(v) => setShop({ ...shop, close: v })} after={shop.open} disabled={dis} ariaLabel="閉店" /></label>
              </div>
            </div>
            <div className="nox-actions" style={{ marginTop: 12 }}><button type="button" style={t.btnGold} disabled={dis || !shop.name.trim()} onClick={saveDraft}>{busy === "draft" ? "保存中…" : "下書きに入れる"}</button></div>
            {msgAt("draft")}
          </>)}
        </section>)}

      {step === 1 && (
        <section style={card} aria-label="LINE 連携">
          <h2 style={h2}>② LINE 連携</h2>
          <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {lsteps.map((x, i) => (
              <li key={x.key} data-line-step={x.key} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13.5 }}>
                <span className={x.done ? "nox-stpill ok" : "nox-stpill"}>{x.note}</span><span style={{ color: "var(--ink)", fontWeight: 700 }}>{i + 1}. {x.name}</span>
              </li>))}
          </ul>
          <div style={{ display: "grid", gap: 10 }}>
            <b style={{ fontSize: 13.5 }}>LINE Developers に貼る URL</b>{/* ★2026-11-22（相談役 17:50 の 2-a）: 店の側の「詳しい設定」と同じ値・同じ部品（運営元だけで連携を終えられるように） */}
            <div className="nox-inset" style={{ padding: "10px 12px", display: "grid", gap: 8 }} data-line-urls="assist"><LineUrls origin={siteOriginOf(typeof window !== "undefined" ? window.location.origin : "")} storeId={p.storeId} /></div>
            <b style={{ fontSize: 13.5 }}>1. 公開の値</b>
            <label style={{ display: "grid", gap: 4 }}>{lbl("ログインのチャネル ID")}<input inputMode="numeric" value={pub.login_channel_id} onChange={(e) => setPub({ ...pub, login_channel_id: e.target.value })} style={t.input} disabled={dis} placeholder={lsteps[0].done ? "入力済み（変えるときだけ入れる）" : ""} /></label>
            <label style={{ display: "grid", gap: 4 }}>{lbl("LIFF ID")}<input value={pub.liff_id} onChange={(e) => setPub({ ...pub, liff_id: e.target.value })} style={t.input} disabled={dis} placeholder={lsteps[0].done ? "入力済み（変えるときだけ入れる）" : ""} /></label>
            <label style={{ display: "grid", gap: 4 }}>{lbl("ボットの ID（@ から）")}<input value={pub.bot_basic_id} onChange={(e) => setPub({ ...pub, bot_basic_id: e.target.value })} style={t.input} disabled={dis} placeholder={lsteps[0].done ? "入力済み（変えるときだけ入れる）" : ""} /><span style={{ ...t.sub, fontSize: 11.5 }} data-bot-id-where="1">{BOT_BASIC_ID_WHERE}</span></label>
            <div className="nox-actions"><button type="button" style={t.btnGold} disabled={dis} onClick={() => { const e = linePublicErrOf(pub); if (e) { setOut({ at: "line", ok: false, text: e }); return; } void post("line", { action: "line", patch: pub }, "公開の値を入れました", () => setPub({ login_channel_id: "", liff_id: "", bot_basic_id: "" })); }}>{busy === "line" ? "保存中…" : "公開の値を保存"}</button></div>
            {msgAt("line")}
            <b style={{ fontSize: 13.5, marginTop: 6 }}>2. チャネルシークレット</b>
            <label style={{ display: "grid", gap: 4 }}>{lbl(lsteps[1].done ? "チャネルシークレット（入力済み・変えるときだけ入れる）" : "チャネルシークレット")}<input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} style={t.input} disabled={dis} /></label>
            <div className="nox-actions"><button type="button" style={t.btnGold} disabled={dis || !secret.trim()} onClick={() => void post("secret", { action: "line_secret", kind: "channel_secret", secret }, "チャネルシークレットを入れました（画面には出しません）", () => setSecret(""))}>{busy === "secret" ? "保存中…" : "シークレットを保存"}</button></div>
            {msgAt("secret")}
            <b style={{ fontSize: 13.5, marginTop: 6 }}>3. アクセストークン</b>
            <label style={{ display: "grid", gap: 4 }}>{lbl(lsteps[2].done ? "アクセストークン（入力済み・変えるときだけ入れる）" : "アクセストークン")}<input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} style={t.input} disabled={dis} /></label>
            <div className="nox-actions"><button type="button" style={t.btnGold} disabled={dis || !token.trim()} onClick={() => void post("token", { action: "line_secret", kind: "access_token", secret: token }, "アクセストークンを入れました（画面には出しません）", () => setToken(""))}>{busy === "token" ? "保存中…" : "トークンを保存"}</button></div>
            {msgAt("token")}
            <b style={{ fontSize: 13.5, marginTop: 6 }}>4. 連携の確かめ</b>
            <p style={{ ...t.sub, fontSize: 12, margin: 0, lineHeight: 1.7 }}>LINE に問い合わせて確かめます（ボットの ID が保存した値と同じ・Webhook の登録先が NOX・テストが通る）。</p>
            <div className="nox-actions"><button type="button" style={t.btnGhost} disabled={dis || !LINE_VERIFY_READY} onClick={() => void post("verify", { action: "line_verify" }, (j) => (j.verified_at ? `連携を確かめました（${verifiedAtJa(j.verified_at)}）` : "連携を確かめました"))} data-line-verify-btn={LINE_VERIFY_READY ? "1" : "0"}>{busy === "verify" ? "確かめ中…" : "連携を確かめる"}</button></div>
            {msgAt("verify")}
          </div>
        </section>)}

      {step === 2 && (
        <section style={card} aria-label="キャストの仮の登録">
          <h2 style={h2}>③ キャストの仮の登録</h2>
          <p style={{ ...t.sub, fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.7 }}>源氏名だけを仮に入れます。打刻・レジ・給与には出ません。店が生年月日を入れて「本登録する」と、キャストになります。</p>
          <label style={{ display: "grid", gap: 4 }}>{lbl("源氏名")}<input value={castName} maxLength={40} onChange={(e) => setCastName(e.target.value)} style={t.input} disabled={dis} /></label>
          <div className="nox-actions" style={{ marginTop: 10 }}><button type="button" style={t.btnGold} disabled={dis || !castName.trim()} onClick={() => void post("prov", { action: "provisional_add", name: castName }, "仮の登録に入れました", () => setCastName(""))}>{busy === "prov" ? "保存中…" : "仮の登録に入れる"}</button></div>
          {msgAt("prov")}
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }} data-assist-provisionals={String(p.provisionals.length)}>
            {p.provisionals.length === 0 ? <li style={{ ...t.sub, fontSize: 12.5 }}>まだいません</li> : p.provisionals.map((x) => {
              const st = x.promoted_at ? "本登録済み" : x.discarded_at ? "登録しない" : "仮の登録";
              return (
                <li key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13.5 }}>
                  <span className={x.promoted_at ? "nox-stpill ok" : "nox-stpill"}>{st}</span><b style={{ color: "var(--ink)" }}>{x.name}</b>
                  <span style={{ ...t.sub, fontSize: 12 }}>{x.created_who ?? "運営"}・{fmtJst(x.created_at)}</span>
                  {!x.promoted_at && !x.discarded_at && <button type="button" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto" }} disabled={dis} onClick={() => void post("prov", { action: "provisional_cancel", id: x.id }, "取り下げました")}>取り下げる</button>}
                </li>);
            })}
          </ul>
        </section>)}

      <div className="nox-actions" style={{ marginTop: 4 }}>
        <button type="button" style={t.btnGhost} disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>戻る</button>
        <button type="button" style={t.btnGold} disabled={step === STEPS.length - 1} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>次へ</button>
      </div>
    </div>
  );
}
