"use client";

// ★0201（裁定474・2026-11-11 フラグ便）: 店舗設定 › 利用機能「打刻の設定」＝本人のスマホ打刻の判定（BANZEN と同じ形）。
//   判定（ソフト＝記録して通す／ハード＝止める）・判定方法 5 つ・店の位置と半径・店の Wi-Fi（IP）の登録・予定外の打刻。判定は本人のスマホ打刻だけ（店の端末・代行は今のまま）。
//   保存＝set_store_profile の列側 6 キー（オーナーだけ＝RPC と同じ）・Wi-Fi は route /api/punch/wifi がサーバーで IP を読んで store_wifi_add（オーナー・自店の店長）。
//   ハードは判定方法に必要な値が揃わないと保存できない（相談役 11/11 ■3d＝punchHardMissingOf）。
//   ★店長の打刻の許可（manager_punch_enabled）のスイッチは出さない＝0201c のフラグ便で出す（相談役 11/11 ■3c＝打刻端末の名前一覧が見ない間は OFF にしない）。
//   地図でピンを置く画面は次の段（npm の地図部品の追加は別に相談）＝今は「いまいる場所を使う」と緯度・経度の入力。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import SegSelect from "@/components/ui/seg-select";
import { PUNCH_MODE_LABEL, SHIFT_GATE_LABEL, punchHardMissingOf, punchRulesFormErrOf, punchRulesPatchOf, type PunchRulesForm } from "@/lib/nox/punch/rules-form";
import type { RestrictMode } from "@/lib/nox/punch/geofence";
import { currentPositionOf } from "@/lib/nox/punch/self-client";

type Store = { id: string; name: string };
const EMPTY: PunchRulesForm = { enforce: false, mode: "gps", lat: "", lng: "", radius: "", ipCount: 0, requireShift: "off" };
const rowLabel: React.CSSProperties = { fontSize: 13, fontWeight: 800 };
const rowDesc: React.CSSProperties = { fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 };
const row: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderTop: "1px solid var(--line2)", padding: "8px 0" };
const inp: React.CSSProperties = { ...t.input, width: 130, padding: "8px 10px", fontSize: 13 };
const errJa = (m: string) => (m.includes("billing locked") ? "ご契約の状態により保存できません" : m.includes("forbidden") ? "この設定はオーナーだけが変更できます" : m.includes("bad ip") ? "IP を読み取れませんでした" : m.includes("range required") ? "ハードで位置情報を使うには、店の位置（緯度・経度）と半径が要ります" : m);

export default function PunchRulesPanel({ stores, isOwner = false }: { stores: Store[]; isOwner?: boolean }) {
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [form, setForm] = useState<PunchRulesForm>(EMPTY);
  const [cur, setCur] = useState<PunchRulesForm>(EMPTY);
  const [ips, setIps] = useState<string[]>([]);
  const [myIp, setMyIp] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeSel) return;
    const { data, error } = await createClient().from("stores")
      .select("punch_enforce, punch_restrict_mode, punch_lat, punch_lng, punch_radius_m, punch_allow_ip, punch_require_shift").eq("id", storeSel).single();
    if (error || !data) { setMsg(`読み込みに失敗: ${error?.message ?? ""}`); return; }
    const list = (data.punch_allow_ip as string[] | null) ?? [];
    const f: PunchRulesForm = {
      enforce: data.punch_enforce === true, mode: ((data.punch_restrict_mode as string | null) ?? "gps") as RestrictMode,
      lat: data.punch_lat == null ? "" : String(data.punch_lat), lng: data.punch_lng == null ? "" : String(data.punch_lng),
      radius: data.punch_radius_m == null ? "" : String(data.punch_radius_m), ipCount: list.length,
      requireShift: ((data.punch_require_shift as string | null) ?? "off") as PunchRulesForm["requireShift"],
    };
    setIps(list); setCur(f); setForm(f); setLoaded(true);
  }, [storeSel]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void fetch("/api/punch/wifi").then((r) => r.json()).then((j: { ip?: string | null }) => setMyIp(j.ip ?? null)).catch(() => setMyIp(null)); }, []);

  const f = { ...form, ipCount: ips.length };
  const formErr = punchRulesFormErrOf(f);
  const missing = punchHardMissingOf(f);
  const dirty = JSON.stringify(punchRulesPatchOf(cur)) !== JSON.stringify(punchRulesPatchOf(f));
  const canEdit = isOwner && loaded && !busy;

  async function save() {
    if (formErr || missing) return;
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("set_store_profile", { p_store_id: storeSel, p_patch: punchRulesPatchOf(f) });
    setBusy(false);
    if (error) { setMsg(`保存に失敗: ${errJa(error.message)}`); return; }
    setMsg("打刻の設定を保存しました"); await load();
  }
  async function fillHere() {
    setBusy(true); setMsg(null);
    const p = await currentPositionOf(10000);
    setBusy(false);
    if (!p) { setMsg("位置情報を取得できませんでした（ブラウザの位置情報の許可を確認してください）"); return; }
    setForm((x) => ({ ...x, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6), radius: x.radius || "100" }));
    setMsg(`いまいる場所を入れました（誤差 約 ${Math.round(p.accuracy)}m）。保存すると反映されます`);
  }
  async function addWifi() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/punch/wifi", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ store_id: storeSel }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; ip?: string };
    setBusy(false);
    if (!r.ok) { setMsg(`登録に失敗: ${errJa(j.error ?? String(r.status))}`); return; }
    setMsg(`店の Wi-Fi（${j.ip}）を登録しました`); await load();
  }
  async function removeWifi(ip: string) {
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("store_wifi_remove", { p_store_id: storeSel, p_ip: ip });
    setBusy(false);
    if (error) { setMsg(`削除に失敗: ${errJa(error.message)}`); return; }
    setMsg(`店の Wi-Fi（${ip}）を外しました`); await load();
  }

  const needPos = form.mode === "gps" || form.mode === "both" || form.mode === "either";
  const needIp = form.mode === "ip" || form.mode === "both" || form.mode === "either";
  return (
    <section className="nox-cardtop" style={t.card} aria-label="打刻の設定" data-punch-rules="1">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <h2 style={{ ...t.cardTitle, margin: 0 }}>打刻の設定</h2>
          <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 0" }}>キャスト本人がスマホで押す打刻の判定です。店の端末と代行の打刻は今のままです。{!isOwner && "変更はオーナーだけができます。"}</p>
        </div>
        {stores.length > 1 && (
          <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={{ ...inp, width: "auto" }} aria-label="店舗（打刻の設定）">
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      <div style={row}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}><div style={rowLabel}>判定</div><p style={rowDesc}>ソフト＝条件に合わなくても記録を残して通す（勤怠に印）。ハード＝条件に合わないと打刻できない（理由を書けば通し、記録に残す）</p></div>
        <SegSelect value={form.enforce ? "hard" : "soft"} onChange={(v) => setForm((x) => ({ ...x, enforce: v === "hard" }))} options={[["soft", "ソフト"], ["hard", "ハード"]]} disabled={!canEdit} ariaLabel="判定" />
      </div>
      <div style={row}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}><div style={rowLabel}>判定方法</div><p style={rowDesc}>位置か Wi-Fi＝どちらかが合えば打刻できる・位置と Wi-Fi＝両方が合わないと打刻できない。位置は端末の申告のため抑止と記録の意味が強い方法です。厳しくしたい店は Wi-Fi を含む方法を選んでください</p></div>
        <SegSelect value={form.mode} onChange={(v) => setForm((x) => ({ ...x, mode: v as RestrictMode }))} options={(["gps", "ip", "either", "both", "tablet"] as const).map((v) => [v, PUNCH_MODE_LABEL[v]] as const)} disabled={!canEdit} ariaLabel="判定方法" wrap style={{ flex: "1 1 100%", maxWidth: "100%", minWidth: 0 }} />
      </div>
      {needPos && (
        <div style={row} data-punch-pos="1">
          <div style={{ minWidth: 0, flex: "1 1 240px" }}><div style={rowLabel}>店の位置と半径</div><p style={rowDesc}>店の中で「いまいる場所を使う」を押すと緯度・経度が入ります。半径は 10〜100000 m</p></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input aria-label="緯度" placeholder="緯度" inputMode="decimal" value={form.lat} onChange={(e) => setForm((x) => ({ ...x, lat: e.target.value }))} style={inp} disabled={!canEdit} />
            <input aria-label="経度" placeholder="経度" inputMode="decimal" value={form.lng} onChange={(e) => setForm((x) => ({ ...x, lng: e.target.value }))} style={inp} disabled={!canEdit} />
            <input aria-label="半径（m）" placeholder="半径 m" inputMode="numeric" value={form.radius} onChange={(e) => setForm((x) => ({ ...x, radius: e.target.value }))} style={{ ...inp, width: 100 }} disabled={!canEdit} />
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={!canEdit} onClick={() => void fillHere()}>いまいる場所を使う</button>
          </div>
        </div>
      )}
      {needIp && (
        <div style={row} data-punch-wifi={String(ips.length)}>
          <div style={{ minWidth: 0, flex: "1 1 240px" }}><div style={rowLabel}>店の Wi-Fi</div><p style={rowDesc}>店の Wi-Fi につないだ端末で「いまの Wi-Fi を登録」を押します（IP はサーバーで読み取ります）。いまの IP：<span className="num">{myIp ?? "—"}</span></p></div>
          <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
            {ips.map((ip) => (
              <span key={ip} className="num" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{ip}
                <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || !loaded} onClick={() => void removeWifi(ip)} aria-label={`${ip} を外す`}>外す</button>
              </span>
            ))}
            <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || !loaded || !myIp || ips.includes(myIp)} onClick={() => void addWifi()}>いまの Wi-Fi を登録</button>
          </div>
        </div>
      )}
      <div style={row}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}><div style={rowLabel}>予定外の打刻（出勤）</div><p style={rowDesc}>今日の確定シフトが無いキャストの出勤を、許可（記録しない）／記録して通す（勤怠に印）／禁止（確定シフトが無い日は出勤できない）のどれにするか</p></div>
        <SegSelect value={form.requireShift} onChange={(v) => setForm((x) => ({ ...x, requireShift: v as PunchRulesForm["requireShift"] }))} options={(["off", "warn", "block"] as const).map((v) => [v, SHIFT_GATE_LABEL[v]] as const)} disabled={!canEdit} ariaLabel="予定外の打刻" wrap style={{ flex: "1 1 100%", maxWidth: "100%", minWidth: 0 }} />
      </div>
      {msg && <Toast msg={msg} style={{ margin: "10px 0 0" }} />}
      {isOwner && (
        <div className="nox-actions" style={{ marginTop: 12, alignItems: "center" }}>
          {(formErr || missing) && <span data-punch-save-block="1" style={{ fontSize: 12.5, color: "var(--bad)" }}>{formErr ?? missing}</span>}
          <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || !dirty} onClick={() => { setForm(cur); setMsg(null); }}>元に戻す</button>
          <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={!canEdit || !dirty || !!formErr || !!missing} onClick={() => void save()}>打刻の設定を保存</button>
        </div>
      )}
    </section>
  );
}
