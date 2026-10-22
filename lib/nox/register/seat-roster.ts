// ★便 S（S-6）: 「指名・席」のキャスト一覧とフリーの付け回し（純関数・DB を知らない）。
//   ① 一覧は名簿の状態に関係なく常に出す（チップ＝出勤中（既定）／全員）。名簿の人は「本／場内／フリー」の印と薄い枠・押すと名簿から外れる。
//      他の卓に着いている人は「着卓中（B2）」・押すとその卓から離席してこの卓に着く（確認 1 回）。
//   ② フリー＝指名料が無いので分配率の対象外。分配率の節にはフリーを出さず、「席」の節（分配率の上）に「着卓中：ひなの 20:05〜」「離席」で着席ログだけ記録。
//      着席ログ＝既存の着席記録 check_nominations（created_at＝着席・ended_at＝離席・列は足さない）。重複着席は前の卓を自動で離席。
//   ③ 本指名・場内・同伴は今のまま分配率に入る。フリー→本指名に変えたら分配率の節へ移る（逆も）。
//   save の器＝check_set_nominations（全置換・キー欠落＝既存値保持・ended true＝離席（旧値引継ぎ／無ければ now）・false＝再着席）。
export type NomKind = "hon" | "jonai" | "free";
export type RosterRow = { cast_id: string; ratio_weight: number; nom_kind: NomKind; is_dohan: boolean; ended_at?: string | null; created_at?: string | null };

/** 一覧のチップ＝出勤中（既定）／全員（S-6 ①） */
export const ROSTER_CHIPS = [["working", "出勤中"], ["", "全員"]] as const;

/** 着席中（ended_at が null）の cast id */
export const activeIdsOf = (rows: readonly Pick<RosterRow, "cast_id" | "ended_at">[]): Set<string> =>
  new Set(rows.filter((r) => r.ended_at == null).map((r) => r.cast_id));

/** 分配率の節に出す id＝着席中かつフリー以外（フリーは指名料が無い＝分配率の対象外・席の節へ） */
export function shareCardIdsOf(memberIds: readonly string[], kinds: Record<string, string | undefined>, activeIds?: ReadonlySet<string>): string[] {
  return memberIds.filter((id) => (kinds[id] ?? "free") !== "free" && (activeIds ? activeIds.has(id) : true));
}

const hm = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" });
};

export type SeatRow = { castId: string; name: string; from: string; to: string | null; active: boolean };
/** 席の節の行＝フリーの名簿（着席ログ）。着席中が上・着席時刻順（同時刻は名前順）。離席済みは下に薄く */
export function seatRowsOf(rows: readonly RosterRow[], kinds: Record<string, string | undefined>, nameOf: (id: string) => string): SeatRow[] {
  return rows
    .filter((r) => (kinds[r.cast_id] ?? r.nom_kind ?? "free") === "free")
    .map((r) => ({ castId: r.cast_id, name: nameOf(r.cast_id), from: hm(r.created_at), to: r.ended_at ? hm(r.ended_at) : null, active: r.ended_at == null }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.from.localeCompare(b.from) || a.name.localeCompare(b.name, "ja"));
}
export const seatRowTextOf = (r: SeatRow): string =>
  r.active ? `着卓中：${r.name}${r.from ? ` ${r.from}〜` : ""}` : `${r.name} ${r.from}〜${r.to ?? ""}（離席）`;

/** 名簿の全置換 payload＝weight はそのまま・当該 cast だけ ended を明示（true＝離席／false＝再着席）・他は ended キー無し＝既存値保持 */
export function endedPayloadOf(rows: readonly Pick<RosterRow, "cast_id" | "ratio_weight">[], castId: string, ended: boolean): { cast_id: string; weight: number; ended?: boolean }[] {
  return rows.map((r) => (r.cast_id === castId ? { cast_id: r.cast_id, weight: r.ratio_weight, ended } : { cast_id: r.cast_id, weight: r.ratio_weight }));
}

/** 他卓に着いている人の印＝「着卓中（B2）」（卓名が取れなければ「着卓中」） */
export const servingLabelOf = (seat: string | null | undefined): string => (seat ? `着卓中（${seat}）` : "着卓中");
/** 他卓から移す確認（1 回） */
export const moveConfirmTextOf = (name: string, fromSeat: string | null | undefined, toSeat: string | null | undefined): string =>
  `${name} は${fromSeat ? ` ${fromSeat} に` : "別の卓に"}着卓中です。${fromSeat ? `${fromSeat} から` : "その卓から"}離席して${toSeat ? `この卓（${toSeat}）` : "この卓"}に着けますか？`;
/** ★裁定415（便 SH-UI-c S-7）: 指名かぶりの文言＝「るな は A3 に着卓中です（指名かぶり）。この卓の指名料は入ります。A3 の伝票は変わりません。席はどうしますか？」
 *  ボタン＝「指名だけ入れる（席は A3 のまま）」「指名して A3 から付け回す」。卓名が無ければ「他の卓」 */
export function nomConflictTextOf(name: string, fromSeat: string | null | undefined, toSeat: string | null | undefined): { lead: string; only: string; move: string } {
  const f = fromSeat ?? "他の卓";
  return {
    lead: `${name} は ${f} に着卓中です（指名かぶり）。この卓${toSeat ? `（${toSeat}）` : ""}の指名料は入ります。${f} の伝票は変わりません。席はどうしますか？`,
    only: `指名だけ入れる（席は ${f} のまま）`,
    move: `指名して ${f} から付け回す`,
  };
}
/** 分配率の節の行の小さな印＝他卓に着卓中（「A3 着卓中」）・無ければ null */
export const servingMarkOf = (seat: string | null | undefined): string | null => (seat ? `${seat} 着卓中` : null);
/** 他卓の名簿（cast_id → 主席の卓名）＝openNoms（checkId → cast_id[]・着席中のみ）と primaryOf（checkId → seat_id）・seats から */
export function servingSeatMapOf(openNoms: Record<string, readonly string[]>, primaryOf: Record<string, string>, seatNameOf: (seatId: string) => string | null, selfCheckId: string | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const [cid, ids] of Object.entries(openNoms)) {
    if (cid === selfCheckId) continue;
    const seat = primaryOf[cid] ? seatNameOf(primaryOf[cid]) : null;
    for (const id of ids) if (seat && !m.has(id)) m.set(id, seat);
  }
  return m;
}
