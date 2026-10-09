/*
 * verify:nox-337 — 裁定337（0167・便 P167＋X-13d-2b・2026-10-09）: シフト希望の方式のキャスト別上書き（client）と 0168 起草の pin（DB 不触・env 不要）。
 *   npm run verify:nox-337。f0 99 段目。
 *  c337(1) キャスト詳細（待遇タブ）: 3 択 select（店の既定に従う＝null／shift／off_only）→ set_cast_shift_request_mode・既定ラベルに店の既定を表示・casts の select に列
 *  c337(2) /mine: layout（ナビ文言）と wishes page（文言・WishForm の mode）は auth_cast_id で自分の行→resolveWishMode（キャスト個別→店の既定）
 *  c337(3) autoassign-mode: castModes で cast ごとに解決（M4 の候補反転も解決値）／店側「作る」配置ビュー＝個別の方式の印（null は印なし）・page の select に列
 *  c337(4) デモ: 6 店の casts に 3 方式が混ざる（gen-demo idx%4）
 *  mig(2)  0168 起草: comp_plans.slide_period text not null default 'daily'＋CHECK・set_comp_plan 23 引数（22 引数版 drop）・単一 tx
 */
import fs from "node:fs";
import { resolveWishMode } from "../lib/nox/mine/wish-mode";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

{
  const cb = src("app/(manage)/casts/casts-board.tsx"), cp = src("app/(manage)/casts/page.tsx");
  check("c337(1-1) 待遇タブ: 3 択 select（\"\"＝店の既定に従う／shift／off_only）→ setShiftMode→rpc set_cast_shift_request_mode（p_cast_id・p_mode）", cb.includes('aria-label="シフト希望の方式"') && cb.includes('<option value="">店の既定に従う（{SHIFT_REQUEST_MODE_LABEL[mineSettingsOf(stores.find((st) => st.id === selCast.store_id)?.settings_json).shift_request_mode]}）</option>') && cb.includes('supabase.rpc("set_cast_shift_request_mode", { p_cast_id: c.id, p_mode: mode })'));
  check("c337(1-2) casts の select に shift_request_mode（board／page）・CastLogin 型に列・保存後は loginCasts を更新", cb.includes("employment, employment_valid_from, shift_request_mode\"") && cp.includes("employment, employment_valid_from, shift_request_mode\"") && cp.includes('shift_request_mode?: "shift" | "off_only" | null;') && cb.includes("setLoginCasts((rows) => rows.map((r) => (r.id === c.id ? { ...r, shift_request_mode: mode } : r)));"));
  const ml = src("app/mine/layout.tsx"), mw = src("app/mine/wishes/page.tsx");
  check("c337(2-1) /mine layout: auth_cast_id→自分の casts 行→resolveWishMode→wishNavLabelOf(wishMode)", ml.includes('await supabase.rpc("auth_cast_id")') && ml.includes('.select("shift_request_mode").eq("id", myCastId as string).maybeSingle()') && ml.includes("wishNavLabelOf(wishMode)") && !ml.includes("wishNavLabelOf(ms.shift_request_mode)"));
  check("c337(2-2) /mine wishes page: 同じ解決で mode（文言・WishForm）", mw.includes('await supabase.rpc("auth_cast_id")') && mw.includes("const mode = resolveWishMode(") && mw.includes("<WishForm mode={mode} />"));
  check("c337(2-3) resolveWishMode: 個別が勝つ・null／不正値は店の既定", resolveWishMode("off_only", "shift") === "off_only" && resolveWishMode(null, "off_only") === "off_only" && resolveWishMode(undefined, "shift") === "shift" && resolveWishMode("zzz", "off_only") === "off_only");
  const am = src("lib/nox/shift/autoassign-mode.ts"), sb = src("app/(manage)/shift/shift-board.tsx"), sp = src("app/(manage)/shift/page.tsx");
  check("c337(3-1) autoassign-mode: castModes（cast ごとに resolveWishMode・'shift' は work wish・'off_only' は反転）・castModes なしは従来どおり", am.includes("castModes?: Readonly<Record<string, WishMode | null | undefined>>") && am.includes("const eff = (castId: string): WishMode => resolveWishMode(input.castModes?.[castId], input.mode);") && am.includes("if (input.castModes) {"));
  check("c337(3-2) 作る＝配置ビュー: キャスト名の横に個別の方式の印（null は印なし）・page の select に列", sb.includes("{c.shift_request_mode && <span className=\"nox-stpill\"") && sb.includes("SHIFT_REQUEST_MODE_LABEL[c.shift_request_mode]") && sp.includes('"id, name, photo_updated_at, employment, shift_request_mode"'));
  const gd = src("scripts/demo/gen-demo.mjs");
  check("c337(4-1) gen-demo: casts に shift_request_mode（idx%4＝1 off_only・2 shift・他 null）・comp_plans に slide_period（ACE／NOIR monthly・LUNA half・他 daily＝0168 先行）", gd.includes('(c === repCast && code === "nest") ? "off_only" : castIdx % 4 === 1 ? "off_only" : castIdx % 4 === 2 ? "shift" : null; castIdx++;') /* ★P168: NEST の代表キャストは off_only（デモの cast ログインで反転を見せる） */ && gd.includes("shift_request_mode: srm });") && gd.includes("const SL = SLIDES[code] ?? {};") && (gd.match(/slide_period: SL\.period \?\? "daily"/g) ?? []).length === 2); // ★P168: SLIDE_PERIOD → profiles.mjs SLIDES
  for (const code of ["muse", "luna", "noir", "ace", "lily", "nest"]) {
    const pl = JSON.parse(src(`docs/demo/payload/${code}.json`)) as { tables: Record<string, Record<string, unknown>[]> };
    const cs = pl.tables.casts ?? [];
    const n = (v: string | null) => cs.filter((c) => (c.shift_request_mode ?? null) === v).length;
    check(`c337(4-${code}) payload casts＝既定 ${n(null)}／shift ${n("shift")}／off_only ${n("off_only")}（各 ≥1）`, n(null) >= 1 && n("shift") >= 1 && n("off_only") >= 1);
  }
  const f = "supabase/migrations/0168_comp_plan_slide_period.sql";
  const m = fs.existsSync(f) ? src(f) : "";
  check("mig(2-1) 0168 起草: 単一 tx・comp_plans.slide_period text not null default 'daily'＋CHECK（monthly／half／daily）・set_comp_plan 23 引数（p_slide_period default 'daily'）・22 引数版 drop・grants", (m.match(/^begin;$/gm) ?? []).length === 1 && (m.match(/^commit;$/gm) ?? []).length === 1 && m.includes("add column if not exists slide_period text not null default 'daily'") && m.includes("slide_period in ('monthly','half','daily')") && m.includes("p_product_back_fixed_free integer DEFAULT NULL::integer, p_slide_period text DEFAULT 'daily'::text)") && m.includes("raise exception 'bad slide_period'") && /drop function if exists public\.set_comp_plan\(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer\);/.test(m) && m.includes("grant execute on function public.set_comp_plan(uuid, uuid, text, integer, integer, integer, integer, jsonb, jsonb, boolean, text, integer, text, integer, text, integer, text, integer, integer, integer, integer, integer, text) to authenticated, service_role;"));
}

if (fails.length) {
  console.error(`verify:nox-337 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-337 OK (${pass} checks)`);
console.log("裁定337（0167）: 待遇タブ 3 択・/mine の解決（auth_cast_id）・M4 反転の個別化・作る画面の印・デモ 3 方式／0168 起草（slide_period・set_comp_plan 23 引数）");