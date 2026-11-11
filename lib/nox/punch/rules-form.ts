// ★0201（裁定474・2026-11-11 フラグ便）: 店舗設定の打刻設定の節＝純関数（DB を知らない・verify:nox-0201 が組み合わせを確かめる）。
//   ハードは判定方法に必要な値が揃わないと保存できない（相談役 11/11 ■3d）＝位置＝ピンと半径／Wi-Fi＝IP 1 件以上／両方＝両方／どちらか＝どちらか・店の端末のみは値が要らない。
//   DB（set_store_profile）は「ハード ∧ gps／both ∧ 位置か半径が null」を既に拒否（0175）。抜け＝判定方法が null のとき・ip／either／both の IP 未登録＝0201e で足す（相談役 11/11 の訂正）。
import type { RestrictMode } from "./geofence";

export const PUNCH_MODE_LABEL: Record<RestrictMode, string> = {
  gps: "位置情報", ip: "店の Wi-Fi", either: "位置か Wi-Fi", both: "位置と Wi-Fi", tablet: "店の端末のみ", // ★375 で収まる長さ（2026-11-11 撮影で選択がはみ出した）＝意味は判定方法の説明の行
};
export const SHIFT_GATE_LABEL: Record<"off" | "warn" | "block", string> = { off: "許可", warn: "記録して通す", block: "禁止" }; // ★375 で収まる長さ＝意味は説明の行

export type PunchRulesForm = { enforce: boolean; mode: RestrictMode; lat: string; lng: string; radius: string; ipCount: number; requireShift: "off" | "warn" | "block" };

const numOf = (s: string): number | null => { const t = s.trim(); if (t === "") return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

/** 入力の形の誤り（保存しない）＝緯度・経度・半径の範囲（DB の検査と同じ） */
export function punchRulesFormErrOf(f: PunchRulesForm): string | null {
  const lat = numOf(f.lat), lng = numOf(f.lng), r = numOf(f.radius);
  if (Number.isNaN(lat) || (lat !== null && (lat < -90 || lat > 90))) return "緯度は -90〜90 の数で入力してください";
  if (Number.isNaN(lng) || (lng !== null && (lng < -180 || lng > 180))) return "経度は -180〜180 の数で入力してください";
  if (Number.isNaN(r) || (r !== null && (!Number.isInteger(r) || r < 10 || r > 100000))) return "半径は 10〜100000 m の整数で入力してください";
  if ((lat === null) !== (lng === null)) return "緯度と経度は両方入れるか、両方空にしてください";
  return null;
}

/** ハードで判定方法に必要な値が揃っているか＝揃っていなければ理由（保存ボタンの近くに出す）・ソフトは常に null */
export function punchHardMissingOf(f: PunchRulesForm): string | null {
  if (!f.enforce) return null;
  const pos = numOf(f.lat) !== null && numOf(f.lng) !== null && (numOf(f.radius) ?? 0) > 0;
  const ip = f.ipCount > 0;
  switch (f.mode) {
    case "gps": return pos ? null : "ハードにするには、店の位置（緯度・経度）と半径が要ります";
    case "ip": return ip ? null : "ハードにするには、店の Wi-Fi を 1 つ以上登録してください";
    case "both": return pos && ip ? null : "ハードにするには、店の位置と半径・店の Wi-Fi の両方が要ります";
    case "either": return pos || ip ? null : "ハードにするには、店の位置と半径か、店の Wi-Fi のどちらかが要ります";
    default: return null;   // 店の端末のみ＝値は要らない
  }
}

/** set_store_profile の patch（列側 6 キー・空欄は null） */
export function punchRulesPatchOf(f: PunchRulesForm): Record<string, unknown> {
  const n = (s: string) => (s.trim() === "" ? null : Number(s));
  return { punch_enforce: f.enforce, punch_restrict_mode: f.mode, punch_lat: n(f.lat), punch_lng: n(f.lng), punch_radius_m: n(f.radius), punch_require_shift: f.requireShift };
}
