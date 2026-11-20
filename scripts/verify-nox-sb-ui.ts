// verify:nox-sb-ui（2026-11-19 夜・相談役 ④＝枝 night1119-sales-basis-ui → 2026-11-20 main へ・文言 2 か所の直し・報酬率の母数の行は出さない＝③）
//   店舗設定 › 使う制度の「歩合・スライドの売上の基準（請求額／小計）」と「既定の売上歩合を使う／使わない」。
//   保存＝set_store_profile の patch（0201q の 2 鍵）。押す前に確かめる窓（まだ確定していない期間から・段の額も見直す・確定済みの明細は変わらない）。
//   報酬率の母数（sales_subtotal_mode）の行は出さない（保存済みの値と set_store_profile の受け口は今のまま）。計算の式（collect／pay）は触らない。
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SalesBasisRows from "../components/nox/sales-basis-rows";
// tsx は tsconfig の jsx:"preserve" を classic 変換で落とす＝部品の描画に React をグローバルへ置く（suite 内のみ・mine-recon と同型）
(globalThis as { React?: typeof React }).React = React;
import { SALES_BASIS_CONFIRM_LINES_OF, SALES_BACK_DEFAULT_CONFIRM_LINES_OF, SALES_BASIS_CHOICE_LABEL, SALES_BASIS_ROW_NOTE, SALES_BACK_DEFAULT_ROW_NOTE } from "../lib/nox/payroll/sales-basis";

let n = 0, bad = 0;
const check = (name: string, ok: boolean, info = "") => { n++; if (!ok) { bad++; console.log(`NG ${name} ${info}`); } else console.log(`ok ${name}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const comp = src("components/nox/sales-basis-rows.tsx");
const panel = src("components/nox/store-rules-0175-panel.tsx");
const MUST = "まだ確定していない期間から、歩合とスライドの判定に使う売上が変わります。段の額も見直してください。";

const d2s = SALES_BASIS_CONFIRM_LINES_OF("due", "subtotal"), s2d = SALES_BASIS_CONFIRM_LINES_OF("subtotal", "due");
check("sb(1-1) 確かめる窓の文＝相談役の指定の文を含む・確定済みの明細は変わらない・向きで「減る／増える」", d2s.includes(MUST) && s2d.includes(MUST) && d2s.some((l) => l.startsWith("確定済みの明細は変わりません")) && d2s.some((l) => l.includes("届く人が減ります")) && s2d.some((l) => l.includes("届く人が増えます")) && d2s[0].includes("「請求額」から「小計」"), JSON.stringify(d2s));
const on = SALES_BACK_DEFAULT_CONFIRM_LINES_OF(true), off = SALES_BACK_DEFAULT_CONFIRM_LINES_OF(false);
check("sb(1-2) 既定の売上歩合の窓＝まだ確定していない期間から・確定済みの明細は変わらない・使わないでもお店の歩合は付く・「次の締めから」は使わない", on.some((l) => l.startsWith("まだ確定していない期間から")) && off.some((l) => l.startsWith("まだ確定していない期間から") && l.includes("お店で決めた歩合") && l.includes("今のまま付きます")) && off.some((l) => l.startsWith("確定済みの明細は変わりません")) && ![...d2s, ...s2d, ...on, ...off].some((l) => l.includes("次の締め")));
check("sb(1-3) 選ぶボタンは短い名前（請求額／小計）・小計の説明は外税と内税で違わない（内税は税を含む）・報酬率の母数の文は無い", SALES_BASIS_CHOICE_LABEL.due === "請求額" && SALES_BASIS_CHOICE_LABEL.subtotal === "小計" && SALES_BASIS_ROW_NOTE.includes("小計＝サービス料を足す前の額です。税込みで値段を出しているお店は、税を含みます。") && !SALES_BASIS_ROW_NOTE.includes("報酬率の母数") && !SALES_BASIS_ROW_NOTE.includes("税・サービス料の前") && SALES_BACK_DEFAULT_ROW_NOTE.includes("3〜10％") && d2s.some((l) => l.includes("税を別に足しているお店は税の分も")));
check("sb(1-4) 内部の言葉を画面の文に出さない（鍵の名前・関数名）", ![...d2s, ...s2d, ...on, ...off, SALES_BASIS_ROW_NOTE, SALES_BACK_DEFAULT_ROW_NOTE].some((l) => /sales_|subtotal|due|rpc|mig|0201/i.test(l)));

check("sb(2-1) 保存は親の onPatch（0201q の 2 鍵だけ）・押してすぐには保存しない（窓の「切り替える」で保存）", comp.includes("onPatch({ sales_basis: p.next }") && comp.includes("onPatch({ sales_back_default_off: !p.nextUse }") && comp.includes('setPending({ kind: "basis", next: v as SalesBasis })') && comp.includes('data-sales-basis-confirm-yes="1" onClick={() => void confirm()}') && (comp.match(/onPatch\(/g) ?? []).length === 2);
check("sb(2-2) 窓は画面の中央の dialog・「やめる」で何も保存しない", comp.includes('<Modal onClose={() => setPending(null)} variant="dialog" opaque>') && comp.includes('onClick={() => setPending(null)}>やめる</button>'));
check("sb(2-3) 店の設定の欄に置く＝0201q の後だけ（旗 false＝何も出さない）・支払サイクルの行の前", panel.includes("<SalesBasisRows settings={settings} onPatch={onPatch} readOnly={readOnly} busy={busy} on={mig0201qOn()} />") && panel.indexOf("<SalesBasisRows") < panel.indexOf("data-pay-cycle={cyc.cycle}"));
const settingsSrc = src("lib/nox/rules-0175/settings.ts"), wiz = src("app/(manage)/setup/setup-wizard.tsx");
check("sb(2-4) 報酬率の母数（売上小計の範囲）の行は出さない・鍵（set_store_profile の受け口）は settings に残す・初期設定の報酬率の説明から母数の設定を前提にした括弧を外す", !panel.includes("data-sales-subtotal-mode") && !panel.includes("報酬率の母数（売上小計の範囲）</div>") && !panel.includes("STORE_KEYS_0175.salesSubtotalMode") && /salesSubtotalMode:\s*"sales_subtotal_mode"/.test(settingsSrc) && wiz.includes("報酬率＝決定した報酬（時給分）÷売上小計。") && !wiz.includes("÷売上小計（税・サービス料前・割引前）"));

const noop = () => {};
const r0 = renderToStaticMarkup(React.createElement(SalesBasisRows, { settings: { sales_basis: "subtotal" }, onPatch: noop, on: false }));
const r1 = renderToStaticMarkup(React.createElement(SalesBasisRows, { settings: { sales_basis: "subtotal", sales_back_default_off: true }, onPatch: noop, on: true }));
const r2 = renderToStaticMarkup(React.createElement(SalesBasisRows, { settings: null, onPatch: noop, on: true, readOnly: true }));
check("sb(3-1) 旗 false＝何も描かない", r0 === "", r0.slice(0, 80));
check("sb(3-2) 小計・既定を使わない店＝その値で描く（窓は押すまで出さない）", r1.includes('data-sales-basis="subtotal"') && r1.includes('data-sales-back-default="0"') && !r1.includes("data-sales-basis-confirm"));
check("sb(3-3) 鍵の無い店＝請求額・既定を使う（今までと同じ）・見るだけの人は「使う」と字で出す", r2.includes('data-sales-basis="due"') && r2.includes('data-sales-back-default="1"') && r2.includes(">使う</b>"));

const col = src("lib/nox/payroll/collect.ts");
check("sb(4-1) 計算の式は触らない（collect は今までどおり鍵を読むだけ）", col.includes("salesRpcOf(salesBasisOf(") && !col.includes("sales-basis-rows"));

if (bad) { console.log(`verify:nox-sb-ui NG ${bad}/${n}`); process.exit(1); }
console.log(`verify:nox-sb-ui OK (${n} checks)`);
