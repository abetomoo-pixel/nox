# 0918_survey（読取のみ・HEAD 580d0b4・変更なし）

## g2. nox_nightlife_store_templates_v1.json の各キーの書き先（2026-09-17 14:37〜14:45 JST）

- 原本: C:\Users\abet\Downloads\nox_nightlife_store_templates_v1.json（75,783 B・schema_version 1.0・store_templates 4＝cabaret_standard 67 品／girlsbar_standard 34 品／snack_standard 28 品／lounge_standard 40 品）。docs/handoff・docs/setup には未収蔵（docs/tmp/templates_v1.json に作業用の写しのみ）。
- template_policy.do_not_auto_enable＝["quota", …]（3 件）＝テンプレは初期値であり自動 ON しない項目がある。
- 書き先の原則: 器がある値は既存 setter RPC（全て owner 限定・課金ゲート内蔵）で行数分呼ぶ（裁定269-6＝一括 RPC は作らない）。**テンプレ側の語彙が NOX の enum と違うキーは client 定数の写像で吸収**し、器が無いキーは書かない（下記 §器なし）。

### business_hours（open／close／business_day_cutoff）

| キー | 書き先 | RPC 署名 | 注記 |
|---|---|---|---|
| open／close | public.store_business_hours（dow 0〜6・is_closed・open_hm `^([01][0-9]|2[0-3]):[0-5][0-9]$`・close_hm `^([0-3][0-9]|4[0-7]):[0-5][0-9]$`＝30 時間制） | `set_store_business_hours(p_store_id uuid, p_dow integer, p_is_closed boolean, p_open_hm text, p_close_hm text)`＝**7 回**（曜日ごと） | テンプレは 1 組（全曜日同一）＝7 行に展開。close "02:00" は 30 時間制で **"26:00"** に写像（close_min > open_min の検証あり＝"02:00" のままだと 'bad hours'）。snack の close "00:00"→"24:00"・girlsbar "05:00"→"29:00"・lounge "01:00"→"25:00" |
| business_day_cutoff | stores.settings_json.biz_cutoff_hm | `set_store_biz_cutoff(p_store_id uuid, p_hm text)` | "06:00"／"04:00"／"05:00" をそのまま |
| （参考）stores.open_time | 列あり（text・既定 null）だが setter 無し＝書かない | — | — |

### seats（table_count／vip_count／counter_count）

| キー | 書き先 | RPC 署名 |
|---|---|---|
| table_count | seats（kind='卓'）を本数分 | `set_seat(p_id uuid, p_store_id uuid, p_name text, p_kind text, p_sort_order integer, p_is_active boolean)`＝p_id null で新規・本数分ループ（name は "卓1".. 等 client 定数・sort_order 連番） |
| vip_count | seats（kind='VIP'） | 同上 |
| counter_count | seats（kind='カウンター'） | 同上（kind CHECK＝'卓'／'カウンター'／'VIP' の 3 値） |

### features（8 種＋テンプレ固有 2 種）

| キー | 器 | 書き先 | 注記 |
|---|---|---|---|
| vip | あり（間接） | seats kind='VIP' の有無＋pricing_rules fee_kind='vip_charge'（vip_surcharge_yen） | 独立フラグ列なし＝VIP 席 0 本・vip_charge 行なしが OFF |
| counter | あり（間接） | seats kind='カウンター' の有無 | 同上 |
| cast_rank | あり | cast_ranks（`set_cast_rank(p_id, p_store_id, p_name, p_is_active)`）＋pricing_rules hon_shimei の rank_id 別 | ランク名はテンプレに無い＝client 定数（例 3 段）か 0 行 |
| main_nomination | あり | stores.hon_fee（`set_store_pricing`）＋comp_plans.hon_back | OFF＝0 円 |
| in_house_nomination | あり | stores.jonai_fee＋comp_plans.jonai_back | 同上 |
| accompaniment | あり | stores.dohan_fee＋dohan_auto_hon（set_store_profile）＋comp_plans.dohan_back | 同上 |
| bottle_keep | **なし（フラグ列なし）** | bottle_keeps 表は常設・ON/OFF の器なし | UI は常に出る＝記録のみ |
| accounts_receivable | **なし（setter なし）** | stores.receivable_policy（'disabled'／'customer_only'／'cast_liability_allowed'・既定 'customer_only'）に列はあるが **書く RPC が 0 本**（app／lib／migrations に update なし） | OFF にするには setter が要る（0148 候補 or set_store_profile 白名単） |
| request（girlsbar のみ）／karaoke（snack のみ） | **なし** | fee_kind に request／karaoke は無い（'set','extension','dohan','hon_shimei','jonai_shimei','ext_shimei','vip_charge'） | request は ext_shimei（延長指名）で代用可か要判断・karaoke は products（type 'drink' 以外なし）にも置けない |

### customer_pricing（全キー・union 13）

| キー | 書き先 | RPC 署名 | 注記 |
|---|---|---|---|
| set_60min_yen／set_90min_yen | stores.set_min／set_fee（店既定）＋pricing_rules fee_kind='set'（duration_min） | `set_store_time_pricing(p_store_id, p_set_min, p_set_fee, p_ext_min, p_ext_fee, p_time_mode, p_time_per)`／`set_pricing_rule(p_id, p_store_id, p_fee_kind, p_seat_kind, p_dow_mask, p_time_from_min, p_time_to_min, p_rank_id, p_amount, p_duration_min, p_priority, p_is_active, p_name, p_tax_category, p_category_id, p_billing_unit)` | 60／90 は set_min に写像（set_min 1..1440） |
| extension_30min_yen／extension_60min_yen | stores.ext_min／ext_fee は **1 組のみ**＝2 種あるときは pricing_rules fee_kind='extension'（duration_min 30／60）を 2 行 | set_pricing_rule | cabaret は 30 と 60 の両方＝pricing_rules 2 行（店既定は 30 分） |
| main_nomination_yen | stores.hon_fee | `set_store_pricing(p_store_id, p_hon_fee, p_jonai_fee, p_dohan_fee, p_service_rate, p_card_tax_rate, p_round_unit, p_round_mode)` | 1 回で 7 値＝テンプレに無い card_tax_rate／round_unit／round_mode は現値を読んで渡す（省略不可） |
| in_house_nomination_yen | stores.jonai_fee | 同上 | |
| accompaniment_yen | stores.dohan_fee | 同上 | |
| vip_surcharge_yen | pricing_rules fee_kind='vip_charge'（seat_kind 'VIP'） | set_pricing_rule | stores に列なし |
| service_charge_pct | stores.service_rate（0..100） | set_store_pricing | |
| tax_pct | **なし（率の列なし）** | products.tax_category／pricing_rules.tax_category は 'taxable_10'／'taxable_8'／'exempt'／'out_of_scope' の区分・stores は business_tax_status（taxable／exempt）と price_display | 10% 固定＝書かない（8% にする器はあるが率そのものは持たない） |
| request_yen（girlsbar） | **なし**（fee_kind に request なし） | — | ext_shimei（延長指名・stores.ext_shimei_enabled）で代用するかは裁定 |
| karaoke_per_song_yen／karaoke_flat_yen（snack） | **なし** | — | 商品化しても type は drink/champ/bottle のみ |

### compensation_defaults（union 9 キー）

| キー | 書き先 | RPC 署名 | 注記 |
|---|---|---|---|
| hourly_yen | comp_plans.base（プラン 1 本を新規） | `set_comp_plan(p_id, p_store_id, p_name, p_base, p_hon_back, p_jonai_back, p_dohan_back, p_sales_slide jsonb, p_point_slide jsonb, p_is_active, p_hon_back_mode, p_hon_back_rate, p_jonai_back_mode, p_jonai_back_rate, p_dohan_back_mode, p_dohan_back_rate, p_product_back_mode, p_product_back_rate, p_product_back_fixed)`＝19 引数 | プラン名は client 定数（例「標準」）・cast への割当（set_cast_plan）はウィザードでは行わない |
| newcomer_guarantee.enabled／hourly_yen／days／mode | **部分**: comp_plan_components kind='guarantee_min'（mode 'amount'・amount・params {period:'month'}）＝**月額の最低保証**のみ | `set_comp_component(p_id, p_plan_id, p_kind, p_mode, p_amount bigint, p_rate, p_params jsonb, p_priority, p_is_active)` | **hourly_yen（新人時給）・days（適用日数）・mode（fixed／minimum）は器なし**＝「入店 N 日は時給 X」を表す列が無い（cast_plan.valid_from／valid_to で期間付きプラン割当はできるが cast 単位＝テンプレでは書けない） |
| main_nomination_back／in_house_nomination_back／accompaniment_back（type fixed・value 円） | comp_plans.hon_back／jonai_back／dohan_back＋*_back_mode='per_count' | set_comp_plan | type=fixed → per_count＋円。type=sale_pct なら mode='rate'＋*_back_rate（0..100・母数は指名料金＝裁定D3）。テンプレ 4 種は全て fixed |
| drink_back.type=product_specific | products 側（back_mode／back_value）＋comp_plans.product_back_mode='product_rule' | set_comp_plan／set_product | product_rule＝商品ごとの back を採用（既定） |
| bottle_back（type sale_pct・value 10）／champagne_back（girlsbar は sale_pct 10） | **部分**: comp_plans.product_back_mode='plan_rate'＋product_back_rate は**全商品一律**＝ボトルだけ 10% にはできない → 商品側 products.back_mode='rate'・back_value=10 を該当商品に書く（product_rule） | set_product／product_bulk_insert 後の set_product | |
| champagne_back.type=tier（champagne_4step: ≤49,999→10%／≤149,999→15%／≤299,999→20%／それ以上→25%） | **なし** | — | 売価帯で率が変わる商品バックの器なし（custom_back_defs basis 'champCnt' は本数基準・sales_slide は日次売上→時給）。近似＝products.back_mode='rate' に代表率 1 値 |
| request_back（girlsbar・fixed 500） | **なし**（request の器なし） | — | |
| snack: newcomer_guarantee {enabled:false}・drink_back none・bottle_back none | 書かない／products.back_mode='rate' back_value=0 | — | |

### products（67／34／28／40 品）

| キー | 書き先 | 注記 |
|---|---|---|
| name | products.name（≤80） | |
| accounting_class（drink／bottle／champagne／food／other／wine） | products.type＝**'drink'／'champ'／'bottle' の 3 値のみ** | 写像: drink→drink・champagne→champ・bottle→bottle・**wine→bottle（近似）・food／other→器なし**（type CHECK で拒否＝food 7＋7＋4＋6・other 2 は登録不可か 'drink' に寄せる判断） |
| display_category（15 種） | product_categories（name・sort_order）→ products.category_id | product_bulk_insert が `category` 文字列から**自動作成**（既存名は再利用・上限あり 'too many categories'） |
| cost_yen | product_costs.cost（product_id 別・product_bulk_insert の `cost`／set_product の p_cost） | **器あり** |
| gross_margin_pct | **なし**（導出値・列なし） | 表示側で (price−cost)/price を計算するのみ |
| sale_price_yen | products.price（≥0） | |
| inventory_managed | **なし**（在庫対象フラグ列なし・stock_logs は全商品共通の台帳・products.reorder_point は発注点） | true/false は書けない（reorder_point を null／数値で代用するのは意味が違う） |
| back.type／back.value | products.back_mode（'rate'／'unit4'）＋back_value（rate=%）＋unit4_json {hon,jonai,dohan,free} | 対応表は下記。**product_bulk_insert は back を受け取らず 'rate'／0 固定**＝back を持つ商品は bulk 後に set_product（15 引数・p_id 指定）で 1 品ずつ上書き |
| status（全品 active） | products.is_active | bulk は true 固定 |

**product_bulk_insert の署名と 1 行に要る列**: `product_bulk_insert(p_store_id uuid, p_items jsonb)`（配列 1..300・owner／manager）。item は `{ name（必須・≤80）, type（'drink'|'champ'|'bottle' 必須）, price（整数 ≥0 必須）, cost（整数 ≥0・任意→product_costs）, category（文字列・任意→product_categories 自動作成） }` のみ。insert 値＝`back_mode 'rate', back_value 0, hon_pt 0, back_exempt_from_split false, reorder_point null`。**back／hon_pt／tax_category／reorder_point は受け取らない**。

**back.type（テンプレ 6 値）と NOX back_mode の対応**

| テンプレ back.type | 意味 | NOX の器 | 写像 |
|---|---|---|---|
| none | バックなし | products.back_mode='rate'・back_value=0 | 0% |
| fixed | 固定額（円） | products.back_mode='unit4'・unit4_json {hon,jonai,dohan,free} | 4 種同額で value を入れる（指名種別ごと単価の器を「同額」で使う） |
| sale_pct | 売価% | products.back_mode='rate'・back_value=value（0..100） | そのまま |
| gross_profit_pct | 粗利% | **なし**（粗利基準のバック無し・cost は product_costs にあるが計算経路が無い） | 近似＝売価% に換算（value×(1−cost/price)）か据え置き。テンプレ 4 種の商品では **使用 0 件**（union は fixed／none／sale_pct／tier） |
| tier | 金額帯スライド（champagne_4step） | **なし** | 代表率 1 値の 'rate' に落とすか、custom_back_defs（basis 'champCnt'＝本数×固定額）で別表現 |
| product_specific | 商品個別（drink_back の指定値） | comp_plans.product_back_mode='product_rule' | 商品側の back を採用＝上の 5 値を各商品に書く |

### 器が無いキー（列挙）

1. features.bottle_keep（ON/OFF 列なし・常設）／features.accounts_receivable（stores.receivable_policy に列はあるが **setter RPC 0 本**）／features.request／features.karaoke
2. customer_pricing.tax_pct（率の列なし・区分のみ）／request_yen／karaoke_per_song_yen／karaoke_flat_yen
3. compensation_defaults.newcomer_guarantee.hourly_yen／days／mode（月額 guarantee_min のみ・期間付き時給の器なし）／champagne_back.type=tier（帯スライド）／request_back／bottle_back を「ボトルだけ一律 %」にするプラン側の器（plan_rate は全商品一律）
4. products.gross_margin_pct（導出）／inventory_managed（フラグ列なし）／accounting_class の food・other（type 3 値のみ・wine は bottle に近似）／back.type=gross_profit_pct・tier
5. cost_yen は **器あり**（product_costs）＝例示にあったが「器なし」ではない。

### 書込順（ウィザード STEP 2 の案・全て既存 RPC・裁定269-6）
set_store_business_hours ×7 → set_store_biz_cutoff → set_seat ×N → set_store_pricing（7 値・現値マージ）→ set_store_time_pricing → set_pricing_rule（extension 2 段・vip_charge・必要なら set 90 分）→ set_comp_plan（19 引数）→ set_comp_component（guarantee_min・enabled のときのみ）→ product_bulk_insert（≤300・type 写像後）→ set_product（back を持つ商品のみ・p_id 指定）。cast_ranks（set_cast_rank）はランク名がテンプレに無いため任意。
