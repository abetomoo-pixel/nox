// ★0201（裁定474・2026-11-11 フラグ便）: 本人のスマホ打刻の client 側＝位置を取って route /api/punch/self に送る（IP は route がサーバーで取る）。
//   判定の和文と「理由を書けば通る」かは route の返り（error）で決める＝decidePunch と同じ決まり。
export type SelfPunchCode = "terminal_only" | "geofence_blocked" | "geofence_unavailable" | "no shift" | "self disabled" | string;
export type SelfPunchResult = { ok: true; punch_id: string | null; override: boolean } | { ok: false; code: SelfPunchCode; reason: string | null };

/** 理由を書けば通る（geo_override）コード＝範囲外・位置が取れない */
export const overridableOf = (code: string): boolean => code === "geofence_blocked" || code === "geofence_unavailable";

export const SELF_PUNCH_ERR_JA: Record<string, string> = {
  terminal_only: "この店は店の端末で打刻します",
  geofence_blocked: "お店の範囲の外にいるため打刻できません。理由を書けば打刻できます",
  geofence_unavailable: "位置情報を確認できないため打刻できません（位置情報の許可を確認してください）。理由を書けば打刻できます",
  "no shift": "今日の確定シフトが無いため出勤を打刻できません（お店に連絡してください）",
  "self disabled": "この店はスマホからの打刻を使っていません",
  "already in": "すでに出勤打刻があります",
  "already out": "本日は退勤済みです",
  "no open punch": "出勤打刻がありません",
  forbidden: "打刻できません（お店に確認してください）",
  unauthenticated: "ログインし直してください",
};
export const selfPunchErrJa = (code: string): string => SELF_PUNCH_ERR_JA[code] ?? `打刻できませんでした（${code}）`;

/** 位置を取る（許可拒否・取得失敗・時間切れは null＝route が「位置が取れない」と判定する） */
export function currentPositionOf(timeoutMs = 8000): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

export async function selfPunch(i: { type: "in" | "out"; okuri: boolean | null; overrideReason: string | null }): Promise<SelfPunchResult> {
  const pos = await currentPositionOf();
  const res = await fetch("/api/punch/self", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: i.type, okuri: i.okuri, override_reason: i.overrideReason, lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracy: pos?.accuracy ?? null }),
  });
  let j: Record<string, unknown> = {};
  try { j = (await res.json()) as Record<string, unknown>; } catch { j = {}; }
  if (res.ok && j.ok !== false) return { ok: true, punch_id: typeof j.punch_id === "string" ? j.punch_id : null, override: j.override === true };
  return { ok: false, code: typeof j.error === "string" ? j.error : `http ${res.status}`, reason: typeof j.reason === "string" ? j.reason : null };
}
