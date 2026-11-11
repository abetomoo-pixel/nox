// ★0201（裁定474・2026-11-11 フラグ便）: 勤怠の印＝本人のスマホ打刻の判定の結果（punches.within_geofence／geo_override／within_schedule）。
//   ソフトの店は記録だけ残して通す＝ここで店に見せる。null は未判定（店の範囲が決まっていない・予定外の判定を使わない店・店の端末や代行の打刻）＝印を出さない。
export type PunchMarkRow = { cast_id: string; within_geofence?: boolean | null; geo_override?: boolean | null; within_schedule?: boolean | null };

export function punchMarksOf(rows: readonly PunchMarkRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.cast_id) ?? [];
    const add = (s: string) => { if (!list.includes(s)) list.push(s); };
    if (r.within_geofence === false) add(r.geo_override ? "範囲外（理由あり）" : "範囲外");
    if (r.within_schedule === false) add("予定外");
    if (list.length > 0) out.set(r.cast_id, list);
  }
  return out;
}
