# 0148_draft_notes — ★一覧（パス 1・2026-09-17 17:0x JST）

ファイル: `supabase/migrations/0148_carryover_referral_selfnorm_types.sql`（未追跡・720 行・49,299 B・sha256 c2944808a516169fb4d7bbff95c6d127dc8dd057608e59821a930351636bb187（★10 追加後・2026-09-18 11:0x。★10 前＝661 行・5dfd2a9f…／初稿＝654 行・3f21311a…）。★10 追加で ★6 以降の行番号が +59（★1 95／★2 104／★3 111／★4 208／★5 218／★10 285〜334／★6 336／★7 624／★8 676／★9 705））。
写経元＝docs/tmp/0148_pre.md B-1（live pg_get_functiondef・`### <name>` 見出し下のコード行番号は 0148_pre.md の行番号）＋ check_dohan_add（docs/tmp/q0918_e.mjs 出力・L 番号は functiondef 行）＋ set_product／product_bulk_insert（docs/tmp/q0918_live_*.sql＝live 逐語）。

| ★ | 0148 行 | 内容 | 写経元 ファイル:行 |
|---|---|---|---|
| ★1 | 88〜92 | payroll_adjustments に `source`（not null default 'manual'・CHECK payroll_adjustments_source_ck）と `carry_from_payslip_id`（payslips FK・on delete set null） | 0146_payroll_adjustments.sql の列定義の流儀（`text not null default`／`references … on delete`）。列並び・既存 13 列は不触（0148_pre.md 521〜535） |
| ★2 | 98〜99 | 部分 unique `payroll_adjustments_carryover_uidx (run_id, cast_id) where source = 'carryover'`。soft delete 判定＝payroll_adjustment_delete L168 `delete from payroll_adjustments where id = p_id;`＝hard delete → deleted 条件なし | 0148_pre.md 168 |
| ★3 | 105〜197 | `payroll_carryover_sync(p_run_id uuid) returns integer`。宣言 v_org〜v_status（0148_pre.md 37〜41）・冒頭 guard／role／actor（45〜55）・run 取得〜draft 判定（70〜80・period を併読）・insert 列並び（91〜101 に source／carry_from_payslip_id を追加）・audit 6 引数（103〜112 の型）。前期＝147 行・upsert 150〜174・削除 177〜183・戻り値 197 | 0148_pre.md 37〜112（payroll_adjustment_add）。draft の raise 行は payroll_run_create に無い（0148_pre.md 494〜498 は自然冪等）ため adjustment_add L78〜80 を写経 |
| ★4 | 201〜206 | check_lines_kind_check drop→同名 add（8 値逐語＋'referral','food','other'）／products_type_check drop→同名 add（3 値＋'food','other'） | 0148_pre.md 514〜515（CHECK 逐語）・live distinct（docs/tmp/q0918_d.mjs 出力: kind {bottle,champ,charge,discount,drink,set,time}／type {bottle,champ,drink}） |
| ★5 | 211〜273 | `check_add_referral(p_check_id uuid, p_cast_id uuid, p_amount integer, p_memo text default null, p_idem_key uuid default null)`。冒頭〜role〜status（0148_pre.md 196〜219 逐語）・idem（check_dohan_add L33〜37 逐語）・cast 検証（L39〜42 逐語・`if p_cast_id is not null` で包む）・custom 分岐の写像（0148_pre.md 234〜240 → kind 固定・name＝p_memo・price＝p_amount）・insert 列並び＝check_dohan_add L51〜56（fee_kind null・cast_id・idem_key）・check_recalc＋audit 5 引数（0148_pre.md 249〜252） | 0148_pre.md 185〜253／check_dohan_add L33〜42・L50〜60 |
| ★5-idem | 211 | **確定（相談役 2026-09-17 夕・A-1）**: `p_idem_key uuid default null`。check_lines.idem_key は uuid・dohan／shimei の逐語行 `idem_key = p_idem_key` に合わせる（text では `uuid = text` で実行時エラー）。ヘッダ 33 行も同文に更新 | check_dohan_add L1・L35 |
| ★6 | 278〜375（set_product）・377〜563（product_bulk_insert） | live 逐語の CREATE OR REPLACE。set_product は 298 行の白名単 1 行のみ。product_bulk_insert は白名単 445 行＋by_type 集計に food／other（A-2・宣言 405〜406・分岐 531〜532・audit の jsonb 546・戻り値の jsonb 559＝計 6 行を上の drink／champ／bottle 行を写経して追加・各行末 `★6 新規行（写経元＝…）`）。live との diff＝12 行（−3／＋9） | docs/tmp/q0918_live_set_product.sql L21／q0918_live_product_bulk_insert.sql L68・L22〜24・L151〜153・L165〜166・L176〜177 |
| ★7 | 560〜607 | `set_cast_norm_self(p_period text, p_days_target integer, p_dohan_target integer, p_sales_target bigint, p_shimei_target integer)`。冒頭 3 行＝shift_wish_submit（0148_pre.md 321〜323）・`select org_id, store_id into v_row …`（327）・sys_norms 判定 584〜586（新規）・以後 set_cast_norm 275〜302 逐語（p_cast_id→v_cast・283〜286 の owner/manager 判定は削除・audit action 名 'set_cast_norm_self'） | 0148_pre.md 319〜327／274〜303 |
| ★8 | 612〜636 | `set_store_receivable_policy(p_store_id uuid, p_policy text)`。骨格＝set_store_okuri_mode 363〜381 逐語（enum 3 値＝0148_pre.md 519 の CHECK・select 列を receivable_policy に・update を実列に・audit キー名） | 0148_pre.md 357〜381・519 |
| ★10 | 285〜334 | `check_group_due` を CREATE OR REPLACE（live 逐語 44 行＝docs/tmp/q0918_live_check_group_due.sql・md5 7114f3c303e90df4fc816df96a013b17）。差分＝L20（通常小計 v_bx）と L36（外税の v_bx10／v_bx8）の `kind <> 'discount'` 条件行 2 箇所に ` and kind <> 'referral'`（行末 ★10）。L24 の `kind = 'discount'`（割引合計）は不触。333 行＝0007_f1b_checks_rpc.sql 82 の 4 ロール revoke 逐語（grant なし＝内部専用・acl {postgres=X/postgres} 不変）。gate 行なし・audit なし（内部ヘルパー＝原則8）・STABLE SECURITY DEFINER・search_path public 不変 | docs/tmp/q0918_live_check_group_due.sql L18〜20・L32〜36／0007:82 |
| ★9 | 705〜716 | revoke all … from public, anon → grant execute … to authenticated, service_role（新 4 本＋set_product 15 型＋product_bulk_insert） | 0146 166〜167／230〜231（revoke all）＋0112 285〜288（grant に service_role）・set_product の型並び＝0072_set_product_v15_acl.sql 16〜23 |

ブロックとの相違（突合で報告する点）:
1. ★5-idem: `p_idem text` → `p_idem_key uuid default null`（上記）。
2. ★3 の draft 判定行は payroll_run_create ではなく payroll_adjustment_add L70〜80 の写経（run_create に 'run not draft' は無い）。
3. audit_log_write の live 署名は 6 引数（p_reason default null）。★3 は adjustment_add と同じ 6 引数（reason='前期繰越'）・★5／★7／★8 は写経元と同じ 5 引数。
4. （A-2 で解消）★6 product_bulk_insert の by_type に food／other を追加＝bottle への誤カウントなし。既存 3 キーの値は不変（既存 suite の T6 は client 側 countByType＝別物）。
5. ★7 は `v_row`（shift_wish_submit）と `v_cast_org／v_cast_store`（set_cast_norm）の casts 読みが 2 回重複（両写経元を逐語で保持）。

## A-3 R11 本文（逐語）と紹介料の性格判定（案 P／案 Q）

台帳の R11 本文（逐語・docs/NOX_裁定台帳.md 3305 行「D 要調査レーン」）:
「R11 キャッチ入店時の紹介料＝金額は都度入力・人数単位（単価×人数）・紹介者を記録（自店＝キャスト／黒服から選択、外部＝自由入力の両方）・記録先は明細行・集計の出口は分析の節。check_lines への列追加を伴う見込み。」
v32 §6（台帳 3313 行に逐語収載）: 「**R11** キャッチ紹介料(金額都度入力・人数単位・紹介者を記録=自店選択と外部自由入力の両方・記録先は明細行・出口は分析の節。check_lines に列 3 + kind 'referral' + 専用 RPC + 集計 RPC)」
裁定272-2: 「check_lines.kind に 'referral'。RPC check_add_referral＝check_add_line の custom 分岐を写経（product なし・kind 固定）。gross は pay.ts の新キー referralTotal（client・本 mig の外）。」

**判定＝店が払う手当（案 Q）**。根拠: (i)「キャッチ入店時の紹介料」＝客を連れてきた紹介者（キャッチ／自店 cast・黒服／外部）へ店が払う対価で、本文のどこにも「客に請求」「伝票合計に載せる」の語が無い。(ii) 出口が「分析の節」と「cast の gross（272-2 referralTotal）」＝支払コストの集計面。(iii) 客請求なら価格（単価）はマスタか料金ルールに置くのが NOX の流儀（set／charge／fee_kind）で、「都度入力・紹介者を記録」は手当の記録形。
ただし本文は「記録先は明細行」としか言わず、伝票合計・課税額への載せ方を明示していない＝**相談役の確定待ち**（手貼り前）。

| | 案 P（客請求） | 案 Q（手当） |
|---|---|---|
| SQL | 現状の ★5 のまま（check_group_due は不触・referral の line_total が v_bx と tax 基底に入る＝伝票合計・課税額に載る） | ★10 を追加: check_group_due を CREATE OR REPLACE（live 逐語 45 行・md5(prosrc) 7114f3c303e90df4fc816df96a013b17・STABLE SECURITY DEFINER・acl `{postgres=X/postgres}`）。**条件行は 2 箇所**: L20 `where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount';`（通常小計 v_bx）と L36 同文（外税の税率別 v_bx10／v_bx8）。両方に ` and kind <> 'referral'` を足す（L24 の `kind = 'discount'` は不触）。4 ロール revoke（0007_f1b_checks_rpc.sql 82 `revoke execute on function public.check_group_due(uuid, text) from public, anon, authenticated, service_role;`）を ★9 と同じ節で再掲（CREATE OR REPLACE で ACL は保持されるが 0146 流で明示） |
| 写経元 | — | docs/tmp/q0918_live_check_group_due.sql（live 逐語）L18〜20・L32〜36 |
| 既存 pin（check_group_due を読む suite） | 影響なし（合計に載る＝既存式のまま） | **TS 三面鏡が同時改修になる**: lib/nox/check-calc.ts（groupDueFull・verify-nox-pricing 799「checks.total と groupDueFull の一致」）／lib/nox/receipt.ts（verify-nox-receipt 191・240「check_group_due と同式の手計算」）／verify-nox-rls 510（check-calc と DB の同値保証）／verify-nox-pricing-apply 356・368（checks.total＝サ料込み丸め後）／verify-nox-anon-guard 649（内部 3 本の probe＝BLOCKED・署名不変なら不動）・3482（discount 後の total）。referral 行が無い fixture では全て不動＝赤にはならないが、鏡像に `kind !== 'referral'` を足さないと referral 行のある伝票で UI 表示と DB total がずれる |
| client（272-2 の外） | referral 行は伝票合計に載る＝レシート・売上・日報（daily_report_aggregate は drink/champ のみ・checks.total 経由で総売上に入る）にも載る | 伝票合計・税・レシートに載らない。売上分析（category-map は other へ）と cast gross（referralTotal）にだけ載る |
| 人数単位 | ★5 は qty 1 固定（272-2 逐語）。R11「単価×人数」を活かすなら p_count を足す＝相談役裁定 | 同左 |

**2026-09-18 裁定272 追補で案 Q 確定** → ★10 を SQL に追加（★5 の直後＝kind 追加 → referral 除外の順）。client の check-calc／receipt の鏡像は手貼り後の client レーン。

## パス 2 再走（2026-09-18・★10 追加後）

- a: ★10 は live との diff 4 行（−2／＋2＝条件行 2 箇所のみ）。★6 は 2／12 行（前回どおり）。新 RPC 4 本の非★行＝写経元一致・不一致 0。
- b: 4 本とも SECURITY DEFINER・search_path public・★9 は revoke all／grant execute（12 行）。★10 は STABLE SECURITY DEFINER・SET search_path TO 'public'（live 逐語）＋4 ロール revoke 1 行。
- c: check_group_due に 'billing locked' なし（live も無し）＝課金ゲート名簿は B(a) 構造除外（docs/NOX_課金ゲート対象_v1.md 200 行に既収載）のまま＝**A/B 不変・全数不変**（名簿の増減は新 RPC 4 本だけ＝対象 125→128・除外 116→117）。
- d: audit 引数＝carryover_sync 6／referral 5／norm_self 5／receivable_policy 5。check_group_due は audit 呼出なし（内部ヘルパー・原則8）＝不変。
- i: check_group_due を見る既存 suite の型（**md5 固定は 0 本**＝張り替え点なし）:
  - verify-nox-pricing 799（段(21)）＝挙動固定: checks.total（check_recalc→check_group_due）と TS groupDueFull・手計算の三点一致。referral 行の無い fixture では不変。**TS 鏡像（lib/nox/check-calc.ts groupDueFull）に `kind !== 'referral'` を足すのが client レーン**（足さないと referral 行のある伝票で UI と DB がずれる）。
  - verify-nox-receipt 191／240（C3/C4 段）＝挙動固定: TS 面（groupDueFull／receipt.ts）の手計算・DB 非接続＝不変。鏡像改修は同レーン。
  - verify-nox-rls 510＝挙動固定: check-calc の groupDue Σ ＝ checks.total（fixture に referral 行なし）＝不変。
  - verify-nox-pricing-apply 356／368（段44(4)）＝挙動固定: checks.total ＝ Σline_total×サ料→丸め（referral 行なし）＝不変。
  - verify-nox-anon-guard 649（段5b INTERNAL_PROBES）＝署名固定（(uuid, text) 不変）＋anon BLOCKED＝不変。3482（段28）＝挙動固定: discount 適用後の total（referral 行なし）＝不変。
  - verify-nox-grants G2b＝ACL 走査（anon／PUBLIC なし）＝不変（4 ロール revoke 再掲で proacl {postgres} のまま）。
- j 致命候補（5 点別枠）: (1) 貼付ロールバック要因＝なし（★4 の drop→add は既存 distinct が部分集合・★1 の default 付き NOT NULL 列・★2 部分 unique は既存行が全て manual）。(2) function does not exist＝なし（★10 の CREATE OR REPLACE は同署名 (uuid, text)・呼出元 check_recalc は不触）。(3) 既存行の CHECK 違反＝なし。(4) ACL 逸脱＝なし（★10 の revoke は原 mig 逐語・grant なし）。(5) 依存＝★10 は ★4 の kind 'referral' 追加の後（順序 ★5→★10→★6）。**致命 0**。
- 手貼り可否: **可**（Agoora・ref 目視・貼り先証明・検証 1)〜9)＋5b）。live エンジンでの構文検証は未実施（DB 読取のみ）。

