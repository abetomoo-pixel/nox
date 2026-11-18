/*
 * verify:nox-close1118 — 2026-11-18 夜 2（相談役 ①②）。DB 不触・env 不要。
 *  c(1) 締めの窓：押した時点で未会計か実査の未入力があれば締めずに中央の窓（見出し・理由・未会計の伝票を見る／未会計のまま締める（店長・オーナー）／このまま締める／閉じる）。
 *  c(2) 「未会計があっても強行」のチェックは外した・強行（p_force）は窓からだけ・ボタンのすぐ上に理由の 1 行・再締めも未会計は同じ窓。
 *  c(3) 明細のスライドの行（≤430px）：2 行目は折り返す（nowrap とはみ出しのスクロールをやめる）・文字の自動拡大の止め・大きさはほかの行と同じ。
 */
import fs from "node:fs";
import { closeBlockedLineOf, closeGuardReasonsOf, closeGuardTitleOf } from "../lib/nox/report/close-guard";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const rb = fs.readFileSync("app/(manage)/report/report-board.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

check("c(1-1) 文言：見出し・理由（未会計 n 件・実査の未入力の問い）・ボタンの上の 1 行",
  closeGuardTitleOf({ openN: 4, countedMissing: false }) === "まだ締められません" && closeGuardTitleOf({ openN: 0, countedMissing: true }) === "実査が未入力です"
  && JSON.stringify(closeGuardReasonsOf({ openN: 4, countedMissing: true })) === JSON.stringify(["未会計の伝票が 4 件あります", "実査（数えた現金）が未入力です。このまま締めますか"])
  && closeBlockedLineOf(4) === "未会計 4 件のため、このままでは締められません");
check("c(1-2) 押した時点で未会計（open の伝票の数）と実査の空欄を確かめ、あれば窓を出して締めない",
  rb.includes("const openN = opts?.forced ? 0 : await openCheckCountNow();") && rb.includes('const countedMissing = !opts?.countedOk && counted === "";') && rb.includes('if (openN > 0 || countedMissing) { setCloseGuard({ openN, countedMissing, mode: "close" }); return; }')
  && rb.includes('.from("checks").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "open")'));
check("c(1-3) 窓のボタン：未会計の伝票を見る（レジ）・未会計のまま締める（isManagerUp だけ）・このまま締める（実査だけのとき）・閉じる",
  rb.includes('data-close-guard-see="1">未会計の伝票を見る</a>') && rb.includes("{closeGuard.openN > 0 && isManagerUp && (") && rb.includes('data-close-guard-force="1"') && rb.includes(">未会計のまま締める</button>")
  && rb.includes('data-close-guard-counted="1"') && rb.includes(">このまま締める</button>") && rb.includes('data-close-guard-close="1">閉じる</button>') && rb.includes('<Modal onClose={() => setCloseGuard(null)} maxWidth={440} variant="dialog">') && fs.readFileSync("app/globals.css", "utf8").includes(".nox-modal-dialog { align-items: center; padding: 16px; }"));
check("c(2-1) 強行のチェックボックスは無い・p_force は窓からの forced だけ（締め・再締めとも）",
  !rb.includes("未会計があっても強行</label>") && !rb.includes("onChange={(e) => setForce(e.target.checked)}") && rb.includes("p_force: forced, p_idem_key: crypto.randomUUID(), // ★便 X13-G W-24") && (rb.match(/p_force: forced/g) ?? []).length === 2 && !rb.includes("p_force: force,"));
check("c(2-2) ボタンのすぐ上に理由の 1 行（未会計があるとき）・再締めも未会計は同じ窓（実査は聞かない）",
  rb.includes('data-close-reason="open"') && rb.indexOf('data-close-reason="open"') < rb.indexOf('data-close-submit="1"') && rb.includes('setCloseGuard({ openN, countedMissing: false, mode: "reclose", reportId })') && rb.includes("void recloseFromForm(g.reportId, true)"));
check("c(3-1) 明細のスライドの行（≤430px）：2 行目は折り返す・はみ出しのスクロールをやめる・文字の自動拡大の止め",
  css.includes("@media (max-width: 430px) { .nox-bd-l2 { display: block; margin-left: 0; white-space: normal; overflow-wrap: anywhere; font-size: inherit; } }")
  && css.includes(".nox-bd-row, .nox-bd-l2 { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }") && !css.includes(".nox-bd-l2 { display: block; margin-left: 0; white-space: nowrap; overflow-x: auto; }"));

if (fails.length) { console.error(`✗ verify:nox-close1118 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-close1118 OK (${pass} checks)`);
