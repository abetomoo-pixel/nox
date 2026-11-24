// ★起票152（2026-11-24・相談役の便【2】）: サポート許可の入口を 3 つ足す（置き場＝マスタ › スタッフ・システムの「サポート許可」のタブは動かさない）。DB を知らない純関数と定数。
//   ア 直通の URL（運営が /ops の会社の詳細からオーナーへ送る）・イ マスタの「店舗・運用」のカード（オーナーだけ・デモの会社は出さない）・ウ マスタの検索（「サポート」「代行」）。
//   許可を出す・取り消す関数（support_grant_set／support_grant_revoke）と権限の判定には触れない。サポート許可は会社ごと（ops_support_grants は会社の行・関数の引数は日数だけ）。
export const SUPPORT_GRANT_PATH = "/master/system?tab=support";
/** 運営がオーナーへ送る URL（場所を指すだけ＝トークンや鍵を入れない） */
export const SUPPORT_GRANT_URL = `https://noxapp.jp${SUPPORT_GRANT_PATH}`;
/** スタッフ・システムのタブの key（page.tsx の tabs と同じ） */
export const SUPPORT_TAB_KEY = "support";
/** オーナー以外（店長）が URL で開いたときの 1 行 */
export const SUPPORT_OWNER_ONLY_NOTE = "サポート許可はオーナーだけが出せます";
/** デモの会社のオーナーが URL で開いたときの 1 行（デモの会社には出さない＝今の決まりのまま） */
export const SUPPORT_DEMO_NOTE = "デモの会社ではサポート許可を出せません";
/** マスタのカード（店舗・運用の群に 1 枚） */
export const SUPPORT_CARD = { label: "サポート許可", href: SUPPORT_GRANT_PATH, desc: "運営に代行を許す日数（1／3／7 日）" } as const;
/** マスタの検索で当たる語（カードの名前と説明に加えて） */
export const SUPPORT_SEARCH_WORDS: readonly string[] = ["サポート", "代行", "サポート許可", "運営"];

/** 検索の当たり（空は全件＝出す）。masterSearchHit と同じく大小無視 */
export function supportCardHitOf(q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return SUPPORT_CARD.label.toLowerCase().includes(s) || SUPPORT_CARD.desc.toLowerCase().includes(s) || SUPPORT_SEARCH_WORDS.some((w) => w.toLowerCase().includes(s) || s.includes(w.toLowerCase()));
}

/** カードを出すか（旗 MIG_0202B・オーナー・デモでない＝タブを出す条件と同じ） */
export const supportCardShownOf = (a: { flag: boolean; role: string | null; isDemo: boolean }): boolean => a.flag && a.role === "owner" && !a.isDemo;

/** URL の ?tab=support で開いたのにタブが無いときの 1 行（タブがあるとき・support 以外の tab は null） */
export function supportMissingNoteOf(a: { requestedTab: string | null | undefined; hasSupportTab: boolean; role: string | null; isDemo: boolean }): string | null {
  if (a.requestedTab !== SUPPORT_TAB_KEY || a.hasSupportTab) return null;
  if (a.role === "owner" && a.isDemo) return SUPPORT_DEMO_NOTE;
  return SUPPORT_OWNER_ONLY_NOTE;
}

/** ログインの後に戻る先（?next=）。同じサイトのマスタの中だけを通す（外のサイト・// で始まる形・\ ・ : を断る＝開いたままの転送にしない）。通らなければ null */
export function safeNextOf(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) return null;
  if (!/^\/master\/[A-Za-z0-9_\-/]*(\?[A-Za-z0-9_\-=&]*)?$/.test(raw)) return null;
  if (raw.includes("//") || raw.includes("\\") || raw.includes(":")) return null;
  return raw;
}

/** ログインへ戻すときに付ける ?next=（マスタの中のパスだけ・ほかは付けない＝今のまま） */
export function loginNextOf(pathname: string, search: string): string | null {
  return safeNextOf(`${pathname}${search}`);
}
