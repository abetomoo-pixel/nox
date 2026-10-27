// ★裁定322（2026-09-29・便 X-11-5）: レジのキャスト選択の共通の並びと表示（純関数・DB を知らない）。
//   ①接客中／場内／着卓中 → ②出勤中（in 打刻あり・out なし） → ③未出勤（シフトあり） → ④未出勤。各群は名前順。
//   ①②は「出勤中」側（バッジ）・③④は「未出勤」側（グレー＋ラベル・既定は折りたたみ「未出勤を表示（n 人）」）。
//   判定の材料（当日の punches・確定シフト・伝票の名簿）は呼び出し側が Set で渡す＝金額には一切関与しない。
//   裁定107（名前順固定）はこの裁定で置き換え＝群の中だけ名前順。
export type CastPickGroup = 1 | 2 | 3 | 4 | 5;
export type CastPickSets = {
  /** この伝票の名簿（着卓中・場内ほか種別バッジのある id を含む） */
  seatedIds?: ReadonlySet<string>;
  /** 他卓の open 伝票の名簿（接客中） */
  servingIds?: ReadonlySet<string>;
  /** 当日の最終打刻が in（in 打刻あり・out なし） */
  punchedInIds?: ReadonlySet<string>;
  /** 当日の確定シフトがある */
  shiftIds?: ReadonlySet<string>;
  /** ★便 M2 M-18: シフトの開始を過ぎても in 打刻が無い（遅刻）＝lateIdsOf */
  lateIds?: ReadonlySet<string>;
  /** ★便 M2 M-18: 当日の最終打刻が out（退勤） */
  outIds?: ReadonlySet<string>;
};
export type OrderedCast<T> = T & { group: CastPickGroup; working: boolean };

// ★便 M2 M-18（Agoora 確定 10/27）: キャストの状態＝5 つ（色と並び順は同じ順）＝待機中（緑）→着卓中（金）→出勤予定（青）→遅刻（赤）→退勤／休み（グレー）。
//   裁定322 の 4 群（①接客中→②出勤中→③未出勤シフトあり→④未出勤）を置き換え＝待機中（in 打刻あり・どの卓にも着いていない）を先頭に。
export type CastStatus = "standby" | "seated" | "planned" | "late" | "off";
export const CAST_STATUS_ORDER: Record<CastStatus, CastPickGroup> = { standby: 1, seated: 2, planned: 3, late: 4, off: 5 };
export const CAST_STATUS_LABEL: Record<CastStatus, string> = { standby: "待機中", seated: "着卓中", planned: "出勤予定", late: "遅刻", off: "休み" };
export const CAST_STATUS_TONE: Record<CastStatus, "ok" | "gold2" | "blue" | "bad" | "muted"> = { standby: "ok", seated: "gold2", planned: "blue", late: "bad", off: "muted" };
export function castStatusOf(id: string, s: CastPickSets): CastStatus {
  if (s.seatedIds?.has(id) || s.servingIds?.has(id)) return "seated";
  if (s.punchedInIds?.has(id)) return "standby";
  if (s.outIds?.has(id)) return "off";
  if (s.lateIds?.has(id)) return "late";
  if (s.shiftIds?.has(id)) return "planned";
  return "off";
}
/** 状態の文字（off は退勤した人＝「退勤」・それ以外＝「休み」） */
export const castStatusLabelOf = (id: string, s: CastPickSets): string => { const st = castStatusOf(id, s); return st === "off" && s.outIds?.has(id) ? "退勤" : CAST_STATUS_LABEL[st]; };
/** ★便 M2 M-18（補遺）: 遅刻連絡＝「遅刻連絡 見込み HH:MM」（見込みなし＝「遅刻連絡」・24 時超えは翌） */
export const lateContactLabelOf = (eta: string | null | undefined): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(eta ?? ""); if (!m) return "遅刻連絡";
  const h = Number(m[1]); return `遅刻連絡 見込み ${h >= 24 ? `翌${String(h - 24).padStart(2, "0")}` : String(h).padStart(2, "0")}:${m[2]}`;
};
export function castPickGroupOf(id: string, s: CastPickSets): CastPickGroup {
  return CAST_STATUS_ORDER[castStatusOf(id, s)];
}
/** 遅刻＝今日の確定シフトの開始（営業日の分・24h 超表記可）を過ぎても in 打刻も out 打刻も無い人。nowMin＝営業日の分（締めの時刻より前は +1440） */
export function lateIdsOf(shifts: readonly { cast_id: string; start_hm: string }[], nowMin: number, punchedIn: ReadonlySet<string>, out: ReadonlySet<string>): Set<string> {
  const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const late = new Set<string>();
  for (const sh of shifts) if (!punchedIn.has(sh.cast_id) && !out.has(sh.cast_id) && nowMin > toMin(sh.start_hm)) late.add(sh.cast_id);
  return late;
}

/** 群（★便 M2 M-18: 待機中→着卓中→出勤予定→遅刻→退勤／休み）→ 名前順。working＝待機中・着卓中（店にいる人） */
export function castPickerOrder<T extends { id: string; name: string }>(casts: readonly T[], s: CastPickSets): OrderedCast<T>[] {
  return casts
    .map((c) => { const group = castPickGroupOf(c.id, s); return { ...c, group, working: group <= 2 }; })
    .sort((a, b) => a.group - b.group || a.name.localeCompare(b.name, "ja"));
}

export const CAST_PICK_GROUP_LABEL: Record<CastPickGroup, string> = { 1: "待機中", 2: "着卓中", 3: "出勤予定", 4: "遅刻", 5: "退勤／休み" };
/** 折りたたみの文言 */
export const offDutyToggleLabelOf = (n: number, open: boolean): string => (open ? `未出勤を隠す（${n} 人）` : `未出勤を表示（${n} 人）`);
