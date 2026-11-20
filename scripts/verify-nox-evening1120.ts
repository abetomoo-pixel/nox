/*
 * verify:nox-evening1120 — 2026-11-20 夕（相談役 ⑧A／⑧B）。DB 不触・env 不要。計算と権限には触れない。
 *  ev(1) 待遇プラン › 歩合・バック › 自由設計のバック：行ごとの「編集」と「＋ バックを追加」から中央の窓・見出しに名前を全部・ボタンは保存とやめる・
 *        並び＝条件の無い行が先・条件の額の小さい順・条件と値は桁の区切り・保存の先（set_custom_back_def の 7 引数）は今のまま。
 *  ev(2) 日報の締めの前の窓：主のボタン（青）＝未会計の伝票を見る・「未会計のまま締める」は文字のボタン＋確かめ 1 回・
 *        見出し＝強行できる人は「未会計の伝票があります」・できない人は「まだ締められません」・実査の行は問いの文を混ぜない・判定と権限は今のまま。
 */
import fs from "node:fs";
import { backCondLabelOf, backDefsSortedOf, backEditTitleOf, backValueLabelOf } from "../app/(manage)/master/cast-comp/comp-sections";
import { closeGuardForceConfirmOf, closeGuardReasonsOf, closeGuardTitleOf } from "../lib/nox/report/close-guard";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const cs = fs.readFileSync("app/(manage)/master/cast-comp/comp-sections.tsx", "utf8");
const rb = fs.readFileSync("app/(manage)/report/report-board.tsx", "utf8");
const J = JSON.stringify;
const bt = cs.slice(cs.indexOf("export function BackTab("), cs.indexOf("\n}\n", cs.indexOf("export function BackTab(")));   // 自由設計のバックの部品だけ

const rows = [
  { id: "c", name: "売上歩合の加算（小計 100 万円〜・小計の 5%）", basis: "sales", value: 5, cond_json: { metric: "sales", min: 1000000 }, is_active: true },
  { id: "a", name: "売上歩合（小計の 40%）", basis: "sales", value: 40, cond_json: null, is_active: true },
  { id: "b", name: "売上歩合の加算（小計 30 万円〜・小計の 5%）", basis: "sales", value: 5, cond_json: { metric: "sales", min: 300000 }, is_active: true },
  { id: "d", name: "指名の固定", basis: "flat", value: 12000, cond_json: null, is_active: false },
];
check("ev(1-1) 並び＝条件の無い行が先（名前の順＝日本語の並び）・条件の額の小さい順", J(backDefsSortedOf(rows).map((r) => r.id)) === J(["d", "a", "b", "c"]), backDefsSortedOf(rows).map((r) => r.id));
check("ev(1-2) 条件と値の文＝桁の区切り（売上 ≥ 1,000,000・12,000）・売上×% は %・条件なしは —",
  backCondLabelOf({ metric: "sales", min: 1000000 }) === "売上（按分後） ≥ 1,000,000" && backCondLabelOf(null) === "—" && backValueLabelOf({ basis: "flat", value: 12000 }) === "12,000" && backValueLabelOf({ basis: "sales", value: 5 }) === "5%",
  [backCondLabelOf({ metric: "sales", min: 1000000 }), backValueLabelOf({ basis: "flat", value: 12000 })]);
check("ev(1-3) 窓の見出し＝名前を全部＋「を編集」・追加は「バックを追加」",
  backEditTitleOf("売上歩合の加算（小計 100 万円〜・小計の 5%）") === "売上歩合の加算（小計 100 万円〜・小計の 5%）を編集" && backEditTitleOf(null) === "バックを追加");
check("ev(1-4) 画面：行ごとの「編集」・「＋ バックを追加」・中央の窓（dialog）・保存とやめるだけ・一覧の下の欄（新規に戻す）は無い・行を押しても編集にならない",
  cs.includes('data-back-edit={b.id} aria-label={backEditTitleOf(b.name)}>編集</button>') && cs.includes('data-back-add="1">＋ バックを追加</button>') && cs.includes('<Modal onClose={() => { if (!busy) setOpen(null); }} maxWidth={560} variant="dialog">')
  && cs.includes('data-back-save="1">{busy ? "保存中…" : "保存"}</button>') && cs.includes('data-back-cancel="1">やめる</button>') && bt.length > 1000 && !bt.includes("新規に戻す") && !bt.includes("onClick={() => isManagerUp && edit(b)}")
  && cs.includes("const rows = backDefsSortedOf(backs);") && cs.includes('data-back-modal-title="1">{open.title}</h3>'));
check("ev(1-5) 保存の先は今のまま＝set_custom_back_def の 7 引数（id は窓の行・新規は null）・条件の額は桁の区切りの欄",
  cs.includes('const { error } = await supabase.rpc("set_custom_back_def", {\n      p_id: open.id, p_store_id: storeId, p_name: name, p_basis: basis, p_value: value,\n      p_cond: condOn ? { metric: condMetric, min: condMin } : null,\n      p_is_active: active,\n    });')
  && cs.includes('<GroupedNumberInput value={condMin} onChange={(n) => setCondMin(Number(n || 0))} ariaLabel="条件の額"'));

check("ev(2-1) 見出し＝強行できる人は「未会計の伝票があります」・できない人は「まだ締められません」・実査だけは「実査が未入力です」",
  closeGuardTitleOf({ openN: 2, countedMissing: false }, true) === "未会計の伝票があります" && closeGuardTitleOf({ openN: 2, countedMissing: false }, false) === "まだ締められません"
  && closeGuardTitleOf({ openN: 2, countedMissing: false }) === "まだ締められません" && closeGuardTitleOf({ openN: 0, countedMissing: true }, true) === "実査が未入力です"
  && rb.includes('data-close-guard-title="1">{closeGuardTitleOf(closeGuard, isManagerUp)}</h3>'));
check("ev(2-2) 実査の行は「実査（数えた現金）が未入力です」だけ（問いの文を混ぜない）",
  J(closeGuardReasonsOf({ openN: 0, countedMissing: true })) === J(["実査（数えた現金）が未入力です"]) && !J(closeGuardReasonsOf({ openN: 3, countedMissing: true })).includes("ますか"));
check("ev(2-3) 主のボタン（青＝btnDark）＝未会計の伝票を見る・「未会計のまま締める」は文字のボタン（t.link）・押したら確かめ 1 回（未会計 n 件を残して締めます。よろしいですか）",
  rb.includes('<a href="/register" style={{ ...btnDark, textDecoration: "none", display: "inline-flex", alignItems: "center" }} data-close-guard-see="1">未会計の伝票を見る</a>')
  && rb.includes('style={{ ...t.link, fontSize: 12.5, color: "var(--sub)", minHeight: 40 }} data-close-guard-force="1"') && rb.includes("if (!window.confirm(closeGuardForceConfirmOf(g.openN))) return;")
  && closeGuardForceConfirmOf(3) === "未会計 3 件を残して締めます。よろしいですか");
check("ev(2-4) 判定と権限は今のまま（強行は isManagerUp だけ・forced で締める・再締めは recloseFromForm）",
  rb.includes("{closeGuard.openN > 0 && isManagerUp && (") && rb.includes("void recloseFromForm(g.reportId, true); else void closeDay({ forced: true, countedOk: true });")
  && rb.includes('if (openN > 0 || countedMissing) { setCloseGuard({ openN, countedMissing, mode: "close" }); return; }'));

if (fails.length) { console.error(`✗ verify:nox-evening1120 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-evening1120 OK (${pass} checks)`);
