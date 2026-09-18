# B 段: 名簿 pin・probe・payroll-adjust pin の張り替え（0148）
import sys
def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f"{path}: expected 1 occurrence, got {n}: {old[:90]!r}")
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(s)
    print("edited", path)

# ── B-1 verify-nox-billing.ts pins（125→128・116→117・126→129）
edit('scripts/verify-nox-billing.ts', [
 ('''    check("段47-1 正本の対象125名を読めた", docTargets.size === 125, `got ${docTargets.size}`);''',
  '''    // ★mig0148（裁定272・2026-09-18）: check_add_referral（A1）・set_cast_norm_self（A7）・set_store_receivable_policy（A8）＝ゲート内蔵 3 本を A へ、
    //   payroll_carryover_sync（非ゲート＝給与の清算）を B(e) へ収載＝対象 125→128・除外 116→117・全数 241→245。
    //   set_product／product_bulk_insert／check_group_due は CREATE OR REPLACE のみ＝名前不変で本数不動。
    check("段47-1 正本の対象128名を読めた", docTargets.size === 128, `got ${docTargets.size}`);'''),
 ('''    check("段47-1 正本の除外116名を読めた", docExcluded.size === 116, `got ${docExcluded.size}`);''',
  '''    // ★mig0148（裁定272・2026-09-18）: payroll_carryover_sync（非ゲート＝繰越消費）を B(e) へ収載＝除外 116→117・全数 241→245。
    check("段47-1 正本の除外117名を読めた", docExcluded.size === 117, `got ${docExcluded.size}`);'''),
 ('''    check("段47-1 live のゲート済み関数 = 125本", liveGated.size === 125, `got ${liveGated.size}`);''',
  '''    check("段47-1 live のゲート済み関数 = 128本", liveGated.size === 128, `got ${liveGated.size}`);'''),
 ('''    check("段47-1 述語を参照する関数 = 126（125 ＋ ラッパ自身）", refs[0].n === 126, `got ${refs[0].n}`);''',
  '''    check("段47-1 述語を参照する関数 = 129（128 ＋ ラッパ自身）", refs[0].n === 129, `got ${refs[0].n}`);'''),
 ('''    check("段47-1 挿入行の形が全125本で規約どおり（引数は v_org / auth_org_id() の2種のみ）", shapes[0].n === 125, `got ${shapes[0].n}`);''',
  '''    check("段47-1 挿入行の形が全128本で規約どおり（引数は v_org / auth_org_id() の2種のみ）", shapes[0].n === 128, `got ${shapes[0].n}`);'''),
])

# ── B-2 anon-guard probe 4 本
edit('scripts/verify-nox-anon-guard.ts', [
 ('''  for (const [fn, args] of F0108_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }
''',
  '''  for (const [fn, args] of F0108_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }

  // ── 段35e: mig0148（裁定272・2026-09-18）新 RPC 4 本 anon BLOCKED（引数は null 埋め・revoke all from public, anon＋grant authenticated, service_role）──
  //   payroll_carryover_sync（繰越消費・owner∨manager 自店・draft のみ）／check_add_referral（紹介料行・kiosk 腕あり）／
  //   set_cast_norm_self（cast 本人のノルマ目標・auth_cast_id 由来）／set_store_receivable_policy（受取方針・owner 限定）
  const F0148_PROBES: Array<[string, Record<string, unknown>]> = [
    ["payroll_carryover_sync", { p_run_id: null }],
    ["check_add_referral", { p_check_id: null, p_cast_id: null, p_amount: null, p_memo: null, p_idem_key: null }],
    ["set_cast_norm_self", { p_period: null, p_days_target: null, p_dohan_target: null, p_sales_target: null, p_shimei_target: null }],
    ["set_store_receivable_policy", { p_store_id: null, p_policy: null }],
  ];
  for (const [fn, args] of F0148_PROBES) {
    const { error } = await anon.rpc(fn, args);
    check(`anon ${fn} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
  }
'''),
])

# ── B-3 payroll-adjust pin（列 15・CHECK 4・index 5・FK 6・署名 3）
edit('scripts/verify-nox-payroll-adjust.ts', [
 (''' *  (1) 列 13・CHECK 3（mode／amount 排他／reason trim 1..200）・index 3+pk・RLS enabled・policy 1 本の using 式
 *  (2) grant: 表 authenticated=SELECT のみ・anon 0／関数 2 本 authenticated=EXECUTE・anon 0（＋anon から RPC が BLOCKED）
 *  (3) FK 5 本（orgs／stores／payroll_runs ON DELETE CASCADE／casts／created_by→users）
 *  (4) 署名 2 本・SECURITY DEFINER''',
  ''' *  (1) 列 15（13＋★mig0148 source／carry_from_payslip_id）・CHECK 4（mode／amount 排他／reason trim 1..200／★source manual|carryover）・
 *      index 4+pk（★mig0148 部分 unique payroll_adjustments_carryover_uidx (run_id, cast_id) where source='carryover'）・RLS enabled・policy 1 本の using 式
 *  (2) grant: 表 authenticated=SELECT のみ・anon 0／関数 3 本（add／delete／★carryover_sync）authenticated=EXECUTE・anon 0（＋anon から RPC が BLOCKED）
 *  (3) FK 6 本（orgs／stores／payroll_runs ON DELETE CASCADE／casts／created_by→users／★carry_from_payslip_id→payslips ON DELETE SET NULL）
 *  (4) 署名 3 本（add／delete／★payroll_carryover_sync(uuid)→integer）・SECURITY DEFINER'''),
 ('''const COLS = ["id", "org_id", "store_id", "run_id", "cast_id", "mode", "amount", "rate_bp", "before_withholding", "show_detail", "reason", "created_by", "created_at"];''',
  '''const COLS = ["id", "org_id", "store_id", "run_id", "cast_id", "mode", "amount", "rate_bp", "before_withholding", "show_detail", "reason", "created_by", "created_at", "source", "carry_from_payslip_id"]; // ★mig0148: 末尾 2 列
const SYNC_ARGS = "p_run_id uuid"; // ★mig0148 payroll_carryover_sync'''),
 ('''    check("pa(1-1) 列 13", cols.length === 13, `${cols.length}`);''',
  '''    check("pa(1-1) 列 15（★mig0148 で 13→15）", cols.length === 15, `${cols.length}`);'''),
 ('''    check("pa(1-3) CHECK 3", cks.length === 3, cks.map((c) => c.conname).join(","));''',
  '''    check("pa(1-3) CHECK 4（★mig0148 で 3→4）", cks.length === 4, cks.map((c) => c.conname).join(","));'''),
 ('''    const idx = await q<{ indexname: string }>(`select indexname from pg_indexes where schemaname='public' and tablename=$1 order by indexname`, [T]);
    check("pa(1-7) index 3+pk", JSON.stringify(idx.map((i) => i.indexname)) === JSON.stringify(["payroll_adjustments_cast_idx", "payroll_adjustments_org_idx", "payroll_adjustments_pkey", "payroll_adjustments_run_idx"]), idx.map((i) => i.indexname).join(","));''',
  '''    check("pa(1-6b) ★mig0148 CHECK source ∈ manual/carryover", /source = ANY \\(ARRAY\\['manual'::text, 'carryover'::text\\]\\)/.test(def("payroll_adjustments_source_ck")), def("payroll_adjustments_source_ck"));
    const idx = await q<{ indexname: string; indexdef: string }>(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename=$1 order by indexname`, [T]);
    check("pa(1-7) index 4+pk（★mig0148 で carryover_uidx 追加）", JSON.stringify(idx.map((i) => i.indexname)) === JSON.stringify(["payroll_adjustments_carryover_uidx", "payroll_adjustments_cast_idx", "payroll_adjustments_org_idx", "payroll_adjustments_pkey", "payroll_adjustments_run_idx"]), idx.map((i) => i.indexname).join(","));
    const uidxDef = idx.find((i) => i.indexname === "payroll_adjustments_carryover_uidx")?.indexdef ?? "";
    check("pa(1-7b) ★mig0148 carryover_uidx＝UNIQUE (run_id, cast_id) WHERE source='carryover'（manual 行には掛からない部分 unique）", /CREATE UNIQUE INDEX payroll_adjustments_carryover_uidx ON public\\.payroll_adjustments USING btree \\(run_id, cast_id\\) WHERE \\(source = 'carryover'::text\\)/.test(uidxDef), uidxDef);
    const colDef = await q<{ column_name: string; data_type: string; column_default: string | null; is_nullable: string }>(`select column_name, data_type, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name=$1 and column_name in ('source','carry_from_payslip_id') order by ordinal_position`, [T]);
    check("pa(1-11) ★mig0148 source text not null default 'manual'／carry_from_payslip_id uuid null", colDef.length === 2 && colDef[0].column_name === "source" && colDef[0].data_type === "text" && colDef[0].is_nullable === "NO" && colDef[0].column_default === "'manual'::text" && colDef[1].column_name === "carry_from_payslip_id" && colDef[1].data_type === "uuid" && colDef[1].is_nullable === "YES", JSON.stringify(colDef));'''),
 ('''    const fg = await q<{ proname: string; acl: string | null }>(`select proname, proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_adjustment_add','payroll_adjustment_delete') order by proname`);
    check("pa(2-3) 関数 2 本", fg.length === 2, fg.map((f) => f.proname).join(","));''',
  '''    const fg = await q<{ proname: string; acl: string | null }>(`select proname, proacl::text as acl from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_adjustment_add','payroll_adjustment_delete','payroll_carryover_sync') order by proname`);
    check("pa(2-3) 関数 3 本（add／delete／★mig0148 carryover_sync）", fg.length === 3, fg.map((f) => f.proname).join(","));'''),
 ('''    check("pa(2-7) anon payroll_adjustment_delete BLOCKED", !!r2.error?.message?.includes("permission denied for function"), r2.error?.message ?? "(no error)");''',
  '''    check("pa(2-7) anon payroll_adjustment_delete BLOCKED", !!r2.error?.message?.includes("permission denied for function"), r2.error?.message ?? "(no error)");
    const r3 = await anon.rpc("payroll_carryover_sync", { p_run_id: z });
    check("pa(2-8) ★mig0148 anon payroll_carryover_sync BLOCKED", !!r3.error?.message?.includes("permission denied for function"), r3.error?.message ?? "(no error)");'''),
 ('''    check("pa(3-1) FK 5 本", fk.length === 5, fk.map((f) => f.conname).join(","));''',
  '''    check("pa(3-1) FK 6 本（★mig0148 で carry_from_payslip_id 追加）", fk.length === 6, fk.map((f) => f.conname).join(","));
    check("pa(3-7) ★mig0148 carry_from_payslip_id→payslips ON DELETE SET NULL", defs.some((d) => d === "FOREIGN KEY (carry_from_payslip_id) REFERENCES payslips(id) ON DELETE SET NULL"), defs.join(" | "));'''),
 ('''    const sig = await q<{ proname: string; args: string; ret: string; prosecdef: boolean }>(`select proname, pg_get_function_identity_arguments(oid) as args, pg_get_function_result(oid) as ret, prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_adjustment_add','payroll_adjustment_delete') order by proname`);
    const add = sig.find((s) => s.proname === "payroll_adjustment_add"), del = sig.find((s) => s.proname === "payroll_adjustment_delete");''',
  '''    const sig = await q<{ proname: string; args: string; ret: string; prosecdef: boolean }>(`select proname, pg_get_function_identity_arguments(oid) as args, pg_get_function_result(oid) as ret, prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('payroll_adjustment_add','payroll_adjustment_delete','payroll_carryover_sync') order by proname`);
    const add = sig.find((s) => s.proname === "payroll_adjustment_add"), del = sig.find((s) => s.proname === "payroll_adjustment_delete"), sync = sig.find((s) => s.proname === "payroll_carryover_sync");
    check("pa(4-5) ★mig0148 carryover_sync の署名 (uuid)→integer", sync?.args === SYNC_ARGS && sync?.ret === "integer", `${sync?.args} → ${sync?.ret}`);
    check("pa(4-6) ★mig0148 carryover_sync SECURITY DEFINER", sync?.prosecdef === true);'''),
 ('''  console.log("run 別調整控除(0146): 列 13・CHECK 3・index 3+pk・RLS・policy using 式 / grant 表 SELECT のみ・関数 EXECUTE・anon 0＋BLOCKED / FK 5（cascade）/ 署名 2・secdef / 異常系 5＋正常 add の audit（ROLLBACK・残留 0）");''',
  '''  console.log("run 別調整控除(0146＋0148): 列 15・CHECK 4・index 4+pk（部分 unique）・RLS・policy using 式 / grant 表 SELECT のみ・関数 3 本 EXECUTE・anon 0＋BLOCKED / FK 6（cascade・set null）/ 署名 3・secdef / 異常系 5＋正常 add の audit（ROLLBACK・残留 0）");'''),
])

# ── B-1 名簿正本 docs/NOX_課金ゲート対象_v1.md
edit('docs/NOX_課金ゲート対象_v1.md', [
 ('''- ★**mig0146 追随（2026-09-15・裁定258）**: 新 RPC **2本**を B(e) へ収載''',
  '''- ★**mig0148 追随（2026-09-18・裁定272）**: 新 RPC **4本**＝ゲート内蔵 3 本を A へ（`check_add_referral`→A1[K]・`set_cast_norm_self`→A7・
  `set_store_receivable_policy`→A8）・非ゲート 1 本を B(e) へ（`payroll_carryover_sync`＝前期 payslip の adjustOverflow を carryover 行へ upsert／削除する繰越消費＝給与の清算・
  owner∨manager 自店・draft のみ）。`set_product`／`product_bulk_insert`（白名単 +food/other）／`check_group_due`（referral 除外・内部専用）は CREATE OR REPLACE のみ＝名前不変で本数不動。
  対象 **125→128**・除外 **116→117**・全数 **241→245**。★教訓21 トリップワイヤの先回り収載（mig 手貼りと同一レーンで名簿＋pin を同時更新・dev 適用済み 9/18 11:1x JST）。
- ★**mig0146 追随（2026-09-15・裁定258）**: 新 RPC **2本**を B(e) へ収載'''),
 ('''**check_line_set_group[K]**（mig0091 新設＝会計分けの付け替え・ゲートは mig 本文に内蔵）
''',
  '''**check_line_set_group[K]**（mig0091 新設＝会計分けの付け替え・ゲートは mig 本文に内蔵） /
**check_add_referral[K]**（mig0148 新設＝紹介料行（kind 'referral'・product null・紹介者 cast 任意）の追加・check_add_line の冒頭〜role 判定を逐語＝kiosk 腕あり・
ゲート内蔵・idem＝check_dohan_add 同型・裁定272-2＝店が払う手当＝伝票合計・課税額から除外（check_group_due）し cast の gross にのみ載る）
'''),
 ('''**set_comp_component**（mig0115＝comp_plan_components の唯一の書き手・owner のみ・ゲート内蔵・裁定86）
''',
  '''**set_comp_component**（mig0115＝comp_plan_components の唯一の書き手・owner のみ・ゲート内蔵・裁定86） /
**set_cast_norm_self**（mig0148＝cast 本人の当月ノルマ目標＝set_cast_norm の本体逐語・cast_id は auth_cast_id() 由来で引数に無い・
店の sys_norms='false' は 'norms off'・ゲート内蔵・監査 set_cast_norm_self・裁定272-3＝R19）
'''),
 ('''**staff_shift_propose** / **staff_shift_override** / **staff_shift_confirm**（mig0136＋0137＝黒服シフト行の作成・時刻上書き・確定・owner∨manager 自店・課金ゲート＝裁定233。cast の A5 と同列だが店設定と同じ mig のため A8 に置く）
''',
  '''**staff_shift_propose** / **staff_shift_override** / **staff_shift_confirm**（mig0136＋0137＝黒服シフト行の作成・時刻上書き・確定・owner∨manager 自店・課金ゲート＝裁定233。cast の A5 と同列だが店設定と同じ mig のため A8 に置く） /
**set_store_receivable_policy**（mig0148＝stores.receivable_policy 実列の setter・CHECK 3 値（disabled／customer_only／cast_liability_allowed）・
set_store_okuri_mode の骨格逐語・owner 限定・ゲート内蔵・監査 set_store_receivable_policy・裁定272-5）
'''),
 ('''### B(e) payroll 系一式（5本・給与＝過去労働の清算）
payroll_run_create / payment_record_add / withholding_payment_record / payroll_adjustment_add / payroll_adjustment_delete
（finalize/mark_paid/reopen は B(a) で既に構造除外）
（payroll_adjustment_add／_delete＝mig0146・裁定258: ゲート行（'billing locked'）を持たない＝給与は過去労働の清算で非ゲート。A に載せると対象→live assert が赤になる）
''',
  '''### B(e) payroll 系一式（6本・給与＝過去労働の清算）
payroll_run_create / payment_record_add / withholding_payment_record / payroll_adjustment_add / payroll_adjustment_delete / payroll_carryover_sync
（finalize/mark_paid/reopen は B(a) で既に構造除外）
（payroll_adjustment_add／_delete＝mig0146・裁定258: ゲート行（'billing locked'）を持たない＝給与は過去労働の清算で非ゲート。A に載せると対象→live assert が赤になる）
（payroll_carryover_sync＝mig0148・裁定272-1: 前期 payslip の adjustOverflow>0 を当 draft run の carryover 行（source='carryover'・部分 unique）へ upsert／0 は削除＝冪等。
  payroll_adjustment_add の actor／org／manager 自店／draft 判定を逐語＝同じく非ゲート。A に載せると対象→live assert が赤になる）
'''),
 ('''## C. kiosk 腕を持つ対象（実装注意・16本）
A1 の check_open / check_add_line / check_remove_line / check_add_seat / check_remove_seat /
check_move_seat / check_set_nominations / check_time_charge_apply / check_shimei_add / check_dohan_add /
check_pay / check_close ＋ bottle_keep_register ＋ check_extension_add（mig0089）＋
check_set_people（mig0090）＋ check_line_set_group（mig0091）。''',
  '''## C. kiosk 腕を持つ対象（実装注意・17本）
A1 の check_open / check_add_line / check_remove_line / check_add_seat / check_remove_seat /
check_move_seat / check_set_nominations / check_time_charge_apply / check_shimei_add / check_dohan_add /
check_pay / check_close ＋ bottle_keep_register ＋ check_extension_add（mig0089）＋
check_set_people（mig0090）＋ check_line_set_group（mig0091）＋ check_add_referral（mig0148）。'''),
 ('''★**現在値（2026-09-15・mig0146 追随後）**: A **125** ＋ B **116** ＝ **241** ＝ live pg_proc 実列挙と一致（前＝mig0145 後 A 125＋B 114＝239・その前 mig0144 後 A 124＋B 114＝238。verify:nox-billing 段47-1 の pin＝対象 125／除外 116／ゲート済み 125／述語参照 126／挿入行の形 125）。''',
  '''★**現在値（2026-09-18・mig0148 追随後）**: A **128** ＋ B **117** ＝ **245** ＝ live pg_proc 実列挙と一致（前＝mig0146 後 A 125＋B 116＝241・その前 mig0145 後 A 125＋B 114＝239。verify:nox-billing 段47-1 の pin＝対象 128／除外 117／ゲート済み 128／述語参照 129／挿入行の形 128）。'''),
])
print("B patch done")
