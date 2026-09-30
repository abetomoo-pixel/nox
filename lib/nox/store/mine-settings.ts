// ★裁定326-1／326-8（0160・便 M1-1・2026-09-30）: 店設定 mine_settings（stores.settings_json の 8 キー）の読取ヘルパー＝純関数（DB を知らない）。
//   DB の表現＝payslip_visibility 'off'|'net_only'|'detail'・on/off 系 5 キーは 'off'|'on' の文字列・shift_request_mode 'shift'|'off_only'・contract_ack boolean（set_store_mine_settings の enum 検証と同じ域）。
//   ここでは on/off を boolean に写す。欠損は 326-1 の既定・型違い（boolean が来た・未知の文字列）は既定に倒す（fail-closed ではなく「既定」＝reservation_request だけ既定 ON）。
//   書込は set_store_mine_settings(p_store_id, p_settings jsonb)＝差分キーだけ（mineSettingsPatchOf）。raise 語の和文＝mineSettingsErrJa（'bad <key>' は key→和名の表で置換）。
import { rpcErrJa } from "../ui/rpc-err";

export type PayslipVisibility = "off" | "net_only" | "detail";
export type ShiftRequestMode = "shift" | "off_only";
export type MineSettings = {
  payslip_visibility: PayslipVisibility;
  drink_claim: boolean;
  punch_correction_request: boolean;
  ranking: boolean;
  ranking_show_others: boolean;
  reservation_request: boolean;
  shift_request_mode: ShiftRequestMode;
  contract_ack: boolean;
};
export type MineSettingKey = keyof MineSettings;

export const MINE_SETTING_KEYS: readonly MineSettingKey[] = ["payslip_visibility", "drink_claim", "punch_correction_request", "ranking", "ranking_show_others", "reservation_request", "shift_request_mode", "contract_ack"];

/** 326-1 の既定（payslip 'off'・on/off 系は reservation_request だけ ON・shift_request_mode 'shift'・contract_ack false） */
export const MINE_SETTINGS_DEFAULT: MineSettings = {
  payslip_visibility: "off", drink_claim: false, punch_correction_request: false, ranking: false, ranking_show_others: false, reservation_request: true, shift_request_mode: "shift", contract_ack: false,
};

/** key → 和名（店舗設定 UI のラベル・'bad <key>' の和文） */
export const MINE_SETTING_LABEL: Record<MineSettingKey, string> = {
  payslip_visibility: "給与明細の表示", drink_claim: "ドリンク申告", punch_correction_request: "打刻の修正申請", ranking: "ランキング",
  ranking_show_others: "ランキングの他キャスト表示", reservation_request: "予約の申請", shift_request_mode: "シフト希望の方式", contract_ack: "加盟店契約の確認",
};
export const PAYSLIP_VISIBILITY_LABEL: Record<PayslipVisibility, string> = { off: "表示しない", net_only: "手取りと期のみ", detail: "明細まで" };
export const SHIFT_REQUEST_MODE_LABEL: Record<ShiftRequestMode, string> = { shift: "シフト希望", off_only: "休み希望のみ" };

const ON_OFF_KEYS: readonly Exclude<MineSettingKey, "payslip_visibility" | "shift_request_mode" | "contract_ack">[] = ["drink_claim", "punch_correction_request", "ranking", "ranking_show_others", "reservation_request"];
const onOff = (v: unknown, d: boolean): boolean => (v === "on" ? true : v === "off" ? false : d);

/** settings_json（unknown）→ MineSettings。欠損・型違い・未知値は既定に倒す（オブジェクトでない入力も既定） */
export function mineSettingsOf(settingsJson: unknown): MineSettings {
  const o = settingsJson && typeof settingsJson === "object" && !Array.isArray(settingsJson) ? (settingsJson as Record<string, unknown>) : {};
  const pv = o.payslip_visibility;
  const sm = o.shift_request_mode;
  const out: MineSettings = { ...MINE_SETTINGS_DEFAULT };
  out.payslip_visibility = pv === "off" || pv === "net_only" || pv === "detail" ? pv : MINE_SETTINGS_DEFAULT.payslip_visibility;
  out.shift_request_mode = sm === "shift" || sm === "off_only" ? sm : MINE_SETTINGS_DEFAULT.shift_request_mode;
  for (const k of ON_OFF_KEYS) out[k] = onOff(o[k], MINE_SETTINGS_DEFAULT[k]);
  out.contract_ack = typeof o.contract_ack === "boolean" ? o.contract_ack : MINE_SETTINGS_DEFAULT.contract_ack;
  return out;
}

/** cur→next の差分キーだけを DB 表現（on/off 文字列・enum 文字列・contract_ack は boolean）にした patch。差分なし＝{} */
export function mineSettingsPatchOf(cur: MineSettings, next: MineSettings): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  if (next.payslip_visibility !== cur.payslip_visibility) out.payslip_visibility = next.payslip_visibility;
  if (next.shift_request_mode !== cur.shift_request_mode) out.shift_request_mode = next.shift_request_mode;
  for (const k of ON_OFF_KEYS) if (next[k] !== cur[k]) out[k] = next[k] ? "on" : "off";
  if (next.contract_ack !== cur.contract_ack) out.contract_ack = next.contract_ack;
  return out;
}

/** set_store_mine_settings の raise 語 → 和文（'bad <key>' は key→和名）。写像に無い語は共通の rpcErrJa へ */
export function mineSettingsErrJa(msg: string | null | undefined): string {
  const m = (msg ?? "").trim();
  if (/^bad key$/.test(m)) return "設定項目が不正です";
  if (/^bad type$/.test(m)) return "設定値の型が不正です";
  if (/^bad patch$/.test(m)) return "設定の更新内容が不正です";
  const bad = /^bad ([a-z_]+)$/.exec(m);
  if (bad && (MINE_SETTING_KEYS as readonly string[]).includes(bad[1])) return `${MINE_SETTING_LABEL[bad[1] as MineSettingKey]}の値が不正です`;
  return rpcErrJa(m);
}
