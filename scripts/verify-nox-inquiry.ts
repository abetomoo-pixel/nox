// verify:nox-inquiry（★0212・窓口の段 1・相談役 11/25 の決め【D7】）— 店から運営への問い合わせ
//   (1) 純関数＝種類と状態の札・送れる種類（店長は 2 店舗目なし）・送る前の検査・2 店舗目の検査・未読と未対応・ポイントの表示（7pt／10pt）・札・メールの文（中身を入れない）・誤りの語・運営の記録
//   (2) 配線＝route（旗・柵・RPC・メール・記録）・店の画面（送る・返事・既読・ポイントはオーナー）・マスタのカード・要承認（「運営から」・ベルの数）・/ops（一覧・詳細・route・未対応）・デモの名簿（旗の後ろ）・demo-guard の分類・課金ゲートの正本
//   (3) DB（旗 MIG_0212_APPLIED が true のときだけ・本番・1 トランザクション・ROLLBACK＝恒久変更 0）＝柵の要点（詳しい試走は docs/tmp/inquiry_1125/try-0212.mts）
import fs from "node:fs";
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";
import {
  INQUIRY_KIND_LABEL, INQUIRY_STATUS_LABEL, inquiryKindsFor, inquiryClosedOf, inquiryFormErrOf, storeAddAskErrOf, inquiryUnreadOf, inquiryUnreadCountOf, inquiryReplyCountOf, inquiryReplyLineOf, opsInquiryWaitingOf,
  inquiryPointMaxOf, pointsDisplayOf, pointsBalanceOf, inquiryPointTagOf, opsInquiryMailOf, opsInquiryMailSkipOf, inquiryErrJa, opsInquiryErrJa, opsInquiryLogWhatOf, inquiryNoOf, inquiryAttachNoteOf,
  STORE_ADD_PRICE_NOTE, inquiryCardHitOf, inquiryCardShownOf, OPS_INQUIRY_MAIL_TO, opsInquiryReplyMailOf, inquiryDeclineMessageOf, inquiryOpenNearOf, inquiryOpenNearTextOf, INQUIRY_OPEN_NEAR,
  OPS_INQUIRY_MAIL_ACTION, opsMailSkipReasonOf, opsMailAggregateOf, mailReasonOf, opsInquiryMailLogOf, inquirySubjectLineOf,
} from "../lib/nox/inquiry/labels";
import { opsLogWhatOf, addStoreFieldErrsOf, addStoreInitialBizOf, addStoreBlockedOf } from "../lib/nox/ops/view";
import { LOGIN_FAIL_TEXT } from "../lib/nox/ops/labels";
import { storeAddErrJa, storeCopyErrJa } from "../lib/nox/ops/store-add";
import { MIG_0212_APPLIED } from "../lib/nox/rules-0175/flag";
import { DEMO_KEEP_EXTRA, DEMO_PREWIPE_TABLES } from "../lib/nox/demo/prewipe";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else { fails.push(label); console.error(`NG ${label} ${detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)}`); } };
const src = (p: string) => fs.readFileSync(p, "utf8");

// ── (1) 純関数 ──
check("(1-1) 種類 4 つ・状態 4 つの札", INQUIRY_KIND_LABEL.request === "要望" && INQUIRY_KIND_LABEL.bug === "不具合" && INQUIRY_KIND_LABEL.question === "質問" && INQUIRY_KIND_LABEL.store_add === "店舗の追加の依頼" /* ★M2-6 */ && Object.values(INQUIRY_STATUS_LABEL).join("／") === "受付／確認中／対応済み／見送り");
check("(1-2) 送れる種類＝オーナー 4・店長 3（2 店舗目なし）・スタッフとキャスト 0", inquiryKindsFor("owner").length === 4 && inquiryKindsFor("manager").join(",") === "request,bug,question" && inquiryKindsFor("staff").length === 0 && inquiryKindsFor("cast").length === 0);
check("(1-3) 閉じた＝対応済みと見送り", inquiryClosedOf("done") && inquiryClosedOf("declined") && !inquiryClosedOf("received") && !inquiryClosedOf("checking"));
check("(1-4) 送る前の検査（件名 1〜60・内容 1〜2000・2 店舗目はこの形では送らない）", inquiryFormErrOf({ kind: "bug", subject: "a", body: "b" }) === null && inquiryFormErrOf({ kind: "bug", subject: " ", body: "b" }) !== null && inquiryFormErrOf({ kind: "bug", subject: "あ".repeat(61), body: "b" }) !== null && inquiryFormErrOf({ kind: "bug", subject: "a", body: "あ".repeat(2001) }) !== null && inquiryFormErrOf({ kind: "store_add", subject: "a", body: "b" }) !== null);
const SA = { name: "二号店", biz_type: "bar", copy_from: null, parts: [] as string[], start: "now", note: "", storeNames: ["本店"] };
check("(1-5) 2 店舗目の検査（DB と同じ線）", storeAddAskErrOf(SA) === null && storeAddAskErrOf({ ...SA, name: "本店" }) !== null && storeAddAskErrOf({ ...SA, name: "" }) !== null && storeAddAskErrOf({ ...SA, biz_type: "club" }) !== null
  && storeAddAskErrOf({ ...SA, parts: ["pricing"] }) !== null && storeAddAskErrOf({ ...SA, copy_from: "x" }) !== null && storeAddAskErrOf({ ...SA, copy_from: "x", parts: ["comp"] }) === null && storeAddAskErrOf({ ...SA, start: "" }) !== null && storeAddAskErrOf({ ...SA, note: "あ".repeat(201) }) !== null);
const R = (o: Partial<{ last_from: string; last_at: string; store_read_at: string | null }>) => ({ last_from: "ops", last_at: "2026-11-25T03:00:00Z", store_read_at: null, ...o });
check("(1-6) 未読＝最後が運営で開いていない（開いた後に運営がまた返事＝未読）", inquiryUnreadOf(R({})) && !inquiryUnreadOf(R({ last_from: "store" })) && !inquiryUnreadOf(R({ store_read_at: "2026-11-25T03:00:01Z" })) && inquiryUnreadOf(R({ store_read_at: "2026-11-25T02:59:00Z" })) && inquiryUnreadCountOf([R({}), R({ last_from: "store" }), R({})]) === 2);
check("(1-7) ベルの数と要承認の 1 行", inquiryReplyCountOf(2) === 2 && inquiryReplyCountOf(0) === 0 && inquiryReplyCountOf(undefined) === 0 && inquiryReplyLineOf(2) === "運営から返事があります（2 件）");
check("(1-8) 運営の未対応＝最後が店で閉じていない", opsInquiryWaitingOf({ last_from: "store", status: "checking" }) && !opsInquiryWaitingOf({ last_from: "ops", status: "checking" }) && !opsInquiryWaitingOf({ last_from: "store", status: "done" }));
check("(1-9) ポイントの上限＝不具合 3・要望 5・質問と 2 店舗目 0", inquiryPointMaxOf("bug") === 3 && inquiryPointMaxOf("request") === 5 && inquiryPointMaxOf("question") === 0 && inquiryPointMaxOf("store_add") === 0);
check("(1-10) 表示＝10 ごとの次の区切り（0→0pt／10pt・7→7pt／10pt・10→10pt／20pt・13→13pt／20pt）", pointsDisplayOf(0).text === "0pt／10pt" && pointsDisplayOf(7).text === "7pt／10pt" && pointsDisplayOf(10).text === "10pt／20pt" && pointsDisplayOf(13).text === "13pt／20pt" && pointsDisplayOf(-2).text === "0pt／10pt");
check("(1-11) 残り＝delta の和・札は付けて取り消していないものだけ", pointsBalanceOf([{ delta: 3 }, { delta: 5 }, { delta: -3 }]) === 5 && inquiryPointTagOf([{ kind: "grant", delta: 3 }]) === "+3pt" && inquiryPointTagOf([{ kind: "grant", delta: 3 }, { kind: "revoke", delta: -3 }]) === null && inquiryPointTagOf([]) === null);
const ID = "0f1e2d3c-4b5a-4968-8776-655443322110";
const mail = opsInquiryMailOf({ kind: "bug", orgName: "CLUB TEST", inquiryId: ID, subject: "レジが\n止まる" });
check("(1-12) ★M2-5 運営へのメール＝会社名・種類・件名（1 行に畳む）・番号・/ops のリンクだけ（内容は入れない）・運営者 0 人のときの宛先は support@noxapp.jp", OPS_INQUIRY_MAIL_TO === "support@noxapp.jp" && mail.subject === "【NOX】新しい問い合わせ（不具合）" && mail.text.includes("会社：CLUB TEST") && mail.text.includes("種類：不具合") && mail.text.includes("件名：レジが 止まる") && mail.text.includes(`https://noxapp.jp/ops/inquiries/${ID}`) && mail.text.includes(`番号：${inquiryNoOf(ID)}`) && !/内容：/.test(mail.text)
  && opsInquiryMailOf({ kind: "store_add", orgName: "X", inquiryId: ID }).subject === "【NOX】新しい問い合わせ（店舗の追加の依頼）" && inquirySubjectLineOf("") === "—" && inquirySubjectLineOf("あ".repeat(70)).length === 60, mail.text);
check("(1-12b) ★M2-5 送らない理由（確かめ用の会社・鍵なし・本番でない）・結果のまとめ（1 人でも送れたら sent）・理由の語の形・記録の文", opsMailSkipReasonOf({ orgName: "NOX-VERIFY-A", hasKey: true, vercelEnv: "production" }) === "verify_org" && opsMailSkipReasonOf({ orgName: "CLUB", hasKey: false, vercelEnv: "production" }) === "no_key" && opsMailSkipReasonOf({ orgName: "CLUB", hasKey: true, vercelEnv: "preview" }) === "not_production" && opsMailSkipReasonOf({ orgName: "CLUB", hasKey: true, vercelEnv: "production" }) === null
  && opsMailAggregateOf([{ status: "failed", reason: "http_500" }, { status: "sent" }]).status === "sent" && JSON.stringify(opsMailAggregateOf([{ status: "skipped", reason: "no_key" }, { status: "failed", reason: "timeout" }])) === JSON.stringify({ status: "failed", reason: "timeout" }) && JSON.stringify(opsMailAggregateOf([])) === JSON.stringify({ status: "skipped", reason: "no_operators" })
  && mailReasonOf("http_429") === "http_429" && mailReasonOf("Bad Reason") === "error" && mailReasonOf(null) === null && OPS_INQUIRY_MAIL_ACTION === "ops.inquiry.mail"
  && opsInquiryMailLogOf({ event: "reply", status: "sent" }) === "店の返事のお知らせメール（この運営者あて）：送った" && opsLogWhatOf({ action: "ops.inquiry.mail", before: null, after: { event: "create", status: "skipped", reason: "no_key" } }) === "新しい問い合わせのお知らせメール（この運営者あて）：送っていない（no_key）");
check("(1-13) 確かめ用の会社には送らない（verify_org）", opsInquiryMailSkipOf("NOX-VERIFY-A") === "verify_org" && opsInquiryMailSkipOf("NOX-CHECK-1") === "verify_org" && opsInquiryMailSkipOf("CLUB TEST") === null && opsInquiryMailSkipOf(null) === "no_org");
check("(1-14) 番号と写しの 1 行・2 店舗目の料金の 1 行（金額を書かない）", inquiryNoOf(ID) === "0F1E2D3C" && inquiryAttachNoteOf(ID).includes("support@noxapp.jp") && inquiryAttachNoteOf(ID).includes("0F1E2D3C") && STORE_ADD_PRICE_NOTE === "店舗数に応じて料金が変わります。" && !/円/.test(STORE_ADD_PRICE_NOTE));
check("(1-15) 誤りの語（店）", /デモ/.test(inquiryErrJa("forbidden (demo)")) && /30 件/.test(inquiryErrJa("too many open")) && /新しく送って/.test(inquiryErrJa("closed")) && inquiryErrJa("forbidden") === "権限がありません" && /同じ名前/.test(inquiryErrJa("dup store")));
check("(1-16) 誤りの語（運営）", /理由/.test(opsInquiryErrJa("reason required")) && /1〜3/.test(opsInquiryErrJa("bad points")) && /付けません/.test(opsInquiryErrJa("no points")) && /1 回/.test(opsInquiryErrJa("already granted")) && /取り消し/.test(opsInquiryErrJa("already revoked")) && /運営者/.test(opsInquiryErrJa("forbidden")));
check("(1-17) 運営の記録の日本語（5 種・知らない action は null）", opsInquiryLogWhatOf("ops.inquiry.status", { status: "declined" }) === "問い合わせの状態を「見送り」に" && /\+3pt・残り 8pt/.test(opsInquiryLogWhatOf("ops.inquiry.points", { points: 3, balance: 8 }) ?? "") && opsInquiryLogWhatOf("ops.inquiry.reply", {}) !== null && opsInquiryLogWhatOf("ops.inquiry.points_revoke", { balance: 5 }) !== null && opsInquiryLogWhatOf("ops.inquiry.store_add", {}) !== null && opsInquiryLogWhatOf("ops.other", {}) === null
  && opsLogWhatOf({ action: "ops.inquiry.reply", before: null, after: {} }) === "問い合わせに返事をした" && opsLogWhatOf({ action: "ops.x", before: null, after: {} }) === "記録（ops.x）");
check("(1-18) マスタのカード＝旗とオーナー・店長・検索の語", inquiryCardShownOf({ flag: true, role: "owner" }) && inquiryCardShownOf({ flag: true, role: "manager" }) && !inquiryCardShownOf({ flag: true, role: "staff" }) && !inquiryCardShownOf({ flag: false, role: "owner" }) && inquiryCardHitOf("問い合わせ") && inquiryCardHitOf("不具合") && inquiryCardHitOf("") && !inquiryCardHitOf("ボトル"));

const rmail = opsInquiryReplyMailOf({ kind: "request", orgName: "CLUB TEST", inquiryId: ID });
check("(1-19) ★F1 店の返事のメール＝件名と番号とリンクだけ（中身は入れない）", rmail.subject === "【NOX】問い合わせに店から返事（要望）" && rmail.text.includes("件名：—") && rmail.text.includes(`https://noxapp.jp/ops/inquiries/${ID}`) && rmail.text.includes("会社：CLUB TEST") && rmail.text.includes("内容はメールに載せていません"));
check("(1-20) ★F1 見送りの理由＝運営の発言の 1 行（前後の空白を落とす）", inquiryDeclineMessageOf(" 仕様の範囲外です ") === "見送りにしました。理由：仕様の範囲外です");
check("(1-21) ★F1 上限に近い会社の印＝開いている 25 件から（残り 5 件以下）", INQUIRY_OPEN_NEAR === 25 && !inquiryOpenNearOf(24) && inquiryOpenNearOf(25) && inquiryOpenNearOf(30) && inquiryOpenNearTextOf(27) === "開いている 27／30 件");

// ── (2) 配線 ──
const route = src("app/api/inquiry/route.ts"), send = src("lib/nox/mail/send.ts");
check("(2-1) 旗 MIG_0212_APPLIED は true（2026-11-25 17:05:45 本番適用・相談役 11/25 の便 F1）", (MIG_0212_APPLIED as boolean) === true);
check("(2-2) 店の route＝旗 404・セッション 401・オーナーと店長・デモ 403・RPC inquiry_create（鍵つき）", route.includes('if (!mig0212On()) return NextResponse.json({ error: "not found" }, { status: 404 });') && route.includes("status: 401") && route.includes('if (role !== "owner" && role !== "manager")') && route.includes("demoGuardErr(orgId as string)") && route.includes('supabase.rpc("inquiry_create", { p_store_id: storeId, p_kind: kind, p_subject: subject, p_body: text, p_store_add: storeAdd, p_idem_key: idemKey })'));
const om = src("lib/nox/inquiry/ops-mail-server.ts");
check("(2-3) ★M2-5 メール＝送れた後だけ・宛先は有効な運営者の全員（0 人なら support@noxapp.jp）・記録が既にあれば送らない・結果は inquiry_mail_note と運営者ごとの ops_audit_logs・本文はメールに入れない", route.indexOf('supabase.rpc("inquiry_create"') < route.indexOf('notifyOperatorsOfInquiry(admin, { event: "create", inquiryId: id, orgId: orgId as string })') && route.includes('.eq("action", "inquiry_mail")') && route.includes('supabase.rpc("inquiry_mail_note", { p_inquiry: id, p_status: r.status, p_reason: r.reason })')
  && om.includes('admin.from("ops_operators").select("auth_user_id, email").eq("is_active", true)') && om.includes("if (!row || row.org_id !== o.orgId)") && om.includes('admin.from("ops_audit_logs").insert(') && om.includes("ops_user_id: x.auth_user_id") && om.includes("action: OPS_INQUIRY_MAIL_ACTION") && om.includes("await sendNoxMail({ to: OPS_INQUIRY_MAIL_TO, ...mail, idemKey: key })") && om.includes("idemKey: `${key}-${x.auth_user_id}`")
  && om.includes("subject: row.subject") && !/\bbody\b/.test(om.replace(/\/\/.*$/gm, "")) && !/console\.[a-z]+\([^)]*(email|\.to\b)/.test(om));
check("(2-4) ★F1 送る部品＝main の sendNoxMail（鍵が無ければ skipped・8 秒・Idempotency-Key・ログに宛先を出さない）・枝の仮の物は無い", send.includes('if (!key) return { status: "skipped", reason: "no_key" };') && send.includes("MAIL_TIMEOUT_MS = 8000") && send.includes('"Idempotency-Key"') && send.includes("ac.abort()") && !/console\.[a-z]+\([^)]*\bto\b/.test(send) && !send.includes("NOX_MAIL_FROM") && om.includes('import { sendNoxMail, type MailResult } from "@/lib/nox/mail/send";') && route.includes('import { notifyOperatorsOfInquiry, type OpsMailOutcome } from "@/lib/nox/inquiry/ops-mail-server";'));
check("(2-4b) ★F1 店の返事も route＝inquiry_reply の後・新しい行のときだけ運営へメール（同じ鍵の再送は送らない）", route.includes('if (b.action === "reply") return replyPost(supabase, b);') && route.includes('.eq("idem_key", idemKey).maybeSingle()') && route.includes('supabase.rpc("inquiry_reply", { p_inquiry: inquiryId, p_body: text, p_idem_key: idemKey })') && route.includes("if (!seen) {") && om.includes('(o.event === "reply" ? opsInquiryReplyMailOf : opsInquiryMailOf)') && route.indexOf('supabase.rpc("inquiry_reply"') < route.indexOf('notifyOperatorsOfInquiry(admin, { event: "reply", inquiryId, orgId: orgId as string, messageId: mid })')); // ★M2-5: 返事のメールの結果も運営者ごとに ops_audit_logs（起票163 を閉じた）
const board = src("app/(manage)/master/inquiry/inquiry-board.tsx"), page = src("app/(manage)/master/inquiry/page.tsx");
check("(2-5) 店の画面＝POST /api/inquiry・返事は inquiry_reply（鍵）・開くと inquiry_mark_read・閉じたら返事の欄を出さない・デモは送れない", board.includes('fetch("/api/inquiry"') && board.includes('JSON.stringify({ action: "reply", inquiryId: cur.id, body: v, idemKey: replyKey })') && !board.includes('rpc("inquiry_reply"') && board.includes('supabase.rpc("inquiry_mark_read", { p_inquiry: r.id })') && board.includes("inquiryClosedOf(cur.status) || isDemo") && board.includes("{isDemo ? <div"));
check("(2-6) ポイントはオーナーだけ読む・見せる（店長は null）・添付なし（写しの 1 行）・2 店舗目は料金の 1 行", page.includes('role === "owner" ? supabase.from("ops_point_entries")') && board.includes("{pts && <p") && board.includes("inquiryAttachNoteOf(") && !/type="file"/.test(board) && board.includes("{STORE_ADD_PRICE_NOTE}"));
const mb = src("app/(manage)/master/master-board.tsx"), mp = src("app/(manage)/master/page.tsx");
check("(2-7) マスタ › 店舗・運用にカード（旗とオーナー・店長）・MASTER_NAV は変えない", mp.includes("inquiryCardShownOf({ flag: mig0212On(), role })") && mb.includes('const inquiryHere = g.key === "store" && showInquiry && inquiryCardHitOf(hubSearch);') && mb.includes('data-hub-inquiry="1"'));
const pend = src("app/api/home/pending/route.ts"), card = src("components/nox/pending-card.tsx");
check("(2-8) 要承認の route＝オーナーと店長・旗の後ろ・未読を数えてベルの数に足す（今の式は変えない）", pend.includes('if ((role === "owner" || role === "manager") && mig0212On()) {') && pend.includes("pendingTotalOf({ approvals, wishes, missingOut, reservations, drinkClaims }) + supportAskCountOf(supportAsk) + inquiryReplyCountOf(inquiryReplies)"));
check("(2-9) カード＝「運営から」の小見出しの下に問い合わせの返事とサポート許可の頼み・問い合わせを開く", card.includes('data-pending-ops-head="1"') && card.includes(">運営から</li>") && card.includes("data-pending-inquiry={data.inquiryReplies}") && card.includes("<Link href={INQUIRY_PATH}") && card.indexOf('data-pending-ops-head="1"') < card.indexOf("data-pending-support-ask={data.supportAsk.id}"));
const opsRoute = src("app/api/ops/inquiries/[id]/route.ts"), opsList = src("app/ops/inquiries/page.tsx"), opsDetail = src("app/ops/inquiries/[id]/inquiry-detail.tsx"), shell = src("app/ops/ops-shell.tsx"), asp = src("app/ops/orgs/[id]/add-store-panel.tsx");
check("(2-10) 運営の route＝requireOperatorApi が先・旗・5 つの操作が service 専用の関数（p_ops）", /const g = await requireOperatorApi\(\);\s*\n\s*if \(g\.res\) return g\.res;/.test(opsRoute) && opsRoute.includes("if (!mig0212On())") && ["ops_inquiry_reply", "ops_inquiry_set_status", "ops_inquiry_point_grant", "ops_inquiry_point_revoke", "ops_inquiry_store_add"].every((f) => opsRoute.includes(`admin.rpc("${f}", { p_ops,`)));
check("(2-11) /ops＝一覧（未対応 N 件・絞り込み）・詳細（返事・状態・ポイント・取り消し・店を追加）・上の帯にリンク（旗の後ろ）", opsList.includes("data-ops-inquiry-waiting={waiting.length}") && opsList.includes("if (!mig0212On()) notFound();") && ["data-ops-inquiry-reply", "data-ops-inquiry-status", "data-ops-inquiry-grant", "data-ops-inquiry-revoke"].every((x) => opsDetail.includes(x)) && opsDetail.includes("<AddStorePanel orgId={row.org_id} stores={stores} inquiryId={row.id}") && shell.includes('{mig0212On() && <Link href="/ops/inquiries"'));
check("(2-12) 店を追加の部品＝依頼から足すときだけ問い合わせの route（今の stores の route は変えない）", asp.includes("const r = inquiryId") && asp.includes('body: JSON.stringify({ action: "store_add", name: name.trim(), bizType: biz, copyFrom: from || null, parts: from ? parts : [] })') && src("app/api/ops/orgs/[id]/stores/route.ts").includes('rpc("ops_store_add", { p_ops: g.op.authUserId, p_org_id: id,'));
check("(2-18) ★M2-2・M2-3 店を追加＝業態の初めの値（依頼の中身→設定を写す元の店の業態）・足りない欄はその欄の横に赤（文字と枠）・ボタンの近くの理由も赤", addStoreInitialBizOf({ requested: "bar", fromBiz: "host" }) === "bar" && addStoreInitialBizOf({ requested: "", fromBiz: "host" }) === "host" && addStoreInitialBizOf({ fromBiz: "club" }) === "" && addStoreInitialBizOf({}) === ""
  && JSON.stringify(addStoreFieldErrsOf({ name: " ", biz: "", from: "s1", parts: 0 })) === JSON.stringify({ name: "店名を入れてください", biz: "業態を選んでください", parts: "写すものを 1 つ以上選んでください（写さないなら「写さない」に）" }) && addStoreFieldErrsOf({ name: "a", biz: "bar", from: "", parts: 0 }).parts === null && addStoreBlockedOf({ name: "a", biz: "", from: "", parts: 0 }) === addStoreFieldErrsOf({ name: "a", biz: "", from: "", parts: 0 }).biz
  && asp.includes("addStoreInitialBizOf({ requested: initial?.biz ?? null, fromBiz: initialFrom ? bizOfStore(initialFrom) : null })") && asp.includes('{errLine(fe.biz, "biz")}') && asp.includes('{errLine(fe.name, "name")}') && asp.includes('{errLine(fe.parts, "parts")}') && asp.includes("{ ...OPS_ERR_TEXT_STYLE, textAlign: \"center\" }") && !asp.includes("{ ...t.sub, fontSize: 12, margin: 0, textAlign: \"center\" }")
  && src("lib/nox/ops/view.ts").includes('color: "var(--danger)"') && src("app/ops/orgs/[id]/page.tsx").includes("biz: bizOf.get(s.id) ?? null") && src("app/ops/inquiries/[id]/page.tsx").includes("biz: typeof s.settings_json?.biz_type === \"string\"")
  && ["app/ops", "app/ops/orgs/[id]", "app/ops/inquiries/[id]", "app/ops/orgs/[id]/assist"].every((d) => fs.readdirSync(d).filter((f) => f.endsWith(".tsx")).every((f) => !src(`${d}/${f}`).includes('<Message kind="warn">'))));
check("(2-19) ★M2-6・M2-1 語＝「店舗の追加の依頼」「設定を写す元の店」「同じ会社に店を足します」・旧い語は画面に無い（注記は除く）・ログインの文", asp.includes("同じ会社に店を足します。") && asp.includes("設定を写す元の店（初期設定が済んだ店）") && board.includes("設定を写す元の店（初期設定が済んだ店）") && opsDetail.includes("<h2 style={h2}>店舗の追加の依頼</h2>")
  && storeAddErrJa("copy from not ready") === "設定を写す元の店の初期設定が済んでいません" && storeCopyErrJa("x") === "設定を写す元の店から写せませんでした" && inquiryErrJa("copy from not ready") === "設定を写す元の店の初期設定が済んでいません" && opsInquiryErrJa("not store add") === "店舗の追加の依頼ではありません"
  && [asp, board, opsDetail, src("lib/nox/inquiry/labels.ts"), src("lib/nox/ops/store-add.ts"), src("lib/nox/setup/copy-plan.ts")].every((x) => !/"[^"\n]*(2 店舗目|1 店目から写す|同じ会社の 2 店目|写し元)[^"\n]*"/.test(x.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"2 店舗目", /, "")))
  && LOGIN_FAIL_TEXT === "ログインできません。メールアドレスかパスワードをご確認ください");
const dg = src("scripts/verify-nox-demo-guard.ts");
check("(2-13) demo-guard の分類＝inquiry は柵 A・ops/inquiries/[id] は運営の群", dg.includes('"inquiry": "app/api/inquiry/route.ts"') && dg.includes('"ops/inquiries/[id]"'));
check("(2-14) ★F1→2026-11-26 張り替え：3 表はデモの消さない名簿（service_role に SELECT しか無い＝route が消すと reset が止まる・FK は cascade／set null で wipe を止めない）・消す名簿には無い", MIG_0212_APPLIED && ["ops_inquiries", "ops_inquiry_messages", "ops_point_entries"].every((x) => DEMO_KEEP_EXTRA.includes(x) && !DEMO_PREWIPE_TABLES.includes(x)));
check("(2-16) ★F1 見送りにした時だけ理由を運営の返事として 1 行（状態が変わった時だけ）・運営の一覧に上限に近い会社の印", opsRoute.includes('if (!r.error && r.data === true && s(b.status) === "declined") {') && opsRoute.includes("inquiryDeclineMessageOf(s(b.reason))") && opsList.includes('.in("status", ["received", "checking"])') && opsList.includes("data-ops-inquiry-near={near.length}") && opsList.includes("data-ops-inquiry-near-row") && opsList.includes("<OpsShell name={op.name} role={op.role} waiting={waiting.length}>"));
const opsHome = src("app/ops/page.tsx"), orgListSrc = src("app/ops/org-list.tsx"), wq = src("lib/nox/ops/inquiry-waiting.ts");
check("(2-17) ★M2-4 上の帯の「問い合わせ」に未対応の赤い数（0 は出さない）・一覧の上に未対応のカード（会社名・種類・件名・届いた時刻・開くは中央・0 件は出さない）・会社の行に赤い印・数え方は opsInquiryWaitingOf と同じ線", shell.includes('{waiting ? <span className="nox-tab-badge" data-ops-nav-waiting={waiting}>{waiting}</span> : null}')
  && opsList.includes("{waiting.length > 0 && (") && opsList.includes("data-ops-inquiry-waiting-card={r.id}") && opsList.includes('justifyContent: "center"') && opsList.includes("届いた時刻 {inquiryAtOf(r.last_at)}") && opsList.includes('<span className="nox-stpill bad">未対応</span>')
  && opsHome.includes("<OrgList rows={(data ?? []) as OpsOrgRow[]} billing={billing} nowIso={new Date().toISOString()} waitingBy={waitingBy ?? {}} />") && orgListSrc.includes("data-ops-row-waiting={n}") && (orgListSrc.match(/\{waitMark\(r\.org_id\)\}/g) ?? []).length === 2
  && wq.includes('.eq("last_from", "store").in("status", [...OPS_WAITING_STATUSES])') && wq.includes('OPS_WAITING_STATUSES = ["received", "checking"]') && opsInquiryWaitingOf({ last_from: "store", status: "received" }) && !opsInquiryWaitingOf({ last_from: "store", status: "declined" })
  && ["app/ops/me/page.tsx", "app/ops/orgs/new/page.tsx", "app/ops/operators/page.tsx", "app/ops/orgs/[id]/assist/page.tsx", "app/ops/orgs/[id]/page.tsx"].every((p) => src(p).includes("waiting={await opsInquiryWaitingCountOf(")) && src("app/ops/inquiries/[id]/page.tsx").includes("waiting={waiting}"));
const gate = src("docs/NOX_課金ゲート対象_v1.md");
check("(2-15) 課金ゲートの正本に B(am)（店の 4 本＝運用除外・運営の 5 本＝構造除外）", gate.includes("### B(ao). 0212 新設の除外（9本") && ["inquiry_create", "inquiry_reply", "inquiry_mark_read", "inquiry_mail_note", "ops_inquiry_reply", "ops_inquiry_set_status", "ops_inquiry_point_grant", "ops_inquiry_point_revoke", "ops_inquiry_store_add"].every((f) => gate.includes(f)));

// ── (3) DB（旗 true のときだけ） ──
async function db3() {
  const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
  const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "nox-verify-inquiry" });
  await db.connect();
  const tx = pgTx(db);
  try {
    await db.query("begin");
    const uid = async (email: string) => ({ auth_user_id: (await tx.one<{ a: string }>("select auth_user_id a from users where email = $1", [email])).a });
    const owner = await uid("nox-verify-owner-a@example.com"), mgr = await uid("nox-verify-manager-a1@example.com"), other = await uid("nox-verify-manager-b1@example.com"), staff = await uid("nox-verify-staff-a1@example.com");
    const A1 = await tx.one<{ id: string }>("select id from stores where name = 'NOX-VERIFY-A1'");
    const op = (await tx.one<{ id: string }>("select auth_user_id id from ops_operators where is_active limit 1")).id;
    const c = await tx.as(owner, "select public.inquiry_create($1, 'bug', 'NOX-VERIFY 0212', '本文', null, gen_random_uuid()) id", [A1.id]);
    const q = c.ok ? String(c.rows[0].id) : "";
    const an = await tx.as("anon", "select public.inquiry_create($1, 'bug', 'x', 'x', null, gen_random_uuid())", [A1.id]);
    const st = await tx.as(staff, "select public.inquiry_create($1, 'bug', 'x', 'x', null, gen_random_uuid())", [A1.id]);
    const au = await tx.as(owner, "select public.ops_inquiry_reply($1, $2, 'x', gen_random_uuid())", [op, q]);
    check("(3-1) オーナーが送れる・anon と運営の関数を authenticated で BLOCKED・スタッフ forbidden", c.ok && !an.ok && /permission denied for function/.test(an.err) && !au.ok && /permission denied for function/.test(au.err) && !st.ok && /forbidden/.test(st.err), [c, an, au, st].map((r) => tx.errOf(r)));
    const o = await tx.call("select public.ops_inquiry_reply($1, $2, '確認します', gen_random_uuid())", [op, q]);
    const n1 = await tx.as(mgr, "select count(*)::int n from ops_inquiries where last_from = 'ops' and store_read_at is null");
    const n2 = await tx.as(other, "select count(*)::int n from ops_inquiries");
    const dcl = await tx.call("select public.ops_inquiry_set_status($1, $2, 'declined', '範囲外') v", [op, q]);
    const dr = await tx.call("select public.ops_inquiry_reply($1, $2, '見送りにしました。理由：範囲外', gen_random_uuid()) v", [op, q]);
    const dv = await tx.as(mgr, "select i.status, (select count(*)::int from ops_inquiry_messages m where m.inquiry_id = i.id and m.from_ops and m.body like '見送りにしました。理由：%') n from ops_inquiries i where i.id = $1", [q]);
    check("(3-3) ★F1 見送りの後も運営は返事を足せる＝状態は見送りのまま・理由の 1 行が店長に見える", dcl.ok && dr.ok && dv.ok && dv.rows[0]?.status === "declined" && Number(dv.rows[0]?.n) === 1, [tx.errOf(dcl), tx.errOf(dr), dv.ok ? dv.rows : dv.err]);
    check("(3-2) 運営の返事＝店長に未読 1・他社 0", o.ok && n1.ok && Number(n1.rows[0].n) >= 1 && n2.ok && Number(n2.rows[0].n) === 0, [tx.errOf(o), n1.ok ? n1.rows : n1.err, n2.ok ? n2.rows : n2.err]);
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}
(async () => {
  if (MIG_0212_APPLIED) await db3(); else console.log("verify:nox-inquiry (3) DB は旗 MIG_0212_APPLIED=false のため飛ばす（試走 docs/tmp/inquiry_1125/try-0212.mts）");
  if (fails.length) { console.error(`verify:nox-inquiry FAIL ${fails.length}（OK ${pass}）`); process.exit(1); }
  console.log(`verify:nox-inquiry OK (${pass} checks)`);
})().catch((e) => { console.error(e); process.exit(1); });
