# 初期設定 v5 対応表（裁定331・正本モック nox-setup-v5.html・便 MC0-3・2026-10-01）

読取のみ。モック＝6 ステップ（お店について／セット・延長・指名料／商品／キャスト報酬／会計と運用／見直して完了）・業態テンプレ 6 種（キャバクラ・標準／VIP 専用料金／売上スライド／ガールズバー／スナック／バー・スタッフバックあり）。
現行＝W/S ウィザード 5 STEP（app/(manage)/setup/setup-wizard.tsx・lib/nox/setup/template-plan.ts・templates/v1.json＝4 テンプレ＋bar 空）。
裁定331＝達成ボーナス多段／売上スライド／新人保証の自動終了は現行で動く範囲のみ表示（未実装は非表示・第 2 期）・勤務時間の数え方＝324・キャストのスマホ画面＝326 の 8 キー・打刻方法 3 択。

## 0. 分類の語

A＝実装済み（結線のみ）／B＝設定の器はあるが UI 未（ウィザードに節を足す）／C＝器なし（migration 要）／D＝未実装機能（第 2 期・非表示）。

## 1. STEP 1 お店について

| モック項目 | 現行 STEP | 既存の列／RPC | 分類 |
|---|---|---|---|
| 業態（6 種） | STEP 1 業態 5 択（cabaret／girlsbar／snack／lounge／bar） | settings_json.biz_type（enum 5＝set_store_profile 白名単）・テンプレ JSON 4＋bar 空 | **B/C**: モックの 6 種は「キャバクラ 3 変種＋ガールズバー＋スナック＋バー」＝biz_type enum に 'lounge' はあるが「VIP 専用料金」「売上スライド」は業態ではなく**特徴**（下行）＝biz_type は 5 のまま・テンプレ JSON を 6 本（cabaret_standard／cabaret_vip／cabaret_slide／girlsbar／snack／bar）へ増やす（client・JSON のみ） |
| お店の特徴: VIP 席の取り方（専用料金表／通常＋VIP 加算） | — | pricing_rules seat_kind 'VIP'（専用）／fee_kind 'vip_charge'（加算・0130）＝両方器あり | **B**（特徴に応じて料金テンプレの行を切替＝client） |
| 指名料（取らない／全員同額／ランク別） | STEP 2 の hon_fee／jonai_fee／dohan_fee（同額のみ） | stores.hon_fee（set_store_pricing）／pricing_rules hon_shimei・jonai_shimei × rank_id（set_pricing_rule）・cast_ranks（set_cast_rank） | **B**（ランク別＝ランク行＋ランク別ルールの投入を plan に足す） |
| 売上スライド | STEP 3 使う制度 sys_sales_slide | comp_plans.sales_slide（3 段固定・set_comp_plan）＝現行で動く（日次売上→当日の時給） | **A**（ON のとき STEP 4 でプランの 3 段入力を出す。「前月の売上で今月の時給」はモック文言＝現行は当日判定＝**文言を現行に合わせる**） |
| 新人保証 | — | cast_plan.overrides_json.guarantee＋valid_from／valid_to（set_cast_guarantee・0151）＝期間満了で基本時給へ戻る（自動終了＝満了） | **A**（期間はキャスト登録時＝ウィザードは説明のみ。「終了後は標準プランに戻る」＝現行の満了と一致。自動の**プラン切替**は D＝非表示） |
| 達成ボーナス（月の売上／本指名・最高段のみ） | — | comp_plan_components kind 'achievement_bonus'（1 段固定＝plan-editor「達成 100%・1 段」） | **D**（多段＝未実装・非表示。1 段なら A＝set_comp_component で投入可） |
| 店舗情報: 店舗名（領収書の表記）・電話・住所 | STEP 1 店舗名 | stores.name（set_store_profile）・receipt_address／receipt_tel（set_store_receipt_profile） | **A**（結線のみ） |
| インボイス登録（登録番号 T+13 桁・登録日・登録日前は印字しない） | — | settings_json.invoice_reg_no（set_store_receipt_profile p_reg_no） | **B＋C**: 番号は器あり・**登録日は器なし**（store 側の reg_valid_from が無い＝cast_tax_profiles にはある）＝0163 以降で settings_json 白名単 +1（invoice_reg_valid_from）＋receipt の印字判定（check_close 時点比較）＝migration 要 |
| 領収書の但し書き（既定） | — | receipt_footer（set_store_receipt_profile） | **A**（但し書きの既定＝footer 流用か別キーか＝裁定要・小） |
| 営業時間（開始・終了）・営業日の区切り | STEP 1 営業時間＋切替時刻 | set_store_business_hours（7 曜日同値）・set_store_biz_cutoff | **A** |
| 席（通常・VIP・カウンターの数） | STEP 2 の表示（テンプレ既定） | set_seat × n | **A**（数の入力を STEP 1 に出す＝client） |

## 2. STEP 2 セット・延長・指名料

| モック項目 | 現行 | 器 | 分類 |
|---|---|---|---|
| サービス料 | STEP 2 service_rate | set_store_pricing | A |
| 料金表の行（名前・曜日・時間・セット分数・金額・延長 30 分・チャージ・VIP 加算 1 人 60 分） | STEP 2 set_fee／ext_fee（店既定のみ・曜日時間帯なし） | pricing_rules（dow_mask・time_from／to・set／extension・vip_charge billing_unit・set_pricing_rule）＝器あり | **B**（曜日・時間帯別の行をテンプレから投入＝plan に set_pricing_rule を足す。現行は store 既定 1 行のみ） |
| 指名料（ランク別・同伴に本指名が自動） | — | cast_ranks＋pricing_rules hon_shimei／jonai_shimei × rank・stores.dohan_auto_hon（set_store_profile） | **B** |

## 3. STEP 3 商品（名前・価格・バック）

| モック項目 | 現行 | 器 | 分類 |
|---|---|---|---|
| 商品の選択（ON/OFF・すべて選ぶ／外す）・メニュー名・価格・バックあり／指名別 | STEP 2 「商品テンプレも取り込む」（一括） | product_bulk_insert＋set_product（back_mode rate／unit4・hon_pt・back_exempt_from_split） | **A**（個別選択 UI は client・RPC は既存） |
| 在庫管理する商品 | — | products.reorder_point（set_product）・stock_logs '入荷' | A（在庫数の投入は STEP 6 の「在庫の数を入れる」導線＝/master/stock） |

## 4. STEP 4 キャスト報酬

| モック項目 | 現行 | 器 | 分類 |
|---|---|---|---|
| 契約の形（業務委託／雇用）・報酬の型（時間報酬／1 稼働固定／固定給／売上歩合のみ） | — | casts.employment（set_cast_employment・0154）・cast_plan.overrides_json.pay_rule actual／shift_guarantee／fixed／per_shift（set_cast_plan） | **A**（店の既定として保存する器は無い＝ウィザードでは「既定の型」を表示し、キャスト登録時に適用＝client。**売上歩合のみ（時間報酬なし）＝器なし**→ D） |
| 勤務時間の数え方（確定シフトどおり／実際の出退勤）＋遅刻の猶予 | STEP 3 pay_time_basis 2 択 | set_store_pay_time_basis（324）・penalty_config.late_grace_min（set_penalty_config） | **A** |
| 報酬プラン（複数可・プラン名・基本時給／1 稼働あたり／固定額・本指名／場内／同伴バック） | STEP 2 の報酬既定 1 プラン | set_comp_plan（22 引数）・per_shift／fixed は cast 側 overrides | **A**（複数プランの投入＝client） |
| 新人保証（期間はキャスト登録時） | — | set_cast_guarantee | A（説明のみ） |
| 達成ボーナス（月の本指名／売上・最高段のみ） | — | achievement_bonus 1 段 | **D**（多段は非表示・1 段のみ） |
| 売上スライド（3 段） | STEP 3 sys_sales_slide | comp_plans.sales_slide | **A**（文言は現行＝当日判定へ） |
| 控除・支払い: 不就労控除／精算調整のひな形／ノルマ／日払い・前借り／送りの基本額 | STEP 3 使う制度（sys_norms 等）・完了時にひな形 3 件 | shortfall（0159・自動）・payroll_adjustments presets・sys_norms＋cast_quotas・daily_pays／advances（0156・店設定なし＝常に可）・okuri_base_amount（set_store_okuri_base） | **A**（不就労控除の ON/OFF＝器なし→常に ON＝表示のみ／日払いの ON/OFF＝器なし→D か表示のみ） |
| 給与の締め日と支払日（月 1／月 2・締め日・支払日・曜日締め） | — | payroll_runs.period 'YYYY-MM'（月 1 回・暦月固定） | **C**（締め日・支払日・月 2 回＝器なし＝0163 以降の migration：stores に pay_cycle 設定＋period_bounds の改稿＝大・第 2 期の候補） |

## 5. STEP 5 会計と運用

| モック項目 | 現行 | 器 | 分類 |
|---|---|---|---|
| 消費税の表示（外税／内税） | — | business_tax_status（課税／非課税）・products.tax_category・価格は税前 | **C**（内税表示＝器なし＝レシート・会計の表示だけなら client＝裁定要） |
| カード手数料の上乗せ・率 | STEP 4（0160 で T6 と同居） | card_tax_rate（set_store_pricing）＋contract_ack | A |
| 売掛（受けない／店が負担して受ける） | STEP 4 受取方針 3 値 | receivable_policy＋ar_enabled | A（モックの 2 択を現行 3 値へ） |
| 紹介料（キャッチ） | — | referrers（0152）・ON/OFF の店設定なし | A（説明＝紹介者マスタへの導線） |
| 支払い方法（現金／カード／電子マネー／QR） | — | payments.method cash／card／ar／other＋method_detail | **B/C**: 電子マネー・QR＝'other'＋detail で記録可・**店ごとの ON/OFF＝器なし**（レジのボタン出し分け）→ settings_json 白名単 +1（payment_methods）＝0163 以降 |
| 打刻の方法 3 択（本人／代行／キオスク・1 つ以上） | — | punch_self／punch_proxy／kiosk_punch＝3 本とも常時 | **C**（ON/OFF の器なし＝settings_json +1（punch_methods）で UI の出し分け・RPC 側の拒否は裁定要） |
| キャストのスマホ画面（給与明細 3 値／シフトの出し方 2 値／予約申請／ドリンク申告／修正申請／ランキング） | — | mine_settings 8 キー（set_store_mine_settings・0160） | **A**（STEP 5 に MineSettingsPanel を結線） |

## 6. STEP 6 見直して完了

| モック項目 | 現行 | 分類 |
|---|---|---|
| 確認表＋未入力の列挙＋修正リンク | STEP 5 確認表 | A（未入力の列挙＝client） |
| 次にすること（招待／シフト／在庫／レジ端末） | — | A（導線のみ） |

## 7. 業態テンプレ 6 種の雛形データ

| テンプレ | 現行 JSON | 収まるか |
|---|---|---|
| キャバクラ・標準（LUNA 型） | cabaret_standard | 収まる（曜日時間帯の料金行は pricing_rules へ・現行 JSON は店既定 1 行＝JSON の形を拡張） |
| キャバクラ・VIP 専用料金（NOIR 型） | — | 収まる（seat_kind 'VIP' の set／extension 行＋ランク 3＝cast_ranks＋hon_shimei × rank） |
| キャバクラ・売上スライド（ACE 型） | — | 収まる（comp_plans.sales_slide 3 段＝ちょうど。ACE の 4 段（0／3 万／7 万／12 万）は**at=0 を除く 3 段**で表現可） |
| ガールズバー（LILY 型） | girlsbar_standard | 収まる（キャストショット＝drink・unit4） |
| スナック（MUSE 型） | snack_standard | 収まる（ボトル＝bottle・キープは bottle_keeps） |
| バー・スタッフバックあり（NEST 型） | bar（空） | **半分**＝商品バックの受領者がスタッフ（memberships）＝check_lines.cast_id は casts 参照・**スタッフにバックを付ける器なし**→ D（デモ data と同じ結論＝接客スタッフを casts として登録して代替） |

## 8. 集計

| 分類 | 件数（上表の行） |
|---|---|
| A 実装済み（結線のみ） | 19 |
| B 器はあるが UI 未 | 6（特徴→料金行・ランク別指名料・曜日時間帯の料金テンプレ・席数入力・個別商品選択・業態テンプレ 6 本化） |
| C 器なし（migration 要） | 5（インボイス登録日・給与の締め日／支払日・内税表示・支払い方法の ON/OFF・打刻方法の ON/OFF） |
| D 未実装（非表示・第 2 期） | 4（達成ボーナス多段・新人保証のプラン自動切替・売上歩合のみ・スタッフへの商品バック） |

## 9. 便の分割（W5 3 便）と migration

- **W5-1**＝6 ステップ化＋テンプレ JSON 6 本（client・JSON）＋STEP 1 の特徴（VIP／指名料／スライド／新人保証／達成ボーナス 1 段）→ plan の分岐。A のみ。
- **W5-2**＝B の結線（曜日時間帯の料金行・ランク別指名料・席数・個別商品選択・複数プラン・契約の形の既定表示）＋STEP 5 の mine_settings 8 キー・打刻方法は「表示のみ」。
- **W5-3**＝C の UI（0163 適用後）＝インボイス登録日・支払い方法・打刻方法の出し分け。締め日／支払日と内税表示は裁定待ち（規模が大きい＝第 2 期）。
- **migration 0163**（D1 のデモ cron・Vault・入場ログと**同じ番号にはしない**＝D1 が 0163）→ W5 の器は **0164**: settings_json 白名単 +3（invoice_reg_valid_from／payment_methods／punch_methods）＋receipt の登録日判定。締め日／支払日（pay_cycle）は 0165 以降・裁定要。
