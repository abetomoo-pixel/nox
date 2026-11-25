// verify:nox-punch-round（起票159・相談役 11/24 夜の決め）— 店舗設定の「勤務時間の丸め」と同意＝DB に触れない純関数と配線の照合
//   (1) 判定と patch＝DB の線（単位 1／5／10／15／30・向き 3 つ・変えるときに単位 > 1 は同意の版 v1・1 分へ戻すのは版なし）
//   (2) 配線＝店舗設定のシフトと打刻のタブ・set_store_profile の 3 キーだけ・同意は BANZEN の文（初期設定と同じ定数）
import fs from "node:fs";
import { punchRoundErrOf, punchRoundPatchOf, punchRoundLineOf, punchRoundErrJa, PUNCH_ROUND_UNIT_OPTIONS, PUNCH_ROUND_MODE_OPTIONS } from "../lib/nox/punch/round-form";
import { PUNCH_ROUND_CONSENT_VERSION, PUNCH_ROUND_CONSENT_TEXT } from "../lib/nox/setup/v5";

let n = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean, detail?: unknown) => { n++; if (!cond) fails.push(`${label} ${detail === undefined ? "" : JSON.stringify(detail)}`); };
const J = (x: unknown) => JSON.stringify(x);
const none = { unit: 1, mode: "nearest" as const };

ok("(1-1) 単位の選択肢は DB と同じ 5 つ", J(PUNCH_ROUND_UNIT_OPTIONS.map(([v]) => v)) === J(["1", "5", "10", "15", "30"]));
ok("(1-2) 向きは DB と同じ 3 つ", J(PUNCH_ROUND_MODE_OPTIONS.map(([v]) => v).sort()) === J(["nearest", "staff_favor", "store_favor"]));
ok("(1-3) 変更なしは保存しない", punchRoundErrOf(none, none, false) === "変更がありません");
ok("(1-4) 単位 > 1 で同意なしは止める", punchRoundErrOf(none, { unit: 15, mode: "staff_favor" }, false) !== null);
ok("(1-5) 単位 > 1 で同意ありは通す", punchRoundErrOf(none, { unit: 15, mode: "staff_favor" }, true) === null);
ok("(1-6) 1 分へ戻すのは同意なしで通す", punchRoundErrOf({ unit: 15, mode: "staff_favor" }, none, false) === null);
ok("(1-7) 向きだけ変える（単位 > 1）も同意が要る＝DB の 'consent required' と同じ", punchRoundErrOf({ unit: 15, mode: "nearest" }, { unit: 15, mode: "store_favor" }, false) !== null);
ok("(1-8) DB に無い単位は止める", punchRoundErrOf(none, { unit: 20, mode: "nearest" }, true) !== null);
ok("(1-9) patch＝同意ありの単位 > 1 だけ版 v1 を送る", J(punchRoundPatchOf({ unit: 10, mode: "nearest" }, true)) === J({ punch_round_unit: 10, punch_round_mode: "nearest", punch_round_consent_version: PUNCH_ROUND_CONSENT_VERSION }) && PUNCH_ROUND_CONSENT_VERSION === "v1");
ok("(1-10) patch＝1 分は版を送らない", J(punchRoundPatchOf(none, true)) === J({ punch_round_unit: 1, punch_round_mode: "nearest" }));
ok("(1-11) 1 行の表示", punchRoundLineOf(none) === "丸めない（1 分）" && punchRoundLineOf({ unit: 15, mode: "staff_favor" }) === "15 分・働く人に有利");
ok("(1-12) 英語の理由は日本語に", /同意/.test(punchRoundErrJa("consent required")) && /オーナー/.test(punchRoundErrJa("forbidden")) && !/[a-z]{4}/.test(punchRoundErrJa("x y z")));
ok("(1-13) 同意の文は BANZEN と同じ", PUNCH_ROUND_CONSENT_TEXT === "日々の労働時間の切り捨ては労働基準法の賃金全額払いの原則に抵触するおそれがあります。設定はお客様の判断と責任で行ってください。");

const page = fs.readFileSync("app/(manage)/master/store-profile/page.tsx", "utf8");
const panel = fs.readFileSync("app/(manage)/master/punch-round-panel.tsx", "utf8");
ok("(2-1) 店舗設定のシフトと打刻のタブに出す", page.includes('{tab === "shift" && <PunchRoundPanel stores={stores} isOwner={isOwner} />}'));
ok("(2-2) 保存は旗 false＝set_store_profile・旗 true（0213）＝set_punch_round の 2 本だけ・引数は純関数から", (panel.match(/\.rpc\(/g) ?? []).length === 2 && panel.includes('rpc("set_punch_round", punchRoundArgsOf(storeSel, form, consent))') && panel.includes('rpc("set_store_profile", { p_store_id: storeSel, p_patch: punchRoundPatchOf(form, consent) })'));
ok("(2-3) 同意の文とチェックは初期設定と同じ定数", panel.includes("{PUNCH_ROUND_CONSENT_TEXT}") && panel.includes("{PUNCH_ROUND_CONSENT_LABEL}"));
ok("(2-4) オーナー以外は押せない・同意が要るときはチェックまで押せない", panel.includes("disabled={!isOwner || busy || !changed || (needConsent && !consent)}"));
ok("(2-5) 遅刻の判定は丸める前の時刻のまま、と画面に書く", panel.includes("遅刻の判定は丸める前の時刻のままです"));

if (fails.length) { console.error(fails.join("\n")); console.error(`verify:nox-punch-round FAIL ${fails.length} / ${n}`); process.exit(1); }
console.log(`verify:nox-punch-round ALL PASS (${n} assertions)`);
