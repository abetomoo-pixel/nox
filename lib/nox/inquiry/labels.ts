// ★0212（窓口の段 1・裁定426 の改め・相談役 11/25 の決め【D7】）: 店から運営への問い合わせの札・検査・ポイントの表示・メールの文（DB を知らない純関数）。
//   送れるのはオーナーと店長（2 店舗目の依頼はオーナーだけ）・状態は 受付／確認中／対応済み／見送り・対応済みと見送りには店は返事できない（新しく送る）。
//   ポイントは会社ごと・見せるのはオーナーだけ・表示は「7pt／10pt」（右は 10 ごとの次の区切り・区切りの意味の文は段 1 では出さない）。
//   添付は作らない（写しは support@noxapp.jp へ）。運営へは新しい問い合わせのときだけメール（中身は入れない＝種類・会社名・/ops へのリンクだけ）。

export const INQUIRY_KINDS = ["request", "bug", "question", "store_add"] as const;
export type InquiryKind = (typeof INQUIRY_KINDS)[number];
export const INQUIRY_KIND_LABEL: Record<InquiryKind, string> = { request: "要望", bug: "不具合", question: "質問", store_add: "2 店舗目の依頼" };
/** 送れる種類（店長は 2 店舗目の依頼を送れない） */
export const inquiryKindsFor = (role: string | null | undefined): InquiryKind[] => (role === "owner" ? [...INQUIRY_KINDS] : role === "manager" ? ["request", "bug", "question"] : []);

export const INQUIRY_STATUSES = ["received", "checking", "done", "declined"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];
export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = { received: "受付", checking: "確認中", done: "対応済み", declined: "見送り" };
export const inquiryClosedOf = (status: string): boolean => status === "done" || status === "declined";

export const INQUIRY_SUBJECT_MAX = 60;
export const INQUIRY_BODY_MAX = 2000;
export const INQUIRY_NOTE_MAX = 200;
export const INQUIRY_OPEN_MAX = 30;

/** 2 店舗目の依頼の業態（ops_store_add と同じ 6 つ） */
export const INQUIRY_BIZ: ReadonlyArray<readonly [string, string]> = [["cabaret", "キャバクラ"], ["girlsbar", "ガールズバー"], ["snack", "スナック"], ["lounge", "ラウンジ"], ["bar", "バー"], ["host", "ホストクラブ"]];
export const INQUIRY_BIZ_LABEL: Record<string, string> = Object.fromEntries(INQUIRY_BIZ);
export const INQUIRY_START = ["now", "1m", "2_3m", "undecided"] as const;
export type InquiryStart = (typeof INQUIRY_START)[number];
export const INQUIRY_START_LABEL: Record<InquiryStart, string> = { now: "すぐ", "1m": "1 か月以内", "2_3m": "2〜3 か月後", undecided: "未定" };

/** 送るボタンの上の 1 行（2 店舗目・金額は書かない＝相談役 11/25） */
export const STORE_ADD_PRICE_NOTE = "店舗数に応じて料金が変わります。";
/** 添付は作らない＝写しの送り先の 1 行 */
export const INQUIRY_SUPPORT_MAIL = "support@noxapp.jp";
export const inquiryNoOf = (id: string): string => id.replace(/-/g, "").slice(0, 8).toUpperCase();
export const inquiryAttachNoteOf = (id?: string | null): string => `画面の写しは ${INQUIRY_SUPPORT_MAIL} へ送ってください（件名に問い合わせの番号${id ? `「${inquiryNoOf(id)}」` : ""}）。`;
export const INQUIRY_DEMO_NOTE = "デモの会社では送れません。";
export const INQUIRY_CLOSED_NOTE = "この問い合わせは閉じています。続きは新しく送ってください。";

/** 送る前の検査（DB の関数と同じ線）。通れば null */
export function inquiryFormErrOf(f: { kind: string; subject: string; body: string }): string | null {
  if (!(INQUIRY_KINDS as readonly string[]).includes(f.kind) || f.kind === "store_add") return "種類を選んでください";
  const s = f.subject.trim(), b = f.body.trim();
  if (s.length < 1) return "件名を入れてください";
  if (s.length > INQUIRY_SUBJECT_MAX) return `件名は ${INQUIRY_SUBJECT_MAX} 字までです`;
  if (b.length < 1) return "内容を入れてください";
  if (b.length > INQUIRY_BODY_MAX) return `内容は ${INQUIRY_BODY_MAX} 字までです`;
  return null;
}
export type StoreAddAsk = { name: string; biz_type: string; copy_from: string | null; parts: string[]; start: string };
/** 2 店舗目の依頼の検査（DB の関数と同じ線）。通れば null */
export function storeAddAskErrOf(a: StoreAddAsk & { note: string; storeNames: readonly string[] }): string | null {
  const n = a.name.trim();
  if (n.length < 1 || n.length > 40) return "店名を入れてください（40 字まで）";
  if (a.storeNames.includes(n)) return "同じ名前の店があります";
  if (!INQUIRY_BIZ_LABEL[a.biz_type]) return "業態を選んでください";
  if (a.copy_from && a.parts.length === 0) return "写すものを 1 つ以上選んでください（写さないなら「写さない」に）";
  if (!a.copy_from && a.parts.length > 0) return "写し元の店を選んでください";
  if (!(INQUIRY_START as readonly string[]).includes(a.start)) return "始めたい時期を選んでください";
  if (a.note.trim().length > INQUIRY_NOTE_MAX) return `ひとことは ${INQUIRY_NOTE_MAX} 字までです`;
  return null;
}

// ── 未読（店）と未対応（運営） ──
export type InquiryReadLike = { last_from: string; last_at: string; store_read_at: string | null };
/** 店の側の未読＝最後が運営で、店がまだ開いていない */
export const inquiryUnreadOf = (r: InquiryReadLike): boolean => r.last_from === "ops" && (!r.store_read_at || new Date(r.store_read_at).getTime() < new Date(r.last_at).getTime());
export const inquiryUnreadCountOf = (rows: readonly InquiryReadLike[]): number => rows.filter(inquiryUnreadOf).length;
/** ベルの数に足す数（未読の件数） */
export const inquiryReplyCountOf = (n: number | null | undefined): number => (typeof n === "number" && n > 0 ? n : 0);
/** 要承認のカードの 1 行 */
export const inquiryReplyLineOf = (n: number): string => `運営から返事があります（${n} 件）`;
/** 運営の側の未対応＝最後が店で、閉じていない */
export const opsInquiryWaitingOf = (r: { last_from: string; status: string }): boolean => r.last_from === "store" && !inquiryClosedOf(r.status);

// ── ポイント ──
/** 種類ごとの上限（質問と 2 店舗目は付けない＝0） */
export const inquiryPointMaxOf = (kind: string): number => (kind === "bug" ? 3 : kind === "request" ? 5 : 0);
/** 「7pt／10pt」＝左が今の残り・右が 10 ごとの次の区切り（0→10・7→10・10→20・13→20） */
export function pointsDisplayOf(balance: number): { now: number; next: number; text: string } {
  const now = Math.max(0, Math.trunc(Number.isFinite(balance) ? balance : 0));
  const next = (Math.floor(now / 10) + 1) * 10;
  return { now, next, text: `${now}pt／${next}pt` };
}
export const pointsBalanceOf = (rows: readonly { delta: number }[]): number => rows.reduce((a, r) => a + r.delta, 0);
/** 問い合わせの行の札（付いて取り消されていないもの） */
export function inquiryPointTagOf(rows: readonly { kind: string; delta: number }[]): string | null {
  const g = rows.find((r) => r.kind === "grant");
  if (!g) return null;
  return rows.some((r) => r.kind === "revoke") ? null : `+${g.delta}pt`;
}

// ── 日時 ──
export const inquiryAtOf = (iso: string): string => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

// ── 運営へのメール（中身は入れない＝種類・会社名・/ops へのリンクだけ） ──
export const OPS_INQUIRY_MAIL_TO = INQUIRY_SUPPORT_MAIL;
export const OPS_INQUIRY_URL_BASE = "https://noxapp.jp/ops/inquiries";
export function opsInquiryMailOf(a: { kind: string; orgName: string; inquiryId: string }): { subject: string; text: string } {
  const kind = INQUIRY_KIND_LABEL[a.kind as InquiryKind] ?? "問い合わせ";
  return {
    subject: `【NOX】新しい問い合わせ（${kind}）`,
    text: [`新しい問い合わせが届きました。`, ``, `種類：${kind}`, `会社：${a.orgName}`, `番号：${inquiryNoOf(a.inquiryId)}`, ``, `運営コンソールで開く：${OPS_INQUIRY_URL_BASE}/${a.inquiryId}`, ``, `（内容はメールに載せていません。運営コンソールで読んでください）`, `NOX（株式会社レクソル）`].join("\n"),
  };
}
/** ★F1（相談役 11/25）: 店が返事をしたときも運営へ知らせる（中身は載せない・新しい問い合わせと同じ形） */
export function opsInquiryReplyMailOf(a: { kind: string; orgName: string; inquiryId: string }): { subject: string; text: string } {
  const kind = INQUIRY_KIND_LABEL[a.kind as InquiryKind] ?? "問い合わせ";
  return {
    subject: `【NOX】問い合わせに店から返事（${kind}）`,
    text: [`問い合わせに店から返事が届きました。`, ``, `種類：${kind}`, `会社：${a.orgName}`, `番号：${inquiryNoOf(a.inquiryId)}`, ``, `運営コンソールで開く：${OPS_INQUIRY_URL_BASE}/${a.inquiryId}`, ``, `（内容はメールに載せていません。運営コンソールで読んでください）`, `NOX（株式会社レクソル）`].join("\n"),
  };
}
/** ★F1（相談役 11/25）: 見送りの理由は運営の発言として店にも見せる（状態を見送りに変えた時だけ・やりとりに 1 行） */
export const inquiryDeclineMessageOf = (reason: string): string => `見送りにしました。理由：${reason.trim()}`;
/** ★F1（相談役 11/25）: 開いている件数が上限に近い会社＝運営の一覧に印（残り 5 件以下） */
export const INQUIRY_OPEN_NEAR = INQUIRY_OPEN_MAX - 5;
export const inquiryOpenNearOf = (open: number): boolean => open >= INQUIRY_OPEN_NEAR;
export const inquiryOpenNearTextOf = (open: number): string => `開いている ${open}／${INQUIRY_OPEN_MAX} 件`;
/** 送らないとき（確かめ用の会社）＝理由の語。送るなら null（鍵の有無は送る部品が見る） */
export const opsInquiryMailSkipOf = (orgName: string | null | undefined): string | null => (!orgName ? "no_org" : /^NOX-(VERIFY|CHECK)-/.test(orgName) ? "verify_org" : null);

// ── 誤りの語 ──
export function inquiryErrJa(m: string | null | undefined): string {
  const s = String(m ?? "");
  if (s.includes("forbidden (demo)")) return "デモの会社では送れません";
  if (s.includes("too many open")) return `開いている問い合わせが ${INQUIRY_OPEN_MAX} 件あります。対応済みになってから送ってください`;
  if (s.includes("closed")) return INQUIRY_CLOSED_NOTE;
  if (s.includes("dup store")) return "同じ名前の店があります";
  if (s.includes("bad name")) return "店名を入れてください（40 字まで）";
  if (s.includes("bad biz type")) return "業態を選んでください";
  if (s.includes("copy from not ready")) return "写し元の店の初期設定が済んでいません";
  if (s.includes("bad copy from") || s.includes("bad parts")) return "写すものの選び方が違います";
  if (s.includes("bad start")) return "始めたい時期を選んでください";
  if (s.includes("bad subject")) return `件名は 1〜${INQUIRY_SUBJECT_MAX} 字です`;
  if (s.includes("bad body")) return "内容の長さが違います";
  if (s.includes("bad kind")) return "種類を選んでください";
  if (s.includes("not found")) return "問い合わせが見つかりません";
  if (s.includes("forbidden")) return "権限がありません";
  return "送れませんでした。時間をおいてもう一度試してください";
}
export function opsInquiryErrJa(m: string | null | undefined): string {
  const s = String(m ?? "");
  if (s.includes("forbidden (demo)")) return "デモの会社には付けられません";
  if (s.includes("reason required")) return "理由を入れてください";
  if (s.includes("bad reason")) return `理由は ${INQUIRY_NOTE_MAX} 字までです`;
  if (s.includes("bad points")) return "その種類に付けられる数の外です（不具合 1〜3・要望 1〜5）";
  if (s.includes("no points")) return "質問と 2 店舗目の依頼にはポイントを付けません";
  if (s.includes("already granted")) return "この問い合わせにはもう付けました（付けられるのは 1 回）";
  if (s.includes("already revoked")) return "もう取り消しました";
  if (s.includes("not granted")) return "まだ付けていません";
  if (s.includes("not store add")) return "2 店舗目の依頼ではありません";
  if (s.includes("closed")) return "見送りにした依頼です";
  if (s.includes("bad status")) return "状態の値が違います";
  if (s.includes("bad body")) return `返事は 1〜${INQUIRY_BODY_MAX} 字です`;
  if (s.includes("not found")) return "問い合わせが見つかりません";
  if (s.includes("forbidden")) return "運営者として確かめられませんでした";
  return "うまくいきませんでした。時間をおいてもう一度試してください";
}

// ── 運営の記録（opsLogWhatOf から呼ぶ） ──
export function opsInquiryLogWhatOf(action: string, after: Record<string, unknown>): string | null {
  switch (action) {
    case "ops.inquiry.reply": return "問い合わせに返事をした";
    case "ops.inquiry.status": return `問い合わせの状態を「${INQUIRY_STATUS_LABEL[String(after.status) as InquiryStatus] ?? String(after.status ?? "—")}」に`;
    case "ops.inquiry.points": return `問い合わせにポイントを付けた（+${String(after.points ?? "—")}pt・残り ${String(after.balance ?? "—")}pt）`;
    case "ops.inquiry.points_revoke": return `問い合わせのポイントを取り消した（残り ${String(after.balance ?? "—")}pt）`;
    case "ops.inquiry.store_add": return "2 店舗目の依頼から店を足した";
    default: return null;
  }
}

// ── 入口（マスタ › 店舗・運用のカード・起票152 のサポート許可のカードと同じ形・MASTER_NAV の入口の数は変えない） ──
export const INQUIRY_PATH = "/master/inquiry";
export const INQUIRY_CARD = { label: "運営への問い合わせ", href: INQUIRY_PATH, desc: "要望・不具合・質問・2 店舗目の依頼" } as const;
export const INQUIRY_SEARCH_WORDS: readonly string[] = ["問い合わせ", "要望", "不具合", "質問", "運営", "2 店舗目", "店舗追加", "ポイント"];
export function inquiryCardHitOf(q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return INQUIRY_CARD.label.toLowerCase().includes(s) || INQUIRY_CARD.desc.toLowerCase().includes(s) || INQUIRY_SEARCH_WORDS.some((w) => w.toLowerCase().includes(s) || s.includes(w.toLowerCase()));
}
/** カードを出すか（旗・オーナーと店長） */
export const inquiryCardShownOf = (a: { flag: boolean; role: string | null }): boolean => a.flag && (a.role === "owner" || a.role === "manager");
