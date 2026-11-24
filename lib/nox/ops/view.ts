// ★起票153・154（2026-11-24 夕・相談役の便【4】【5】）: /ops の見やすさと契約の状況＝表示だけの純関数（DB を知らない・DB 変更 0）。
//   一覧＝「次にすること」の 1 行と進み具合（n／5）・既定の絞り込みは「通常とテスター」（デモと検証用は切り替えで出す）・契約の列。
//   詳細＝導入の状況（どの店の話か＝店名）→ 契約 → オーナー → 代行 → 記録。運営の記録は日本語の 1 行（中身は押すと開く）。
//   契約は DB（org_billing・ops_org_list の kind）にある値だけ。月額・直近の請求の結果・支払い方法は Stripe に取りに行く作りが要る＝出さない（案まで）。
import { fmtJst, opsProgressOf, opsNextStepOf, type OpsOrgRow } from "./labels";

// ── 一覧の絞り込み ──
/** 既定＝通常とテスター（デモと検証用は「デモと検証用も出す」で出す） */
export const OPS_HIDDEN_KINDS: readonly string[] = ["demo", "verify"];
export const opsVisibleOf = (rows: readonly OpsOrgRow[], showAll: boolean): OpsOrgRow[] => (showAll ? [...rows] : rows.filter((r) => !OPS_HIDDEN_KINDS.includes(r.kind)));

// ── 導入の状況の要約（一覧） ──
export function opsProgressSummaryOf(r: OpsOrgRow): { done: number; total: number; next: string } {
  const items = opsProgressOf(r, new Date(0));
  return { done: items.filter((x) => x.state === "done").length, total: items.length, next: opsNextStepOf(items) };
}

// ── 店ごとの初期設定（詳細の導入の状況＝どの店の話か） ──
export type OpsStoreSetup = { id: string; name: string; setupDone: boolean; draftStep: number | null };
export const opsStoreSetupLineOf = (s: OpsStoreSetup): string =>
  `${s.name}：初期設定 ${s.setupDone ? "済み" : s.draftStep != null ? `途中（STEP ${Math.min(9, s.draftStep + 1)}／9）` : "未着手"}`;

// ── 契約（DB にある値だけ） ──
export type OpsBilling = { status: string | null; trial_ends_at: string | null; current_period_end: string | null; quantity: number | null; cancel_at_period_end: boolean | null; has_customer: boolean; has_subscription: boolean };
export type OpsContract = { label: string; tone: "ok" | "warn" | "bad" | "mute"; outOfScope: boolean };
const dayJst = (x: Date) => Math.floor((x.getTime() + 9 * 3600_000) / 86_400_000);
/** 契約の札（一覧の列・詳細のカードの見出し）。デモ・検証用・テスターは「対象外」 */
export function opsContractOf(r: Pick<OpsOrgRow, "kind" | "trial_ends_at">, b: Pick<OpsBilling, "cancel_at_period_end" | "current_period_end"> | null, now: Date): OpsContract {
  if (r.kind === "demo" || r.kind === "verify" || r.kind === "tester") return { label: "対象外", tone: "mute", outOfScope: true };
  if (r.kind === "trial") {
    const left = r.trial_ends_at ? dayJst(new Date(r.trial_ends_at)) - dayJst(now) : null;
    if (left === null) return { label: "お試し中", tone: "ok", outOfScope: false };
    if (left < 0) return { label: "お試しの期限切れ", tone: "bad", outOfScope: false };
    return { label: `お試し中 あと ${left} 日`, tone: left <= 3 ? "warn" : "ok", outOfScope: false };   // 期限間近（3 日以内）は目立たせる
  }
  if (r.kind === "active") return b?.cancel_at_period_end ? { label: `有効（解約の予定 ${fmtJst(b.current_period_end, false)}）`, tone: "warn", outOfScope: false } : { label: "有効", tone: "ok", outOfScope: false };
  if (r.kind === "past_due") return { label: "支払い遅れ", tone: "bad", outOfScope: false };
  if (r.kind === "inactive") return { label: "停止", tone: "bad", outOfScope: false };
  if (r.kind === "canceled") return { label: "解約", tone: "mute", outOfScope: false };
  return { label: "契約なし", tone: "mute", outOfScope: false };
}
/** 詳細の契約のカードの行（DB にある値だけ・無いものは「—」） */
export function opsContractRowsOf(r: Pick<OpsOrgRow, "store_count">, b: OpsBilling | null): [string, string][] {
  return [
    ["契約の店の数", b?.quantity != null ? `${b.quantity} 店${b.quantity !== r.store_count ? `（店は ${r.store_count}・数量の同期は毎日 5:30）` : ""}` : "—"],
    ["お試しの期限", fmtJst(b?.trial_ends_at ?? null, false)],
    ["次の請求日", fmtJst(b?.current_period_end ?? null, false)],
    ["支払いの登録（Stripe）", b ? (b.has_subscription ? "あり（定期の契約あり）" : b.has_customer ? "顧客だけあり（定期の契約なし）" : "なし") : "—"],
  ];
}
/** DB に無いので出していない値（案＝Stripe へ取りに行く作り） */
export const OPS_CONTRACT_NOT_SHOWN = "月額・直近の請求の結果・支払い方法の種類は、Stripe に取りに行く作りが要るので、まだ出していません";

// ── 運営の記録（日本語の 1 行） ──
export type OpsLogLike = { at: string; who: string; action: string; before: unknown; after: unknown; reason: string | null };
const BIZ_JA: Record<string, string> = { cabaret: "キャバクラ", girlsbar: "ガールズバー", snack: "スナック", lounge: "ラウンジ", bar: "バー", host: "ホストクラブ" };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (v == null || v === "" ? "—" : String(v));
/** 何をしたか（日本語）。知らない action は「記録（action の名前）」 */
export function opsLogWhatOf(l: Pick<OpsLogLike, "action" | "before" | "after">): string {
  const a = obj(l.after), b = obj(l.before);
  switch (l.action) {
    case "ops.org.create": return `会社を作った：${str(a.org)}（${BIZ_JA[String(a.biz_type)] ?? str(a.biz_type)}${a.tester ? "・テスター" : ""}）`;
    case "ops.store.add": return `店を追加：${str(a.store)}（${BIZ_JA[String(a.biz_type)] ?? str(a.biz_type)}）`;
    case "ops.agency_code": return a.agency_code ? `経路を代理店（${str(a.agency_code)}）に` : `経路を直販に（前は ${b.agency_code ? `代理店（${str(b.agency_code)}）` : "直販"}）`;
    case "ops.org.reinvite": return `オーナーに招待をもう一度送った（${str(a.owner_email)}）`;
    case "ops.onboarding": return a.onboarding_state === "done" ? "導入完了にした" : `導入の状態を「${str(a.onboarding_state)}」に`;
    case "ops.support_request": return `オーナーにサポート許可を頼んだ${a.message ? `（ひとこと：${str(a.message)}）` : ""}`; // ★0207
    case "ops.support_request_withdraw": return "サポート許可の頼みを取り下げた"; // ★0207
    case "ops.operator.seed": return "運営者を登録した";
    case "ops.agency_assist": return "代理店の代行の許可を変えた";
    case "onb.setup_draft": return `代行：初期設定の下書きを保存（STEP ${typeof a.step === "number" ? a.step + 1 : str(a.step)}）`;
    case "onb.line": return "代行：LINE の公開の値を入れた";
    case "onb.line_secret": return `代行：LINE の${a.kind === "access_token" ? "アクセストークン" : "チャネルシークレット"}を入れた`;
    case "onb.line_verify": return `代行：LINE の連携を確かめた（${a.ok ? "通った" : "通らなかった"}）`;
    case "onb.cast_provisional_add": return `代行：キャストを仮に登録（${str(a.name)}）`;
    case "onb.cast_provisional_cancel": return "代行：キャストの仮の登録を取り消した";
    default: return `記録（${l.action}）`;
  }
}
/** 1 行＝「11/24 14:31　Agoora　店を追加：2店舗目代行店（キャバクラ）」 */
export const opsLogLineOf = (l: OpsLogLike): string => `${fmtJst(l.at)}　${l.who}　${opsLogWhatOf(l)}${l.reason ? `（理由：${l.reason}）` : ""}`;

// ── 店を追加の押せない理由（ボタンの近くに 1 行） ──
export function addStoreBlockedOf(f: { name: string; biz: string; from: string; parts: number }): string | null {
  if (!f.name.trim()) return "店名を入れてください";
  if (!f.biz) return "業態を選んでください";
  if (f.from && f.parts === 0) return "写すものを 1 つ以上選んでください（写さないなら「写さない」に）";
  return null;
}
