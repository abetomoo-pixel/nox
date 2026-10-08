/*
 * verify:nox-x13 — 便 X-13a（2026-10-08・Agoora 目視 NG 1〜10 の処理）の pin（DB 不触・env 不要・純関数＋逐語 grep）。
 *   npm run verify:nox-x13。f0 94 段目。
 *
 *  register-nom   X-13-1 レジ 指名・席タブ＝並び 指名→分配率→顧客→紹介→席・1 人は 100% に畳む（合計バー・均等は出さない）
 *  header-sheet   X-13-2 自分の情報＝メール非表示（PC・スマホ）・案内 1 行は残す・≤900 は Modal の既存シート（variant top は ≥901 だけ）
 *  quota-table    X-13-3 キャスト別ノルマ目標＝表（1 人 1 行・列 6・単位固定・3 桁区切り）＋複数選択→まとめて入力（空欄は変えない・期間の初期値＝当月）
 *  staff-photo    X-13-4 スタッフ編集＝名前の横に PhotoEdit（現在・変更・削除）・旧ブロック撤去
 *  cast-photo     X-13-5 キャスト詳細＝ヘッダー写真の下に PhotoEdit 常時表示（デモは無効＋理由）・旧プレビューモーダル経路撤去・X-13-6 draft 初期化
 *  products-back  X-13-7 バック列＝率 0／4 段階すべて 0 は「—」・値ありは本／場内／同伴／フリー・長ければ「4段階 ▸」
 *  inventory-track X-13-8 track_stock（0166）＝一覧「—」・レジ残数なし・在庫画面の対象外・商品編集の「在庫を管理する」・列が無くても動く
 *  demo-flags     X-13-9 payload＝6 店とも feature_flags（org 既定）staff_shift／reopen_flow ON・products.track_stock true
 *  store-settings X-13-10 店舗設定・利用機能＝店長の説明文に「機能の公開」が無い（owner だけ）
 *  逆テスト 1 本（手動・1 回）: casts-board の useEffect（X-13-6）を外す→x13(cast-photo-3) 赤・戻して緑。
 */
import fs from "node:fs";
import { backTextOf, BACK_TEXT_LONG } from "../app/(manage)/master/products/products-board";
import { currentPeriodOf, normBulkArgsOf } from "../app/(manage)/master/cast-comp/comp-sections";
import { photoEditLabelOf } from "../components/ui/photo-edit";
import { finalizedPeriodsOf, periodCandidatesOf, periodOptionLabelOf, prevPeriodOf, previewHrefOf, shiftPeriod } from "../lib/nox/payroll/list-periods";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// register-nom
{
  const s = src("app/(manage)/register/register-board.tsx");
  const iNom = s.indexOf("<h3 style={t.cardTitle}>指名</h3>"), iShare = s.indexOf("指名の分配率</h3>"), iCust = s.indexOf("<CheckCustomersCard checkId={check.id}"), iRef = s.indexOf("<h3 style={t.cardTitle}>紹介</h3>"), iSeat = s.indexOf("<h3 style={t.cardTitle}>席</h3>");
  check("x13(register-nom-1) 並び＝指名 → 分配率 → 顧客 → 紹介 → 席", iNom > 0 && iNom < iShare && iShare < iCust && iCust < iRef && iRef < iSeat, [iNom, iShare, iCust, iRef, iSeat].join(","));
  check("x13(register-nom-2) 1 人のときは % 入力を「100%」に畳み、合計バーと均等は出さない", s.includes('{nomSelected.length === 1 ? (<b className="num" style={{ fontSize: 13 }}>100%</b>) : (') && s.includes("{nomSelected.length > 1 && (<>") && s.includes('"1 名のため 100% で固定です（指名本数には影響しません）。"'));
  check("x13(register-nom-3) 種別（本／場内／フリー）と同伴のトグルは 1 人でも残る（畳むのは分配率だけ）", s.includes('([["hon", "本"], ["jonai", "場内"], ["free", "フリー"]] as const).map(') && (s.match(/分配率の合計/g) ?? []).length === 1);
}
// header-sheet
{
  const s = src("components/ui/header-chips.tsx");
  check("x13(header-sheet-1) 自分の情報＝メール行なし・登録名／役割／店舗・ログアウト（POST /auth/signout）", !s.includes("<dt>メール</dt>") && s.includes("<dt>登録名</dt>") && s.includes("<dt>役割</dt>") && s.includes("<dt>店舗</dt>") && s.includes('<form action="/auth/signout" method="post"'));
  check("x13(header-sheet-2) 変更の案内 1 行は残る・≤900 は既存シート（variant top＝≥901 のみ・globals.css）", s.includes("登録名・メールの変更はスタッフ画面（オーナー）から行います。") && s.includes('variant="top"') && /@media \(min-width: 901px\) \{\s*\.nox-modal-top/.test(src("app/globals.css")));
}
// quota-table
{
  const s = src("app/(manage)/master/cast-comp/comp-sections.tsx");
  check("x13(quota-table-1) 表＝列 6（キャスト／期間／日数(日)／同伴(回)／売上(円)／指名(回)）・1 人 1 行（casts.map）・3 桁区切り", s.includes('["キャスト", "期間", "日数(日)", "同伴(回)", "売上(円)", "指名(回)"]') && s.includes("{casts.map((c) => { const n = normOf(c.id); return (") && s.includes("v.toLocaleString()"));
  check("x13(quota-table-2) 複数選択→「選択した N 人にまとめて入力」・空欄は変えない・set_cast_norm 6 引数", s.includes("選択した {picked.size} 人にまとめて入力") && s.includes('placeholder="変えない"') && s.includes('supabase.rpc("set_cast_norm", { p_cast_id: cid, p_period: period, ...args })'));
  const d = new Date(2026, 9, 8);
  check("x13(quota-table-3) 期間の初期値＝当月（'YYYY-MM'）・normBulkArgsOf＝空欄は現在値（無ければ 0）", currentPeriodOf(d) === "2026-10" && JSON.stringify(normBulkArgsOf({ days: "", dohan: "3", sales: "", shimei: "" }, { days_target: 12, dohan_target: 1, sales_target: 500000, shimei_target: 4 })) === JSON.stringify({ p_days_target: 12, p_dohan_target: 3, p_sales_target: 500000, p_shimei_target: 4 }) && normBulkArgsOf({ days: "", dohan: "", sales: "", shimei: "" }, null).p_sales_target === 0 && s.includes('<input type="month" value={period}'));
}
// staff-photo / cast-photo
{
  const st = src("app/(manage)/staff/staff-board.tsx"), ca = src("app/(manage)/casts/casts-board.tsx"), pe = src("components/ui/photo-edit.tsx");
  check("x13(staff-photo-1) スタッフ編集＝名前の横に PhotoEdit（uploadUserPhoto 経路は lib のまま）・旧ブロック撤去", st.includes('import PhotoEdit from "@/components/ui/photo-edit"') && st.includes("<PhotoEdit name={users[sel.user_id]?.name ?? \"\"}") && st.includes("onPick={(f) => void pickStaffPhoto(sel.user_id, f)}") && !st.includes("スタッフ写真の登録・差替え・削除（owner／manager。manager の他店は RLS／RPC が拒否＝和文で返る）\n            <div"));
  check("x13(staff-photo-2) PhotoEdit＝直接 pick・hasPhoto で削除・disabled は表示するが無効（理由）・ラベル 登録／変更／処理中", pe.includes('accept="image/*"') && pe.includes("{hasPhoto && onRemove && (") && pe.includes("{disabled && disabledReason && ") && photoEditLabelOf(false, false) === "写真を登録" && photoEditLabelOf(true, false) === "写真を変更" && photoEditLabelOf(true, true) === "処理中…");
  check("x13(cast-photo-1) キャスト詳細＝ヘッダー写真の下に PhotoEdit 常時（デモは disabled＋理由）・useIsDemo は残る（dg(6-4)）", ca.includes('<PhotoEdit name={selCast.name} url={photoUrls.get(selCast.id)} hasPhoto={photoUrls.has(selCast.id)}') && ca.includes('disabled={isDemo} disabledReason="デモ環境では写真を変更できません"') && /useIsDemo\(\)/.test(ca));
  check("x13(cast-photo-2) 旧プレビュー付きモーダル経路（phTarget／openPhoto／submitPhoto）は撤去・uploadPhotoDirect→uploadCastPhoto", !ca.includes("phTarget") && !ca.includes("function openPhoto(") && !ca.includes("submitPhoto") && ca.includes("async function uploadPhotoDirect(c: CastLogin, f: File)") && ca.includes("await uploadCastPhoto(supabase, orgId, c.id, f);"));
  check("x13(cast-photo-3) X-13-6＝sel 変更で編集 draft（profEdit／profName／profJoined）を初期化", ca.includes('useEffect(() => { setProfEdit(false); setProfName(""); setProfJoined(""); }, [sel]);'));
}
// products-back
{
  const s = src("app/(manage)/master/products/products-board.tsx");
  check("x13(products-back-1) 率 0・4 段階すべて 0 は null（—）", backTextOf({ back_mode: "rate", back_value: 0, unit4_json: null }) === null && backTextOf({ back_mode: "unit4", back_value: null, unit4_json: { hon: 0, jonai: 0, dohan: 0, free: 0 } }) === null && backTextOf({ back_mode: "rate", back_value: 10, unit4_json: null }) === "10%");
  const t = backTextOf({ back_mode: "unit4", back_value: null, unit4_json: { hon: 1000, jonai: 500, dohan: 800, free: 0 } });
  check("x13(products-back-2) 値ありは「本／場内／同伴／フリー」を並べ・3 桁区切り・長ければ「4段階 ▸」", t === "本 1,000／場内 500／同伴 800／フリー 0" && (t?.length ?? 0) > BACK_TEXT_LONG && s.includes(">4段階 ▸</button>") && s.includes('<td className="col-back" data-label="バック"><BackCellView p={p} /></td>'));
}
// inventory-track
{
  const pb = src("app/(manage)/master/products/products-board.tsx"), rb = src("app/(manage)/register/register-board.tsx"), sb = src("app/(manage)/master/stock/stock-board.tsx"), qs = src("lib/nox/master/queries.ts"), mig = src("supabase/migrations/0166_product_track_stock.sql");
  check("x13(inventory-track-1) 0166＝products.track_stock boolean not null default true＋set_product_track_stock（ゲート内蔵・監査）・単一 tx", mig.includes("alter table public.products add column if not exists track_stock boolean not null default true;") && mig.includes("create or replace function public.set_product_track_stock(p_product_id uuid, p_track boolean)") && mig.includes("raise exception 'billing locked'") && mig.includes("perform public.audit_log_write('set_product_track_stock'") && (mig.match(/^begin;$/gm) ?? []).length === 1);
  check("x13(inventory-track-2) client＝一覧「—」・レジは残数なし・在庫画面は対象外（managedProducts）・型は optional（列が無くても動く）", pb.includes("{p.track_stock === false ? <span") && rb.includes("if (n == null || p.track_stock === false) return null;") && sb.includes("const managedProducts = useMemo(() => products.filter((p) => p.track_stock !== false), [products]);") && qs.includes("track_stock?: boolean;") && rb.includes("type Product = { track_stock?: boolean;"));
  check("x13(inventory-track-3) 商品編集の「在庫を管理する」＝既存商品だけ・set_product_track_stock・RPC 不在は和文（0166 手貼り前）", pb.includes('<span className="lab">在庫を管理する</span>') && pb.includes('supabase.rpc("set_product_track_stock", { p_product_id: productId, p_track: next })') && pb.includes('"在庫管理の切替は 0166 適用後に使えます"') && pb.includes("登録後に切り替えられます（既定＝管理する）"));
}
// demo-flags
{
  const stores = ["muse", "luna", "noir", "ace", "lily", "nest"];
  let okAll = true; const detail: string[] = [];
  for (const st of stores) {
    const p = JSON.parse(src(`docs/demo/payload/${st}.json`)) as { tables: Record<string, Record<string, unknown>[]> };
    const ff = p.tables.feature_flags ?? [];
    const keys = ff.filter((f) => f.store_id === null).map((f) => f.key).sort(); // ★X-13c: reopen_flow は店で ON/OFF（profiles）＝行の有無と staff_shift ON を見る
    const ssOn = ff.find((f) => f.key === "staff_shift")?.enabled === true;
    const prods = p.tables.products ?? [];
    const falses = prods.filter((r) => r.track_stock === false), trues = prods.filter((r) => r.track_stock === true);
    const ok = keys.join(",") === "reopen_flow,staff_shift" && ssOn && ff.length === 2 && prods.length > 0 && prods.every((r) => typeof r.track_stock === "boolean") && falses.length > 0 && falses.every((r) => r.type === "drink") && prods.filter((r) => r.type !== "drink").every((r) => r.track_stock === true) && trues.length > 0; // ★X-13b: グラス物（type drink）は false・他は true
    if (!ok) okAll = false; detail.push(`${st}:${keys.join("|")}/${ff.length}/${prods.every((r) => r.track_stock === true)}`);
  }
  check("x13(demo-flags-1) 6 店とも feature_flags＝org 既定（store_id null）staff_shift ON＋reopen_flow（店で ON/OFF＝★X-13c）の 2 行・products.track_stock＝グラス物（drink）false・他 true（★X-13b）", okAll, detail.join(" "));
  const gen = src("scripts/demo/gen-demo.mjs");
  check("x13(demo-flags-2) gen-demo＝feature_flags 2 行＋products.track_stock＝accounting_class !== drink（★X-13b・列が無い間は populate が無視）", gen.includes('for (const key of ["staff_shift", "reopen_flow"]) push("feature_flags", {') && gen.includes('track_stock: p.accounting_class !== "drink",'));
}
// store-settings
{
  const s = src("app/(manage)/master/store-profile/page.tsx");
  check("x13(store-settings-1) 利用機能の説明文＝owner は「機能の公開」あり・店長はなし（FeatureFlagsPanel は owner だけ）", s.includes("desc: isOwner\n") && s.includes("報酬制度（ノルマを使うかを含む）・売掛・勤務時間の計算基準・キャスト画面の設定。金額や計算条件は各マスタで管理します。\" }") && s.includes("{isOwner && <FeatureFlagsPanel stores={stores} />}"));
}
// payroll-empty / payroll-periods（X-13-12／X-13-14・便 X-13a 追加分）
{
  const s = src("app/(manage)/payroll/payroll-list.tsx");
  const cands = periodCandidatesOf("2026-10", ["2025-03", "2026-10", "bad"], 12);
  check("x13(payroll-periods-1) 候補＝当月＋過去 12 か月（13 本）＋run の古い期間・降順・重複なし・不正は捨てる", cands.length === 14 && cands[0] === "2026-10" && cands[12] === "2025-10" && cands[13] === "2025-03" && !cands.includes("bad") && shiftPeriod("2026-01", 1) === "2025-12" && prevPeriodOf("2026-10") === "2026-09");
  const fin = finalizedPeriodsOf([{ period: "2026-09", status: "finalized" }, { period: "2026-08", status: "paid" }, { period: "2026-07", status: "draft" }]);
  check("x13(payroll-periods-2) 確定済み（finalized／paid）に印・draft は印なし・select の候補は periodCandidatesOf", fin.has("2026-09") && fin.has("2026-08") && !fin.has("2026-07") && periodOptionLabelOf("2026-09", fin, (y) => y) === "2026-09 ✓確定済" && periodOptionLabelOf("2026-07", fin, (y) => y) === "2026-07" && s.includes("periodCandidatesOf(currentYm, (rows ?? []).map((r) => r.period), 12)") && s.includes("periodOptionLabelOf(p, finalizedPeriods, fmtPeriodYM)"));
  check("x13(payroll-empty-1) 空状態＝「先月のプレビューを開く」（期間選択付き・既定＝先月・店舗は選択中）→ /payroll?store=&period=（明細＝プレビュー）", s.includes('"先月のプレビューを開く"') && s.includes("useState(prevPeriodOf(currentYm))") && s.includes("useEffect(() => { setEmptyStore(storeSel); }, [storeSel]);") && s.includes("href={previewHrefOf(emptyStore || stores[0]?.id || \"\", emptyPeriod)}") && previewHrefOf("s1", "2026-09") === "/payroll?store=s1&period=2026-09" && s.includes("この{view === \"store\" ? \"店舗\" : \"期間\"}に給与 run がありません。"));
}

if (fails.length) {
  console.error(`verify:nox-x13 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-x13 OK (${pass} checks)`);
console.log("目視 NG X-13-1〜10＋12／14（便 X-13a）: register-nom／header-sheet／quota-table／staff-photo／cast-photo／products-back／inventory-track（0166）／demo-flags／store-settings／payroll-empty／payroll-periods");
