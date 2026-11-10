// ★M-129（裁定470・2026-11-10）: お知らせの「個別に選ぶ」の純関数（DB を知らない・ブラウザと route で共用）。
//   宛先＝キャスト（casts.id）とスタッフ（memberships.id＝manager／staff）。個別のお知らせは audience 'targets'＋cast_ids／staff_ids（作成時点で固定＝0200 の RLS が本人だけに見せる）。
//   区分（all／cast／staff）は従来どおり＝後から入った人にも出る。LINE の送信も宛先だけ（/api/line/notice が targets なら配列で絞る）。
export type NoticeAudience = "all" | "cast" | "staff" | "targets";
export type TargetKind = "cast" | "staff";
export type TargetPerson = { kind: TargetKind; id: string; name: string; linked: boolean };
export type TargetSel = { cast: ReadonlySet<string>; staff: ReadonlySet<string> };

export const NOTICE_TARGETS_MAX = 200; // notice_create_targets の上限（0176／0200 と同値）
export const NOTICE_TARGETS_LABEL = "個別に選ぶ";
export const emptyTargetSel = (): TargetSel => ({ cast: new Set(), staff: new Set() });

/** 区分を押す＝その区分の全員にチェック（all＝キャスト＋スタッフ・cast・staff）。以後は個別に外す／足す */
export function targetSelOfGroup(people: readonly TargetPerson[], group: "all" | "cast" | "staff"): TargetSel {
  const pick = (k: TargetKind) => new Set(people.filter((p) => p.kind === k && (group === "all" || group === k)).map((p) => p.id));
  return { cast: pick("cast"), staff: pick("staff") };
}
export function toggleTarget(sel: TargetSel, p: Pick<TargetPerson, "kind" | "id">): TargetSel {
  const next = new Set(sel[p.kind]);
  if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
  return p.kind === "cast" ? { cast: next, staff: sel.staff } : { cast: sel.cast, staff: next };
}
/** 見えている人（検索で絞った後）を全選択／全解除 */
export function setTargetsAll(sel: TargetSel, shown: readonly Pick<TargetPerson, "kind" | "id">[], on: boolean): TargetSel {
  const cast = new Set(sel.cast), staff = new Set(sel.staff);
  for (const p of shown) { const s = p.kind === "cast" ? cast : staff; if (on) s.add(p.id); else s.delete(p.id); }
  return { cast, staff };
}
export const targetCountOf = (sel: TargetSel): number => sel.cast.size + sel.staff.size;
/** 名前検索（部分一致・大文字小文字を無視・空は全員） */
export function targetPeopleFilterOf(people: readonly TargetPerson[], q: string): TargetPerson[] {
  const n = q.trim().toLowerCase();
  return n === "" ? [...people] : people.filter((p) => p.name.toLowerCase().includes(n));
}
/** 宛先の人数と LINE の通数（連携済みだけ）＝区分なら区分の全員・個別なら選んだ人 */
export function noticeRecipientsOf(people: readonly TargetPerson[], aud: NoticeAudience, sel: TargetSel): { people: number; line: number } {
  const inAud = (p: TargetPerson) => aud === "all" || (aud === "cast" && p.kind === "cast") || (aud === "staff" && p.kind === "staff") || (aud === "targets" && sel[p.kind].has(p.id));
  const xs = people.filter(inAud);
  return { people: xs.length, line: xs.filter((p) => p.linked).length };
}
/** 送信前の確認の 1 行＝「宛先 ○人・LINE ○通・残り ○通」（裁定459 の確認と同じ数え方＝残り＝上限−今月の送信数） */
export function noticeConfirmLineOf(i: { people: number; line: number; sendLine: boolean; sent: number; limit: number }): string {
  const remain = Math.max(0, i.limit - i.sent);
  return i.sendLine ? `宛先 ${i.people.toLocaleString()}人・LINE ${i.line.toLocaleString()}通・残り ${remain.toLocaleString()}通` : `宛先 ${i.people.toLocaleString()}人（LINE は送らない）`;
}
/** 作成の引数（4 引数の旧型は使わない＝0200 の 6 引数）。0 人／200 人超は null（RPC も 'bad targets'） */
export function noticeTargetsArgsOf(sel: TargetSel): { p_cast_ids: string[] | null; p_staff_ids: string[] | null } | null {
  const n = targetCountOf(sel);
  if (n < 1 || n > NOTICE_TARGETS_MAX) return null;
  return { p_cast_ids: sel.cast.size ? [...sel.cast] : null, p_staff_ids: sel.staff.size ? [...sel.staff] : null };
}
/** 一覧の公開範囲の表示（個別は「個別 N 人」） */
export function noticeAudLabelOf(n: { audience: string; cast_ids?: readonly string[] | null; staff_ids?: readonly string[] | null }, labels: Record<string, string>): string {
  if (n.audience === "targets") return `個別 ${((n.cast_ids?.length ?? 0) + (n.staff_ids?.length ?? 0)).toLocaleString()}人`;
  return labels[n.audience] ?? n.audience;
}
/** /api/line/notice の宛先＝line_links のうち、targets（と cast_ids 付きの旧型）は配列で絞る・区分は subject_kind で絞る */
export function noticeLineLinksOf<T extends { subject_kind: string; subject_id: string }>(links: readonly T[], n: { audience: string; cast_ids?: readonly string[] | null; staff_ids?: readonly string[] | null }, kinds: readonly string[]): T[] {
  const cast = n.cast_ids ?? null, staff = n.staff_ids ?? null;
  if (n.audience === "targets") return links.filter((l) => (l.subject_kind === "cast" && !!cast?.includes(l.subject_id)) || (l.subject_kind === "membership" && !!staff?.includes(l.subject_id)));
  if (cast && cast.length > 0) return links.filter((l) => l.subject_kind === "cast" && cast.includes(l.subject_id)); // 0176 の宛先つき（シフトの未提出通知）
  return links.filter((l) => kinds.includes(l.subject_kind));
}
