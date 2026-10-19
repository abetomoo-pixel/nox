// ★便 X-11-2b（2026-09-29）: レジ顧客カードの候補表示（純関数・DB を知らない）。
//   検索欄が空＝一覧は出さず「最近来店 5 人」と「担当キャストの顧客（5 人まで）」だけ。
//   1 文字以上＝名前／ふりがな／電話の部分一致・最終来店日の降順（来店なしは後ろ・同日は名前順）・10 件ずつ（「さらに表示」で +10）。
//   伝票に付いている顧客は候補から外す。入力＝customers の直読（id・name・furigana・tel）＋ customer_list_summary の戻り（last_visit・cast_id・visits）。
export type CandidateSource = { id: string; name: string; furigana?: string | null; tel?: string | null };
export type CandidateSummary = { customer_id: string; last_visit?: string | null; cast_id?: string | null; visits?: number | null };
export type Candidate = { id: string; name: string; furigana: string | null; tel: string | null; lastVisit: string | null; castId: string | null; visits: number };

export const CANDIDATE_IDLE_LIMIT = 5;
export const CANDIDATE_PAGE = 10;

const norm = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
const digits = (s: string | null | undefined): string => (s ?? "").normalize("NFKC").replace(/\D/g, "");

/** customers と summary を 1 本にまとめ、伝票に付いている顧客を外す */
export function candidatesOf(custs: readonly CandidateSource[], summary: readonly CandidateSummary[], onCheck: ReadonlySet<string>): Candidate[] {
  const sm = new Map(summary.map((s) => [s.customer_id, s]));
  return custs.filter((c) => !onCheck.has(c.id)).map((c) => {
    const s = sm.get(c.id);
    return { id: c.id, name: c.name, furigana: c.furigana ?? null, tel: c.tel ?? null, lastVisit: s?.last_visit ?? null, castId: s?.cast_id ?? null, visits: s?.visits ?? 0 };
  });
}

/** 最終来店日の降順（来店なしは後ろ）・同じなら名前順 */
export function byLastVisitDesc(a: Candidate, b: Candidate): number {
  if (a.lastVisit && b.lastVisit) { if (a.lastVisit !== b.lastVisit) return a.lastVisit < b.lastVisit ? 1 : -1; }
  else if (a.lastVisit) return -1;
  else if (b.lastVisit) return 1;
  return a.name.localeCompare(b.name, "ja");
}

/** 検索欄が空のとき: 最近来店（来店のある人だけ・5 人）と担当キャストの顧客（伝票の指名キャストが担当・5 人まで・最近来店と重複させない） */
export function idleCandidatesOf(all: readonly Candidate[], castIds: readonly string[]): { recent: Candidate[]; mine: Candidate[] } {
  const recent = all.filter((c) => !!c.lastVisit).slice().sort(byLastVisitDesc).slice(0, CANDIDATE_IDLE_LIMIT);
  const seen = new Set(recent.map((c) => c.id));
  const cs = new Set(castIds);
  const mine = cs.size === 0 ? [] : all.filter((c) => !!c.castId && cs.has(c.castId) && !seen.has(c.id)).slice().sort(byLastVisitDesc).slice(0, CANDIDATE_IDLE_LIMIT);
  return { recent, mine };
}

/** 1 文字以上の検索: 名前／ふりがな／電話の部分一致（電話は数字だけで比べる）・最終来店日の降順 */
export function searchCandidatesOf(all: readonly Candidate[], q: string): Candidate[] {
  const k = norm(q);
  if (k === "") return [];
  const kd = digits(q);
  return all.filter((c) => norm(c.name).includes(k) || norm(c.furigana).includes(k) || (kd.length > 0 && digits(c.tel).includes(kd))).slice().sort(byLastVisitDesc);
}

/** 表示する件数ぶんと、残りの件数 */
export function pageOf<T>(rows: readonly T[], shown: number): { rows: T[]; rest: number } {
  const n = Math.max(CANDIDATE_PAGE, shown);
  return { rows: rows.slice(0, n), rest: Math.max(0, rows.length - n) };
}

/** 最終来店の表示（M/D・無ければ「来店なし」） */
export const lastVisitLabelOf = (iso: string | null): string => {
  if (!iso) return "来店なし";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "来店なし";
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return `最終 ${j.getUTCFullYear()}/${j.getUTCMonth() + 1}/${j.getUTCDate()}`;
};

/** ★便 GV-C C-8（GV-50）: 最終来店の相対表示＝営業日基準（cutoff＝店の営業日の切替時刻・既定 06:00）。
 *  当営業日＝「今日」・n 営業日前＝「n日前」・未来（予約や時計ずれ）＝相対を出さない（"-n日前" を作らない） */
export function lastVisitRelOf(iso: string, nowIso: string, cutoffHm = "06:00"): string | null {
  const t = Date.parse(iso), n = Date.parse(nowIso);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  const bd = (ms: number) => { const j = new Date(ms + 9 * 3600 * 1000); const hm = `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`; const day = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()); return hm < cutoffHm ? day - 86_400_000 : day; };
  const days = Math.round((bd(n) - bd(t)) / 86_400_000);
  if (days < 0) return null;
  return days === 0 ? "今日" : `${days}日前`;
}
