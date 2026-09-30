"use client";

// ★裁定326-1／326-8（0160・便 M1-2・2026-09-30）: 店舗設定「キャスト画面の設定」＝mine_settings 7 キー（contract_ack は料金マスタ側＝M4・ここでは触らない）。
//   owner／manager 自店（RPC set_store_mine_settings と同じ判定・表示ゲートは二重防御の外側）。読みは stores.settings_json の直読（RLS 越し）→ mineSettingsOf。
//   保存＝差分キーだけを patch（mineSettingsPatchOf）→ set_store_mine_settings(p_store_id, p_settings) → 再読取。エラーは mineSettingsErrJa。
//   選択肢はセグメント（教訓27＝7 以下はボタン群）。ranking OFF のとき「他キャスト表示」は不活性（326-1: ranking 'on' のときのみ有効）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import SegSelect from "@/components/ui/seg-select";
import { MINE_SETTINGS_DEFAULT, MINE_SETTING_LABEL, PAYSLIP_VISIBILITY_LABEL, SHIFT_REQUEST_MODE_LABEL, mineSettingsErrJa, mineSettingsOf, mineSettingsPatchOf, type MineSettings, type PayslipVisibility, type ShiftRequestMode } from "@/lib/nox/store/mine-settings";

type Store = { id: string; name: string };
type OnOffKey = "drink_claim" | "punch_correction_request" | "ranking" | "ranking_show_others" | "reservation_request";
const ON_OFF: ReadonlyArray<readonly [string, string]> = [["off", "OFF"], ["on", "ON"]];
const DESC: Record<OnOffKey, string> = {
  drink_claim: "ON にすると、キャストのマイページに自己申告ドリンクのカードが出ます（承認後に給与へ合算）",
  punch_correction_request: "ON にすると、キャスト本人が出退勤の修正を申請できます（店の承認後に反映）",
  ranking: "ON にすると、マイページのナビにランキングが出ます（OFF の店は直 URL もマイページへ戻します）",
  ranking_show_others: "ON にすると、ランキングに他キャストの名前と件数を出します（ランキング ON のときだけ有効）",
  reservation_request: "ON にすると、キャストが担当客の指名予約・同伴予約を申請できます（店の承認で予約になります）",
};
const secTitle: React.CSSProperties = t.cardTitle;
const input: React.CSSProperties = { ...t.input, width: "100%", padding: "8px 10px", fontSize: 13 };
const rowLabel: React.CSSProperties = { fontSize: 13, fontWeight: 800 };
const rowDesc: React.CSSProperties = { fontSize: 11.5, color: "var(--sub)", margin: "2px 0 0", lineHeight: 1.6 };

export default function MineSettingsPanel({ stores }: { stores: Store[] }) {
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [cur, setCur] = useState<MineSettings>(MINE_SETTINGS_DEFAULT);
  const [form, setForm] = useState<MineSettings>(MINE_SETTINGS_DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeSel) return;
    const supabase = createClient();
    const { data, error } = await supabase.from("stores").select("settings_json").eq("id", storeSel).single();
    if (error) { setMsg(`読み込みに失敗: ${mineSettingsErrJa(error.message)}`); return; }
    const ms = mineSettingsOf(data?.settings_json);
    setCur(ms); setForm(ms); setLoaded(true);
  }, [storeSel]);
  useEffect(() => { void load(); }, [load]);

  const patch = mineSettingsPatchOf(cur, form);
  const dirty = Object.keys(patch).length > 0;

  async function save() {
    if (!dirty) { setMsg("変更がありません"); return; }
    setBusy(true); setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_store_mine_settings", { p_store_id: storeSel, p_settings: patch });
    setBusy(false);
    if (error) { setMsg(`保存に失敗: ${mineSettingsErrJa(error.message)}`); return; }
    setMsg("キャスト画面の設定を保存しました");
    await load();
  }

  const onOffRow = (k: OnOffKey, disabled = false) => (
    <div key={k} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderTop: "1px solid var(--line2)", padding: "8px 0" }}>
      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
        <div style={rowLabel}>{MINE_SETTING_LABEL[k]}</div>
        <p style={rowDesc}>{DESC[k]}</p>
      </div>
      <SegSelect value={form[k] ? "on" : "off"} onChange={(v) => setForm((f) => ({ ...f, [k]: v === "on" }))} options={ON_OFF} disabled={busy || !loaded || disabled} ariaLabel={MINE_SETTING_LABEL[k]} />
    </div>
  );

  return (
    <section className="nox-cardtop" style={t.card} aria-label="キャスト画面の設定">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <h2 style={{ ...secTitle, margin: 0 }}>キャスト画面の設定</h2>
          <p style={{ ...t.sub, fontSize: 12, margin: "4px 0 0" }}>キャストのマイページに何を出すか（給与明細・ドリンク申告・修正申請・ランキング・予約申請・シフト希望）の店設定です。変更した項目だけを保存します（オーナー／店長）。</p>
        </div>
        {stores.length > 1 && (
          <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={{ ...input, width: "auto" }} aria-label="店舗（キャスト画面の設定）">
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", padding: "8px 0" }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <div style={rowLabel}>{MINE_SETTING_LABEL.payslip_visibility}</div>
          <p style={rowDesc}>キャスト本人に確定給与明細をどこまで出すか。「手取りと期のみ」は金額の内訳を出しません</p>
        </div>
        <SegSelect value={form.payslip_visibility} onChange={(v) => setForm((f) => ({ ...f, payslip_visibility: v as PayslipVisibility }))}
          options={(["off", "net_only", "detail"] as const).map((v) => [v, PAYSLIP_VISIBILITY_LABEL[v]] as const)} disabled={busy || !loaded} ariaLabel={MINE_SETTING_LABEL.payslip_visibility} />
      </div>
      {onOffRow("drink_claim")}
      {onOffRow("punch_correction_request")}
      {onOffRow("ranking")}
      {onOffRow("ranking_show_others", !form.ranking)}
      {onOffRow("reservation_request")}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderTop: "1px solid var(--line2)", padding: "8px 0" }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <div style={rowLabel}>{MINE_SETTING_LABEL.shift_request_mode}</div>
          <p style={rowDesc}>「シフト希望」は出たい日と時間を提出。「休み希望のみ」は休みたい日だけ提出し、提出のない日は出勤できる日として扱います</p>
        </div>
        <SegSelect value={form.shift_request_mode} onChange={(v) => setForm((f) => ({ ...f, shift_request_mode: v as ShiftRequestMode }))}
          options={(["shift", "off_only"] as const).map((v) => [v, SHIFT_REQUEST_MODE_LABEL[v]] as const)} disabled={busy || !loaded} ariaLabel={MINE_SETTING_LABEL.shift_request_mode} />
      </div>
      {msg && <Toast msg={msg} style={{ margin: "10px 0 0" }} />}
      <div className="nox-actions" style={{ marginTop: 12 }}>
        <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy || !dirty} onClick={() => { setForm(cur); setMsg(null); }}>元に戻す</button>
        <button type="button" style={{ ...t.btnGold, ...t.btnSm }} disabled={busy || !dirty || !loaded} onClick={() => void save()}>キャスト画面の設定を保存</button>
      </div>
    </section>
  );
}
