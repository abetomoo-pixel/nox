# G-1（f0 非依存分）: 裁定272 適用欄・271-9 解除・裁定270 (c)・裁定253 の棚・裁定125 追補・v37 収蔵 bullet
def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f"{path}: expected 1 occurrence, got {n}: {old[:90]!r}")
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(s)
    print("edited", path)

L = 'docs/NOX_裁定台帳.md'
edit(L, [
 # 裁定272 適用欄（起草時の控え→適用済み）
 ('''適用＝**0148 は起草・突合済み・手貼り待ち**（supabase/migrations/0148_carryover_referral_selfnorm_types.sql・未追跡・sha256 5dfd2a9f11123f14ba7bc72f21133c0c3a34cf387234679b69d77327fab05444・661 行・パス 2 a〜j 機械照合＝写経行の不一致 0・致命 0・★1〜★9＝docs/tmp/0148_draft_notes.md）。client 側の前倒し（referralTotal／products 5 択／norm 入力口／STEP 4 受取方針／preview の carryover_sync）は別 commit（手貼り前・f0 未走）。''',
  '''**追補 2（案 Q 確定・2026-09-18・本便で確定）**: 紹介料は店が払う手当（R11 本文「キャッチ入店時の紹介料」）＝伝票合計・課税額から除外し cast の gross（referralTotal）にのみ載せる。★10＝check_group_due を live 逐語で CREATE OR REPLACE し、`kind <> 'discount'` の条件行 2 箇所（v_bx＝L20／v_bx10・v_bx8＝L36）に `and kind <> 'referral'` を足すだけ・4 ロール revoke を再掲（内部専用のまま）。三面鏡＝client の groupDueFull（lib/nox/check-calc.ts・bx／bx10／bx8 の 3 式）と receipt.ts（gross／bx10／bx8 の 3 式＋明細行を印字しない）に同じ除外を足した（`8af0be5`）。起草時の控え（sha256 5dfd2a9f…・661 行・★1〜★9）は ★10 追加で sha256 c2944808…b187・720 行・★10 本へ更新（突合 a〜j 全 OK・致命 0）。

適用＝**mig0148 手貼り 2026-09-18 11:1x JST**（Agoora・ref hiqbfagmkrdpmlqhkmsu・Success・便 1「docs: v37 収蔵」`fe0e19c` の直後）→ 検証 A-1〜A-6 **ALL OK**（docs/tmp/0148_post.md・11:20 JST）: payroll_adjustments 列 15（末尾 source／carry_from_payslip_id）・CHECK 4（source_ck）・index 5（carryover_uidx＝UNIQUE (run_id, cast_id) WHERE source='carryover'）・FK carry_from→payslips ON DELETE SET NULL／新 RPC 4 本の署名逐語・secdef・search_path・proacl 3 ロール（anon・PUBLIC なし）／'billing locked' referral・norm_self・receivable_policy＝t・carryover_sync＝f／check_lines_kind_check 11 値・products_type_check 5 値・既存行の違反 0／check_group_due proacl {postgres=X/postgres} 不変・prosrc に kind <> 'referral' 2 箇所／set_store_profile f2196d09… 不変・set_store_* 11 本＋money-core 3 本＋不触 9 本（写経元）の md5 が控えと一致／billing 全数 245・gated 128・G2b 0・anon 5 本 BLOCKED。**新 md5(prosrc)**＝payroll_carryover_sync `b9bb34aee0e85c6752928889cabd35db`／check_add_referral `bd6b52952f8aceb36b1576ea84ebc3b7`／set_cast_norm_self `0ce771c7fbd7effea276a3955487bdb2`／set_store_receivable_policy `b1f14280015dcc78a255b67b55e490df`／check_group_due `7114f3c3…→8285d0d8db07720b398705cc779b1d88`（白名単 2 本＝set_product `b07d0343…→5e57813a97fc6ae82c7fd4f86fd3d33d`／product_bulk_insert `cd2d1133…→d87ff33806687039fe9879cd824d791d`）。
名簿・pin（`8af0be5`）: 課金ゲート正本 A に check_add_referral（A1[K]）／set_cast_norm_self（A7）／set_store_receivable_policy（A8）・B(e) に payroll_carryover_sync＝**全数 241→245・対象 125→128・除外 116→117**（billing 段47-1 の 5 pin＋段47-3 kiosk 腕 16→17）・grants G31 の kiosk 腕 3 pin（18→19／20→21／18→19＝check_add_referral が check_add_line の腕を逐語で持つため＝ブロックの想定外の張り替え点）・anon-guard probe 4 本（988→992）・payroll-adjust 列 15／CHECK 4／index 5／FK 6／署名 3（101→110）。★名簿 A 節の説明文に他の live 関数名（check_group_due・auth_cast_id）を書くと docNames パーサが名簿として拾い「対象 130」で赤になった＝説明文では関数名を避ける（本便で文言修正）。
suite 5 本（`8af0be5`・全て Postgres 直結 1 トランザクション＋JWT claims emulate＋ROLLBACK＝残留 0・snapshot 一致・逆テスト各 1 本＝壊して赤→戻して緑）: verify:nox-carryover **30**（finalize→次期 sync で carryover 1 行＝amount 4000・源泉後・前期繰越・carry_from／冪等・更新追随／manager 自店可・他 org 'run not found'・staff／cast forbidden／reopen→削除→再 finalize→sync で消える／not draft・not found・前期なし 0／manual 2 行共存・carryover 2 行目は unique 違反／audit 6 行）・verify:nox-referral **25**（kind referral・product null・紹介者／★案 Q＝checks.total 不変（内税・外税）＝DB＝groupDueFull＝receipt の三面鏡／idem・bad amount・既定名「紹介料」・bad name／bad cast・inactive cast・外部紹介 null／forbidden・not open／pay.ts referralTotal 1:1／audit）・verify:nox-cast-norm-self **16**（本人 upsert・署名 5 引数＝他 cast を指せない・sys_norms=false は 'norms off'・入力検証・manager／owner は 'no cast for caller'・audit 4）・verify:nox-product-types **20**（CHECK 逐語 5／11・bulk_insert by_type 5 キー・set_product food／other・check_add_line kind=food・category-map other・pay 器 3 キー）・verify:nox-receivable-policy **13**（3 値受理＋audit 各 1・4 値目／null は 'bad receivable_policy'・manager／他 org／不在は forbidden）。既存 suite 追随＝receipt 64→**67**（referral 行ありでも 381／347／1311）・pricing 150→**151**（段43(21) C1r＝紹介料 1000 込みで DB=TS=手計算 300）・product-bulk 39・setup 61 不変。D-2 実測＝dev 3200 で /api/payroll/preview（A1・2097-12 の draft run）が 2 回とも HTTP 200・server log に `payroll_carryover_sync … changed=0`・audit 2 行（upserted 0／deleted 0）→ run と audit を戻し snapshot 一致。tsc 0・ui-tokens 新規 0。
コミット 3 本＝`478303d`（client 前倒し）／`fe0e19c`（v37 収蔵）／`8af0be5`（0148 SQL 収蔵＋名簿／probe／pin＋suite 5 本＋三面鏡）。教訓88（DB を触る node -e は finally で閉じる）は本便の全 script で遵守（提案のまま・収載は Agoora 判断）。'''),
 # 271-9 解除
 (''' 271-9 food／other は v1 では投入しない（products.type 拡張は 0148）。''',
  ''' 271-9 food／other は v1 では投入しない（products.type 拡張は 0148）。【2026-09-18 解除＝0148 適用（裁定272-4・`8af0be5`）: products.type／check_lines.kind に food／other・set_product／product_bulk_insert の白名単 +2・template-plan の食品除外 0（verify:nox-setup su(2-3) 除外 0）＝投入可】'''),
 # 裁定270 適用欄に (c)
 ('''裁定125（ローンチ範囲）の追補として本エントリを参照。W/S の (c)＝新規 org での実機は本件の B1 で代替。モックの出典＝mock/onboarding-2026-08/（step1〜5・業態別 step1／step2 各 5）。''',
  '''裁定125（ローンチ範囲）の追補として本エントリを参照。W/S の (c)＝新規 org での実機は本件の B1 で代替。モックの出典＝mock/onboarding-2026-08/（step1〜5・業態別 step1／step2 各 5）。
適用＝**(c) 0148＝`8af0be5`**（2026-09-18・裁定272 の適用欄参照）: 270-3 の 0148（繰越の消費・R11 紹介料・R19 cast セルフ norm）に 272-4（food／other）・272-5（receivable_policy setter）を同乗して dev 適用＝270-4 の R11・R19 は完了。残＝R15（設計裁定待ち）。'''),
 # 裁定253 の棚
 ('''9/17 の棚: R6＝裁定267（c0fa85c）／R11＝0148 棚（裁定270-3）／R15＝設計裁定待ち（第2期・裁定270-4）／R17・R18＝裁定259（f8fdc0e）／R19＝0148 棚（cast セルフ norm RPC・裁定270-3）／R20-a・b＝裁定257（ae0e387）・R20-c＝第2期。''',
  '''9/17 の棚: R6＝裁定267（c0fa85c）／R11＝0148 棚（裁定270-3）／R15＝設計裁定待ち（第2期・裁定270-4）／R17・R18＝裁定259（f8fdc0e）／R19＝0148 棚（cast セルフ norm RPC・裁定270-3）／R20-a・b＝裁定257（ae0e387）・R20-c＝第2期。
9/18 の棚: R11＝**0148 適用**（`8af0be5`・check_add_referral＝金額都度入力・紹介者 cast 任意（外部は null）・記録先 check_lines kind 'referral'・案 Q＝店が払う手当＝伝票合計除外・cast gross の referralTotal＝collect→pay→明細／CSV・裁定272-2＋追補 2）／R19＝**0148 適用**（set_cast_norm_self＋/mine「目標を設定」→/api/mine/norm-set・裁定272-3）＝D レーンの 0148 棚は解消。R15 は設計裁定待ちのまま。'''),
 # 裁定125 追補
 ('''- **ゲート待ち**（専門家・外部）: 通知基盤＋LINE（T3・N 系）／顧客紐付けの PII（顧客 v2 系）／税務出力（裁定23・W39）／写真拡張（K37 系）。''',
  '''- **ゲート待ち**（専門家・外部）: 通知基盤＋LINE（T3・N 系）／顧客紐付けの PII（顧客 v2 系）／税務出力（裁定23・W39）／写真拡張（K37 系）。
- **追補（2026-09-18・0148 完了）**: 裁定270 で追補した mig 2 本のうち 0148（繰越の消費 258-8・R11 紹介料・R19 cast セルフ norm・food／other・receivable_policy setter＝裁定272）は `8af0be5` で dev 適用・名簿・suite・三面鏡まで完了。ローンチ範囲の残り＝M 群（全て client）と R15（設計裁定待ち）。'''),
 # v37 収蔵 bullet（v36 の直後）
 ('''（269 出し分け／270・271 ウィザード・f0 pin 52 段 4,175）の最終断面。教訓88 は提案段階＝本収蔵では収載しない。docs のみ＝f0 不走（裁定256）。''',
  '''（269 出し分け／270・271 ウィザード・f0 pin 52 段 4,175）の最終断面。教訓88 は提案段階＝本収蔵では収載しない。docs のみ＝f0 不走（裁定256）。
- **handoff v37 収蔵（2026-09-18）**: Downloads から `docs/handoff/` へ収蔵（`fe0e19c`「docs: v37 収蔵」・git 追跡へ追加・sha 全64桁付き・教訓72）。v37＝`NOX_相談役引き継ぎ_2026-09-18_v37.md`（15,811 B・sha256 `e33766f2e0557942befbc259645e33d07d8d73a08242782e01897b1f508e4f5a`・64 桁と照合一致・Downloads 原本と収蔵後の再計算がともに同 sha・cp のバイト複写＝改行変換なし）。v36（`e3b73a0`・12,410 B・sha256 `e39df6315c8818fd0e1d9d1650845548948f548222b8da103c1b5a3ac71fa40b`）に続く版＝本断面（268 遅刻分数・裁定272 0148 設計・0148 起草／突合・client 前倒し 478303d）の最終断面。収蔵時は 0148 未貼付＝478303d を道連れにしないため push せず（同便の報告後に Agoora が 0148 を手貼り）。★便 1 の報告で機械時刻を「02:13 JST」と書いたが Git Bash の `TZ=Asia/Tokyo date` は tzdata 不在で UTC を GMT 表示する＝実際は 11:13 JST（本便で訂正・以後は `date`（Windows ローカル＝JST）と `date -u` を併記）。'''),
])
print("G-1 (f0 非依存分) done")
