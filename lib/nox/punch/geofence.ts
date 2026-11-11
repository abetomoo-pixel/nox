// ★0201（裁定474・2026-11-10）: 本人のスマホ打刻の場所の判定（純関数・DB を知らない）＝BANZEN（../makanai-shift）lib/geofence.ts・lib/punch-rules.ts の翻訳。
//   route /api/punch/self がこれで判定し、結果（p_geo）を punch_self_impl（service_role）へ渡す。RPC は同じ決まりで再判定する（試走で lib と RPC の結果を突き合わせる＝docs/tmp/try_0201.mjs）。
//   相談役 11/10 の作り直し②＝ハードで「判定できない」（位置情報の許可拒否・取得失敗・精度不足）は範囲外と同じ（理由を書けば通して geo_override・理由なしは geofence_unavailable）。
//     ただし判定方法が Wi-Fi（IP）だけの店は IP の判定がそのまま判定（IP は route がサーバーで取る）。どちらか（either）は BANZEN の decidePunch と同じ決まり（精度不足は判定保留で通す）。
//     両方（both）は裁定474 追補（2026-11-11 Agoora 確定）で BANZEN と違える＝IP が店のものでなければ、位置の精度不足でも止める（保留は位置の側だけ）。
//   ⚠ 位置は端末の申告＝抑止と記録（施錠ではない）。厳格にしたい店は IP を含む方法を勧める。
export type RestrictMode = "gps" | "ip" | "either" | "both" | "tablet";
export type StoreGeo = { lat: number | null; lng: number | null; radius: number | null; allowIp: readonly string[] };
export type ClientGeo = { lat: number | null; lng: number | null; ip: string | null; accuracy: number | null };
export const ACCURACY_TOLERANCE_MAX_M = 200; // 誤差がこれを超える測位は「位置が分からない」と同じ（BANZEN 0165）
export const TERMINAL_ONLY_MESSAGE = "この店は店の端末で打刻します";

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000; const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** route が RPC へ渡す判定（p_geo のキーと同じ名前） */
export type GeoResult = {
  within: boolean;
  evaluable: boolean;       // 店の範囲が決まっているか（gps＝位置と半径・ip＝IP 登録・both＝両方・either＝どちらか）＝false はハードでも素通し（BANZEN と同じ）
  located: boolean;         // 位置が取れたか（緯度経度あり ∧ 誤差 ≤ 200m）＝gps の店のハードで false は「判定できない」
  accuracy_pending: boolean;// 誤差が 200m 超（判定保留）
  terminal_only: boolean;   // 店の端末のみの店で本人のスマホから
  distance_m: number | null;
  gps_ok: boolean;
  ip_ok: boolean;
  ip: string | null;
  accuracy_m: number | null;
  reason: string;
};

export function evaluateGeofence(mode: RestrictMode, store: StoreGeo, client: ClientGeo): GeoResult {
  const gpsDefined = store.lat != null && store.lng != null && store.radius != null && store.radius > 0;
  const ipDefined = store.allowIp.length > 0;
  const evaluable = mode === "gps" ? gpsDefined : mode === "ip" ? ipDefined : mode === "both" ? gpsDefined && ipDefined : mode === "either" ? gpsDefined || ipDefined : false;
  const accuracyM = typeof client.accuracy === "number" && Number.isFinite(client.accuracy) && client.accuracy >= 0 ? client.accuracy : null;
  const ipOk = !!client.ip && store.allowIp.includes(client.ip);
  if (mode === "tablet") return { within: false, evaluable: false, located: false, accuracy_pending: false, terminal_only: true, distance_m: null, gps_ok: false, ip_ok: ipOk, ip: client.ip, accuracy_m: accuracyM, reason: `店の端末以外からの打刻（${TERMINAL_ONLY_MESSAGE}）` };
  let distanceM: number | null = null, gpsOk = false, pending = false;
  const hasPos = client.lat != null && client.lng != null;
  if (gpsDefined && hasPos) {
    distanceM = Math.round(haversineMeters(store.lat as number, store.lng as number, client.lat as number, client.lng as number));
    if (accuracyM != null && accuracyM > ACCURACY_TOLERANCE_MAX_M) pending = true;
    else gpsOk = distanceM - (accuracyM ?? 0) <= (store.radius as number);
  }
  const located = hasPos && !pending;
  const within = mode === "gps" ? gpsOk : mode === "ip" ? ipOk : mode === "both" ? gpsOk && ipOk : gpsOk || ipOk;
  const gpsPart = gpsOk ? `位置は範囲内${distanceM != null ? `（約${distanceM}m）` : ""}` : pending ? `位置を確認中（測位精度 ±${Math.round(accuracyM ?? 0)}m）` : distanceM != null ? `位置が範囲外（店舗から約${distanceM}m）` : "位置を取得できません";
  const ipPart = ipOk ? "Wi-Fi は店舗のネットワーク内" : client.ip ? "Wi-Fi が店舗のネットワーク外" : "Wi-Fi 未接続";
  const reason = mode === "ip" ? ipPart : mode === "gps" ? gpsPart : `${gpsPart}／${ipPart}`;
  return { within, evaluable, located, accuracy_pending: pending, terminal_only: false, distance_m: distanceM, gps_ok: gpsOk, ip_ok: ipOk, ip: client.ip, accuracy_m: accuracyM, reason };
}

/** 判定の結果＝ok（通す）／override（理由を書いたので通す＝geo_override）／blocked（code の理由で断る）。RPC punch_self_impl と同じ決まり */
export type PunchDecision = { kind: "ok" | "override" | "blocked"; code: null | "terminal_only" | "geofence_blocked" | "geofence_unavailable"; overridable: boolean };
export function decidePunch(enforce: boolean, mode: RestrictMode, geo: GeoResult, overrideReason: string | null): PunchDecision {
  const hasReason = !!overrideReason && overrideReason.trim() !== "";
  const ok: PunchDecision = { kind: "ok", code: null, overridable: false };
  if (!enforce) return ok;                                                                // ソフト＝記録だけ残して通す
  if (geo.terminal_only) return { kind: "blocked", code: "terminal_only", overridable: false }; // 理由でも通さない
  if (!geo.evaluable) return ok;                                                          // 店の範囲が未設定＝素通し（BANZEN と同じ）
  const out = (code: "geofence_blocked" | "geofence_unavailable"): PunchDecision => (hasReason ? { kind: "override", code: null, overridable: true } : { kind: "blocked", code, overridable: true });
  if (mode === "gps") {                                                                   // ★相談役 11/10: 判定できない＝範囲外と同じ
    if (!geo.located) return out("geofence_unavailable");
    return geo.within ? ok : out("geofence_blocked");
  }
  if (mode === "ip") return geo.within ? ok : out("geofence_blocked");                   // IP は route がサーバーで取る＝常に判定できる
  if (mode === "both") return geo.ip_ok && (geo.gps_ok || geo.accuracy_pending) ? ok : out("geofence_blocked"); // ★裁定474 追補（2026-11-11 Agoora 確定・BANZEN と違える）: 両方＝IP は常に必須・精度不足の保留は位置の側だけ
  if (geo.within || geo.accuracy_pending) return ok;                                      // either＝BANZEN の decidePunch（精度不足は判定保留で通す）
  return out("geofence_blocked");
}
/** 予定外の打刻（出勤だけ）＝off は未判定（null）・warn は記録・block は確定シフトなしを断る */
export type ShiftMode = "off" | "warn" | "block";
export function decideShiftGate(mode: ShiftMode, type: "in" | "out", hasShift: boolean): { blocked: boolean; within_schedule: boolean | null } {
  if (mode === "off" || type !== "in") return { blocked: false, within_schedule: null };
  if (mode === "warn") return { blocked: false, within_schedule: hasShift };
  return { blocked: !hasShift, within_schedule: hasShift };
}
/** route の IP＝x-forwarded-for の先頭（サーバーで取る＝client の申告にしない） */
export const clientIpOf = (xff: string | null | undefined): string | null => { const v = (xff ?? "").split(",")[0]?.trim(); return v ? v : null; };
