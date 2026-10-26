/*
 * verify:nox-qr — QR 便（2026-10-26・裁定423 変更＝Agoora 確定 10/26 ⑫・0185 起草）: キオスクの QR の向きを逆に。DB 不触（純関数＋逐語 grep＋0185 の形）。
 *  ① キオスクが QR を出す（端末の秘密鍵の TOTP・30 秒・URL＝origin/kq#noxq:<device>.<6 桁>）・使用済みの counter の次から出す（1 回限り）
 *  ② スマホ（ログイン済みの本人）が読む＝標準カメラ（URL）でも NOX の画面のカメラでも・kiosk_qr_claim・結果の文言（used／期限切れ／punch_only ほか）
 *  ③ そのキオスクが本人の権限で開く＝kiosk_qr_poll→onUnlocked・無操作 3 分（QR だけ・PIN は従来）
 *  ④ 旧向き（スマホに QR・キオスクのカメラ）の撤去＝client から my_qr_secret／kiosk_unlock_qr／カメラの読取を外す・全画面 QR の部品を削除・0185 で本体を retired
 *  ⑤ PIN（4〜6 桁）は維持・フラグ MIG_0185_APPLIED false（mjs と同値）の間は QR のタブ・スマホの入口・/kq は出ない
 *  ⑥ 本番の不具合（0175 ★27 の 4 本の search_path・kiosk_unlock の min(uuid)）を 0185 で直す・それまでレジ端末は従来の解除
 *  逆テスト（手動・各 1 回）: kioskQrDisplayCounterOf の +1 を外す→qr(1-2) 赤／kiosk-register の idleMsRef を IDLE_MS 固定に戻す→qr(3-1) 赤。
 */
import fs from "node:fs";
import { createHmac } from "node:crypto";
import {
  KIOSK_QR_IDLE_SEC, counterBytesOf, kioskIdleMsOf, kioskQrClaimMessageOf, kioskQrDisplayCounterOf, kioskQrTokenFromScanOf, kioskQrTokenOf, kioskQrUrlOf, parseKioskQrToken, totpCodeFromHmac,
} from "../lib/nox/rules-0175/kiosk-qr";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const DEV = "8e190b83-185a-57e6-84c6-a9e7f1e2caa3";

// ① キオスクが QR を出す
const RFC_SECRET = Buffer.from("12345678901234567890").toString("hex");
const code1 = totpCodeFromHmac(new Uint8Array(createHmac("sha1", Buffer.from(RFC_SECRET, "hex")).update(Buffer.from(counterBytesOf(1))).digest()));
const tok = kioskQrTokenOf(DEV, code1);
const url = kioskQrUrlOf("https://nox.example/", tok);
check("qr(1-1) トークン＝'noxq:<device>.<TOTP 6 桁>'（RFC 6238 の検証値 287082）・QR の中身＝origin/kq#トークン（# の後＝サーバに送られない）", code1 === "287082" && tok === `noxq:${DEV}.287082` && url === `https://nox.example/kq#noxq:${DEV}.287082` && parseKioskQrToken(tok)?.deviceId === DEV && parseKioskQrToken(`noxk:${DEV}.287082`) === null, { tok, url });
check("qr(1-2) 1 回限り＝使用済みの counter の次から出す（今＝使用済み→+1・使用済みが過去→今）", kioskQrDisplayCounterOf(100, 100) === 101 && kioskQrDisplayCounterOf(100, 99) === 100 && kioskQrDisplayCounterOf(100, null) === 100 && kioskQrDisplayCounterOf(100, 101) === 102);
const disp = src("components/nox/kiosk-qr-display.tsx");
check("qr(1-3) 表示の部品＝kiosk_qr_secret（端末）・30 秒で描き直し（renderSVG・URL）・kiosk_qr_poll は 2 秒ごと（この画面の間だけ）・読まれたら onUnlocked（unlock_method qr）", disp.includes('rpc("kiosk_qr_secret", { p_rotate: false })') && disp.includes("renderSVG(kioskQrUrlOf(window.location.origin, kioskQrTokenOf(secret.device_id, code)), { border: 1 })") && disp.includes('await supabase.rpc("kiosk_qr_poll");') && disp.includes("}, 2000);") && disp.includes('unlock_method: "qr" });'));

// ② スマホが読む
check("qr(2-1) 読み取り＝URL でも生のトークンでも（# の後）・キオスク用でなければ null", kioskQrTokenFromScanOf(url) === tok && kioskQrTokenFromScanOf(tok) === tok && kioskQrTokenFromScanOf(` ${tok} `) === tok && kioskQrTokenFromScanOf("https://nox.example/kq#noxk:bad") === null && kioskQrTokenFromScanOf("hello") === null);
const msgs = ["used", "wrong_token", "bad_token", "locked", "punch_only", "no_permission", "other_store", "x"].map((reason) => kioskQrClaimMessageOf({ ok: false, reason }));
check("qr(2-2) 結果の文言＝開いた（店・名前・3 分）／使用済み／期限切れ／キオスク用でない／ロック／キャストのレジ操作 OFF＝打刻だけ／権限なし／別の店", kioskQrClaimMessageOf({ ok: true, store_name: "CLUB ACE", name: "林" }).text.includes("CLUB ACE・林") && msgs[0].text.includes("使用済み") && msgs[1].text.includes("期限") && msgs[4].text.includes("打刻") && msgs[4].kind === "warn" && msgs[5].text.includes("権限") && msgs[6].text.includes("別の店") && new Set(msgs.map((m) => m.text)).size === msgs.length, msgs.map((m) => m.text));
const kq = src("app/kq/kq-client.tsx"), kp = src("app/kq/page.tsx");
check("qr(2-3) スマホの画面（/kq）＝フラグ false は 404・未ログインはログインへ・# のトークンは読んだら URL から消す・確認「このキオスクを開きますか？」→kiosk_qr_claim・カメラ（BarcodeDetector→jsQR）", kp.includes("if (!mig0185On()) notFound();") && kq.includes('window.history.replaceState(null, "", window.location.pathname);') && kq.includes('rpc("kiosk_qr_claim", { p_token: tok })') && kq.includes("このキオスクを開きますか？") && kq.includes('if (!data.user) { setPhase("login"); return; }') && kq.includes("jsQR.min.js"));
const mp = src("app/mine/page.tsx");
check("qr(2-4) /mine の入口＝「キオスクを開く（QR を読む）」（フラグ true の間だけ）・旧「キオスク用 QR」（全画面 QR）の部品は削除", mp.includes('{rules0175On() && mig0185On() && (') && mp.includes("キオスクを開く（QR を読む）") && !mp.includes("KioskQrButton") && !fs.existsSync("components/nox/kiosk-qr-modal.tsx"));

// ③ 本人の権限で開く・無操作 3 分
const kr = src("app/kiosk-register/page.tsx");
check("qr(3-1) 無操作＝QR は 3 分（店設定が短ければ店設定）・PIN は従来（15 分）・キオスクの時計が idleMsRef を見る・表示とロックの文言も分数", KIOSK_QR_IDLE_SEC === 180 && kioskIdleMsOf("qr", 900) === 180_000 && kioskIdleMsOf("qr", 120) === 120_000 && kioskIdleMsOf("pin", 900) === 900_000 && kioskIdleMsOf("qr", null) === 180_000 && kr.includes('idleMsRef.current = j.unlock_method === "qr" ? kioskIdleMsOf("qr", j.idle_sec) : IDLE_MS;') && kr.includes("Date.now() - lastActionRef.current > idleMsRef.current") && kr.includes("分で自動ロック）"));

// ④ 旧向きの撤去
const pad = src("components/nox/kiosk-unlock-pad.tsx");
const clientFiles = ["components/nox/kiosk-unlock-pad.tsx", "components/nox/kiosk-qr-display.tsx", "app/kq/kq-client.tsx", "app/mine/page.tsx", "app/kiosk-register/page.tsx"];
check("qr(4-1) 旧向き＝client から my_qr_secret／kiosk_unlock_qr を呼ばない・キオスクの解除パッドにカメラ（getUserMedia）が無い・旧トークン 'noxk:' の組み立てが無い", clientFiles.every((f) => !src(f).includes('"my_qr_secret"') && !src(f).includes('"kiosk_unlock_qr"')) && !pad.includes("getUserMedia") && !src("lib/nox/rules-0175/kiosk-qr.ts").includes("`noxk:"));
check("qr(4-2) PIN（4〜6 桁）は維持＝kiosk_unlock・QR のタブは mig0185On() の間だけ（KioskQrDisplay）", pad.includes('supabase.rpc("kiosk_unlock", { p_pin: pin, p_membership_id: membershipId ?? null })') && pad.includes("const qrOk = mig0185On();") && pad.includes('{tab === "qr" && qrOk && <KioskQrDisplay onUnlocked={onUnlocked} />}'));

// ⑤ フラグ
const fl = src("lib/nox/rules-0175/flag.ts"), fm = src("scripts/demo/rules-0175-flag.mjs");
check("qr(5-1) フラグ MIG_0185_APPLIED＝false（mjs と同値）・読み口 mig0185On", /export const MIG_0185_APPLIED = false;/.test(fl) && /export const MIG_0185_APPLIED = false;/.test(fm) && fl.includes("export function mig0185On(): boolean { return override0185 ?? MIG_0185_APPLIED; }"));

// 0185 の形（起草ファイルがあるときだけ）
const P = "supabase/migrations/0185_kiosk_qr_reverse.sql";
const m = fs.existsSync(P) ? src(P) : "";
check("qr(6-1) 0185＝単一トランザクション・貼り先証明・表 2 本（RLS・revoke all・policy 0）・RPC 3 本（authenticated のみ）・端末×counter の一意（1 回限り）・権限は PIN と同じ式（cast は sys_cast_register≥1 でなければ punch_only）・QR の無操作 least(180)・旧 2 本は retired（起草ファイルがあるときだけ）", m === "" || (m.includes("\nbegin;\nselect 'nox-project-proof', count(*) from public.orgs;") && m.trimEnd().endsWith("-- ===== end 0185 =====") && m.includes("revoke all on table public.kiosk_qr_keys from public, anon, authenticated;") && m.includes("revoke all on table public.kiosk_qr_claims from public, anon, authenticated;") && m.includes("create unique index if not exists kiosk_qr_claims_device_counter on public.kiosk_qr_claims (device_id, counter);") && ["kiosk_qr_secret(boolean)", "kiosk_qr_claim(text)", "kiosk_qr_poll()"].every((f) => m.includes(`revoke execute on function public.${f} from public, anon;`) && m.includes(`grant execute on function public.${f} to authenticated;`)) && m.includes("if v_m.role = 'cast' and not (coalesce(v_m.can_register, false) and v_sys >= 1) then return jsonb_build_object('ok', false, 'reason', 'punch_only'); end if;") && m.includes("on conflict (device_id, counter) do nothing") && m.includes("then least(180, coalesce(") && (m.match(/raise exception 'retired: kiosk QR direction changed \(0185\)';/g) ?? []).length === 2 && m.includes("perform public.audit_log_write('kiosk_qr_claim',")));

check("qr(6-2) 本番の不具合＝0175 の 4 本の search_path（'public, extensions'＝1 つの名前）と kiosk_unlock の min(uuid)＝0185 で直す（新設も含めて引用の壊れた形が 0）・0185 の手貼りまでレジ端末は従来の「操作担当を選んで PIN」（kiosk_login）", (m === "" || (m.includes("select count(*), (array_agg(m.id))[1], jsonb_agg(") && !m.includes("SET search_path TO 'public, extensions'") && m.includes("CREATE OR REPLACE FUNCTION public.totp_code_of(p_secret_hex text, p_counter bigint)") && m.includes("CREATE OR REPLACE FUNCTION public.kiosk_unlock(p_pin text, p_membership_id uuid"))) && kr.includes("{phase === \"operator\" && rules0175On() && mig0185On() && (") && kr.includes("{phase === \"operator\" && !(rules0175On() && mig0185On()) && ("));
if (fails.length) { console.error(`verify:nox-qr FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-qr OK ${pass} checks（QR 便＝キオスクの QR の向き・裁定423 変更）`);
