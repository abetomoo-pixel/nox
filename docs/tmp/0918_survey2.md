# 0918_survey2 — 読取のみ調査（裁定268／0148 5 点／M1 第2レーン・M5）

2026-09-17 16:03〜16:40 JST・HEAD `e3b73a0`＝origin/main（0 0）・worktree＝docs/tmp のみ・DB は読取のみ（pg 直結 3 本＝docs/tmp/q0918_s2{,b,c,d}.mjs・接続は各 1 回で閉じた）。
行番号は HEAD `e3b73a0` の現物。RPC の `L{n}` は `prosrc` の行番号（1 始まり）。

## 前提確認（ブロック 1〜4）

- git: HEAD `e3b73a0` ＝ origin/main・rev-list 0 0・`?? docs/tmp/` のみ。
- migrations 末尾 `0147_store_settings_keys.sql`・live `set_store_profile` md5(prosrc)＝`f2196d09d7f791a24bc439e6d0e78817`（手貼り末尾＝0147 一致）。
- Supabase: PostgreSQL 17.6・backends 24／clients 16／max 60・postmaster 起動 09-15 16:46＝Healthy。
- 裁定200 の 3 値＝直結 0／audit 60s 0／NOX verify 0（BANZEN の verify 5 は裁定249 で除外）・残骸 0。

## a. 裁定268（遅刻 +N 分）— /shift 今日タブの現在行

`app/(manage)/shift/shift-board.tsx`:

| 役割 | 行 | 現物 |
|---|---|---|
| 打刻 HH:MM を出す行（裁定222） | 1072〜1074 | `{punchIn.get(s.cast_id) && (` → `<span className="num" …>` → `{punchIn.get(s.cast_id)}打刻` |
| 今日行の map | 1027 | `{shiftsOn(todayDate).slice().sort((a, b) => hm2min(a.start_hm) - hm2min(b.start_hm)).map((s) => {` |
| KPI 遅刻判定（todayCounts） | 806〜827 | 817 `matchPunches({…})`／823 `if (fin?.type === "late") late += 1;`／824 `else if (fin?.type === "ok") arrived += 1;`／825 `else if (nowMs >= base + (hm2min(s.start_hm) + lateGraceMin) * 60_000) missing += 1;` |
| late_grace_min の state | 231 | `const [lateGraceMin, setLateGraceMin] = useState<number>(LATE_GRACE_MIN_DEFAULT);` |
| late_grace_min の読取 | 782〜789 | 787 `supabase.from("penalty_config").select("late_grace_min").eq("store_id", storeId).maybeSingle()`／789 `setLateGraceMin(typeof v === "number" && v >= 0 ? v : LATE_GRACE_MIN_DEFAULT)` |
| punchIn（HH:MM 文字列）の生成 | 774 | `if (p.type === "in") m.set(p.cast_id, new Date(p.punched_at).toLocaleTimeString("ja-JP", {hour:"2-digit", minute:"2-digit"}))` |
| punchRows（生 punch 行） | 228／777 | `useState<(PunchRow & { cast_id: string })[]>([])`／`setPunchRows(rows)` |
| import | 17〜19 | `hm2min, min2hm, spanMinutes`（shift-time）／`matchPunches, LATE_GRACE_MIN_DEFAULT`（punch-match）／`buildMatchInput, PunchRow` |

**行スコープに要る値は揃っている**: 1027 の map 内で `s.start_hm`（シフト開始）・`punchIn.get(s.cast_id)`（HH:MM 表示）・`punchRows`（`.filter(r => r.cast_id === s.cast_id)` で当人の in 打刻の `punched_at` が取れる＝todayCounts 817 と同じ入力）・`lateGraceMin`・`todayDate`・`hm2min` がいずれも参照可能。
「(+N 分)」＝ `max(0, punched_in_min − (hm2min(s.start_hm) + lateGraceMin))` を 1074 の直後に足すだけで **新規 fetch 0**。遅刻判定を KPI と同式にするなら 817 の `matchPunches` を行ごとに呼ぶ（既に 806〜827 で全行分を回している＝結果を Map に持てば二重計算も避けられる）。

## b. 0148 繰越の消費（258-8）— 前期 `payslips.breakdown_json.pay.adjustOverflow` を次期 run へ

### 現状の器（live）

- `adjustOverflow` は **client の PayResult にしか無い**（`lib/nox/pay.ts` 266 型・648 `const adjustOverflow = Math.min(adjTotal, Math.max(0, -netRaw));`・649 `net = netRaw + adjustOverflow`・685 返却）。DB 列なし・**RPC prosrc に文字列 `adjustOverflow` を含むものは 0**。
- 凍結先＝`payslips.breakdown_json`（列: id, org_id, store_id, run_id, cast_id, period, breakdown_json, net, paid, created_at, updated_at）。`payroll_finalize`（285 行）は L61〜64 で `e->'breakdown'->'pay'` の存在だけ検査し L257 `v_bd := (v_ps->'breakdown') || jsonb_build_object('ar',…,'adv',…,'okuri',…)` → L258 insert＝**pay の中身は素通し**（adjustOverflow も `breakdown_json.pay.adjustOverflow` にそのまま凍結される）。
- 表示は `app/(manage)/payroll/payroll-board.tsx` 804〜806（`超過 ¥… は当 run で回収されません`）のみ。
- 前期 payslips を読む既存経路＝`lib/nox/payroll/collect.ts` 450〜470（平均賃金: `payroll_runs` を `.lt("period", period)…limit(3)` → `payslips.select("run_id, cast_id, breakdown_json")` → `breakdown_json.pay.gross` を読む）。**同型で `pay.adjustOverflow` を読める**（直前 1 期に絞るだけ）。
- 調整行の読取＝`loadPayrollAdjustments`（collect.ts 500〜517・`payroll_runs` store×period → `payroll_adjustments` を created_at, id 順）。`core.ts` 138 で cast に載せ 223 で凍結形へ。

### 書く側の RPC（live・0146）

`payroll_adjustment_add(p_run_id uuid, p_cast_id uuid, p_mode text, p_amount integer, p_rate_bp integer, p_before_withholding boolean, p_show_detail boolean, p_reason text)`・81 行・grant authenticated:
- 役割: `v_role := auth_role()`（L4）・L41 `if v_role = 'manager' and v_store is distinct from auth_store_id()` → forbidden（＝owner／自店 manager）。
- 検査: reason 1〜200（trim）・mode ∈ fixed／rate・fixed は amount≥0 ∧ rate_bp null・run 存在＋org 一致・**`v_status <> 'draft'` → 'run not draft'**・cast 存在＋store 一致。
- **冪等キーなし・重複検査なし**（同一 run×cast×reason の 2 行目も通る）。返り値 id。audit_log_write あり。
- 削除＝`payroll_adjustment_delete`（50 行・draft のみ・reason 必須）。
- `payroll_run_create(p_store_id, p_period)` は自然冪等（既存 run があれば id と status を返す）。
- `payroll_reopen`（114 行）は L95 `delete from public.payslips where run_id = p_run_id` と L98 status→draft のみ＝**payroll_adjustments は消さない**（再確定時に同じ調整行がそのまま効く）。
- テーブル `payroll_adjustments`: mode ∈ fixed／rate（CHECK）・amount／rate_bp の排他 CHECK・reason 1〜200・**unique 制約なし**（PK のみ）・`source`／`carry_from` 系の列なし。

### (1) client 自動起票（`payroll_adjustment_add`・reason 固定文言）で要るもの

1. 起票タイミングの置き場（run_create 直後／preview 読込時／「繰越を取り込む」ボタン）。
2. 前期＝直前 1 期の `payroll_runs`（status finalized／paid）→ `payslips.breakdown_json.pay.adjustOverflow > 0` の cast 一覧（collect.ts 450〜470 の写し・admin 経路なら route、RLS 経路なら payslips SELECT ポリシーの範囲）。
3. 1 件ずつ `payroll_adjustment_add(run, cast, 'fixed', overflow, null, before_withholding=?, show_detail=?, reason='前期(YYYY-MM)繰越')`。
4. **before_withholding の裁定**（前期の超過は源泉前／後どちらの行から出たかを凍結値は区別しない＝`adjBefore`／`adjAfter` は残るが overflow は 1 数値）。

**(1) で足りない点（列挙）**:
- **冪等**: RPC に冪等キーも unique も無い → 二重クリック・2 端末・再訪問で **二重起票**する。client 側で `loadPayrollAdjustments` に「同 cast × reason 固定文言 の行あり→skip」を置くしかなく、reason は自由文（手入力で同文言を書けば誤検知・編集で外れる）。
- **reopen 時**: (i) 次期 P の reopen → 調整行は残る（問題なし）。(ii) **前期 P−1 の reopen→再確定で overflow が変わる**と、P に起票済みの繰越行は古い額のまま（自動更新の経路なし・手で delete→再起票）。(iii) P−1 が reopen 中（draft・payslips 削除済み）に P を preview すると **overflow が読めず 0 扱い**＝起票漏れ。
- **連鎖**: P でも net 0 床に当たれば P の adjustOverflow に繰越分が含まれて凍結される（恒等式で保証）→ P+1 へは「P の overflow」だけ読めばよい（P−1 を再読しない）。二重計上はしないが、**繰越の出所（元は何期）は失われる**（reason 文言のみ）。
- **表示**: 264-11 で超過は明細に出さない方針＝繰越行は show_detail の既定をどうするか（理由付きで出す＝明細に「前期繰越」が見える）。
- **権限**: owner／自店 manager のみ起票可＝cast 画面からは不可（想定どおり）。
- **監査**: audit は `payroll_adjustment_add` の通常記録（自動起票と手入力の区別は reason 文言だけ）。

### (2) 専用列／表（mig）で要るもの

- 最小: `payroll_adjustments` に `source text not null default 'manual' check (source in ('manual','carry'))` ＋ `carry_from_run_id uuid references payroll_runs`（nullable）＋ **部分 unique `(run_id, cast_id) where source='carry'`**（二重起票を DB で止める）。
- RPC 1 本 `payroll_carry_apply(p_run_id uuid)`（owner／自店 manager・run draft・前期 finalized/paid の payslips から `(breakdown_json->'pay'->>'adjustOverflow')::int > 0` を読み upsert・reason は固定文言・audit）。
- reopen 連携: `payroll_reopen` に「この run を carry_from に持つ次期の carry 行が存在すれば拒否 or 削除」を足すか、`payroll_carry_apply` を再実行で上書き（unique があるので `on conflict do update`）に寄せる。
- 0147 と同じく **手貼り前に live 逐語（0146 の `payroll_adjustment_add`／`payroll_reopen`）を写経元にする**。
- 既存 suite への影響: `verify-nox-payroll-adjust.ts`（101）は列追加では割れない（select 列指定）。`loadPayrollAdjustments` の select に `source` を足すかは表示要件次第。

**判断材料**: (1) は mig 0 で書けるが冪等と前期 reopen の 2 点が client では閉じない。(2) は列 2＋部分 unique＋RPC 1 で閉じる。

## c. 0148 R11 紹介料 — check_lines の現物と写経元

### check_lines（live）

列（20）: id, org_id, store_id, check_id, product_id, kind, pay_group(def 'A'), name_snapshot, unit_price_snapshot, qty, line_total, back_snapshot(jsonb), sort_order(def 0), created_at, time_auto(def false), fee_kind, **cast_id**(nullable・部分 index `check_lines_cast_idx where cast_id is not null`), block_no, tax_category(def 'taxable_10'), idem_key(部分 unique)。

CHECK（逐語）:
- `check_lines_kind_check CHECK ((kind = ANY (ARRAY['set','time','charge','drink','champ','bottle','custom','discount'])))` ← **'referral' を足す先**。
- `check_lines_fee_kind_check`: null または set／extension／dohan／hon_shimei／jonai_shimei／ext_shimei／vip_charge。
- `check_lines_dohan_cast_check CHECK ((fee_kind <> 'dohan') OR (cast_id IS NOT NULL)) NOT VALID`（＝「kind と cast_id の連動 CHECK」の写経元）。
- `line_total >= 0`／`qty > 0`／`unit_price_snapshot >= 0`／`pay_group` 1〜20／`tax_category` 4 値。
- live の kind 実在値: bottle 36／champ 11／charge 63／discount 1／drink 220／set 32／time 50（custom 0）。

v32 §6 の「check_lines 3 列」＝紹介者の記録（自店 cast 選択と外部自由入力の両方）→ 既存 `cast_id` を紹介者（自店）に流用するか、`referrer_cast_id uuid`／`referrer_name text`／`referral_people integer`（人数単位）の新設かは起草時の★。既存 `cast_id` は dohan／shimei の帰属 cast として `check_close` L93〜（バック配分）と collect.ts 274〜（率バック母数）が読む＝**流用すると紹介行がバック配分・母数に混ざる**（L93 は `kind in ('drink','champ','bottle')` で弾かれるが、fee_kind 経路 274 は `.in("fee_kind", [...])` で弾かれる）→ 混入はしないが意味が二重になるので新列が安全。

### RPC 写経元候補

- **書く**: `check_add_line`（64 行）の **custom 分岐 L45〜48**（`p_product_id` null → `p_kind in ('set','time','charge','custom')`・`p_name` 1〜80・`p_unit_price >= 0` → L55 insert → L60 `check_recalc` → L61 audit）。役割ゲートは L8〜28（owner／自店 manager／staff+`auth_staff_can_register`／cast+`auth_cast_can_register`／kiosk operator）。紹介料 RPC＝`check_referral_add(p_check_id, p_people, p_amount, p_referrer_cast_id, p_referrer_name, p_idem_key)` 型でこの分岐を写し、`kind := 'referral'`・`cast_id`／新列を書く・`idem_key` を使う（`check_dohan_add`／`check_shimei_add` が p_idem_key を持つ写経元）。
- **消す**: `check_remove_line(p_line_id)`（既存・kind を問わない）。
- 2 本目の候補＝`check_referral_set`（人数・額の更新）か、remove→add で済ませるか。

### 集計側（gross に載せる経路）

- `lib/nox/pay.ts` gross 合成＝**570〜579**: `honBack + jonaiBack + dohanBack + drinkBack + champBack + bottleBack + calculatedBack + salesBack + customTotal + input.extrasTotal`。紹介料バックを載せるなら (i) 新キー `referralBack` を 1 項足す（golden 6 値は入力 0 で不変・PayResult キー追加＝csv／payroll-board の型に波及）か (ii) 既存 `customTotal`（408 `customBacks(defs, metrics)`・BackDef 駆動）に「紹介人数」metric を足す。
- 読取は `collect.ts` に新設（既存の check_lines 読みは 229〜（`check_id, kind, qty`＝champ／bottle 本数）と 274〜（fee_kind ∈ hon／jonai・cast_id・line_total）の 2 本）＝**kind='referral' ∧ referrer_cast_id=本人 ∧ 窓内 closed** を cast 別に Σ（人数 or 額）。
- 壊れない確認: `lib/nox/analytics/category-map.ts` 41〜49 `categoryOf` は未知 kind → `"other"`（fee_kind が set 系なら time）＝'referral' は other へ。`daily_report_aggregate` L49 は `l.kind in ('drink','champ')` のみ。`check_close` L93 は 3 kind のみ。`register-board.tsx` 1026 `CLEARABLE_KINDS = {drink, champ, bottle}`＝「商品をクリア」は紹介行を消さない（意図どおり）。

## d. 0148 R19 cast セルフ norm

### 署名と権限行（live）

- `set_store_norm_config(p_store_id uuid, p_sales_enabled boolean, p_shimei_enabled boolean, p_shimei_scope text)`（36 行）: L7 org null guard・L8 billing・L11 scope ∈ hon／hon_jonai・L13 org 一致・**L14 `if public.auth_role() <> 'owner' then raise exception 'forbidden'`**（店ポリシー＝owner 限定）・settings_json の `sales_norm_enabled`／`shimei_norm_enabled`／`shimei_norm_scope` を jsonb_set（L21〜28）・L35 audit。
- `set_cast_norm(p_cast_id uuid, p_period text, p_days_target integer, p_dohan_target integer, p_sales_target bigint, p_shimei_target integer)`（39 行）: L9 org null guard・L10 billing・L11 period 正規表現・L12〜15 各 target ≥ 0・L17 cast の org 一致・**L18〜20 `if not (auth_role()='owner' or (auth_role()='manager' and v_cast_store = auth_store_id())) then raise exception 'forbidden'`**・L25 insert → L29 `on conflict (cast_id, period) do update`・L35 returning id・L37 audit `set_cast_norm`。
- `cast_norms`: 列 id, org_id, store_id, cast_id, period, days_target, dohan_target, sales_target(bigint), shimei_target・unique (cast_id, period)・各 target ≥ 0・period 正規表現。grant＝authenticated **SELECT のみ**（書込 grant なし）。RLS SELECT＝`org_id = auth_org_id() and (owner or store_id = auth_store_id()) and (auth_role() <> 'cast' or cast_id = auth_cast_id())`＝cast は自分の行だけ読める。
- **cast が自分の norm を書く既存 RPC は無い**（`%norm%` の RPC は上記 2 本のみ）。

### cast 自身が書く既存 RPC（写経元候補）

`auth_cast_id()` を使う RPC 15 本のうち **書込系**: `shift_wish_submit(p_date, p_start_hm, p_end_hm)`（33 行・L5 org guard → L6 `v_cast := auth_cast_id()` → L7 `if v_cast is null then raise exception 'no cast for caller'`・L27 insert・L30 audit）／`shift_wish_withdraw(p_wish_id)`／`shift_cast_confirm(p_shift_id)`／`attendance_set_self(p_date, p_status, p_eta, p_reason)`／`punch_self(p_type, p_lat, p_lng)`（L4〜8 同型）／`drink_claim_submit(p_check_id, p_product_id, p_qty)`／`set_cast_photo_updated_at(p_cast_id)`。
→ **写経元＝`shift_wish_submit` の冒頭 3 行（本人チェック）＋ `set_cast_norm` L11〜15／L25〜37（検査・upsert・audit）**。新 RPC `set_cast_norm_self(p_period, p_days_target, p_dohan_target, p_sales_target, p_shimei_target)`＝p_cast_id を持たず `auth_cast_id()` で確定（CLAUDE.md 二重防御 5「cast セルフ RPC のみ auth_cast_id() 本人チェック・manager 代理には入れない」）。
- 起草の★: (i) 店が norm を使う設定か（`sys_norms`＝0147・`sales_norm_enabled`／`shimei_norm_enabled`）を RPC 側でも見るか（`isSystemOn` は client）。(ii) 過去 period の自己申告を許すか（`p_period >= 当期` の関所）。(iii) manager が既に立てた norm を cast が上書きできるか（`on conflict do update` の写しだと上書き可）。

## e. 0148 products.type 拡張（food／other）

- CHECK 逐語: `products_type_check CHECK ((type = ANY (ARRAY['drink'::text, 'champ'::text, 'bottle'::text])))`。live 実在値 drink 20／champ 12／bottle 14。
- **連動して割れる DB 側**（★候補）:
  - `check_add_line` L37 `v_kind := v_prod.type;` → `check_lines_kind_check`（8 値）に 'food'／'other' が無いため **食品を伝票に載せた瞬間 CHECK 違反**＝check_lines の kind CHECK も同時拡張が必須。
  - `set_product` L16 `if p_type not in ('drink','champ','bottle') then raise exception 'bad type'`／`product_bulk_insert` L63 同ホワイトリスト（L147〜171 の type 別カウントも 3 種固定）。
  - `drink_claim_submit` L20 `v_prod.type not in ('drink','champ')` → food は申請不可（意図どおり）。`check_close` L93 `kind in ('drink','champ','bottle')`＝food はバック配分対象外（意図どおり・変更不要）。`daily_report_aggregate` L49 `l.kind in ('drink','champ')`（ドリンク売上）＝food は入らない（意図どおり）。
- **client で壊れる／欠ける箇所**:
  - `lib/nox/product-bulk.ts` 26 `ProductType = "drink"|"champ"|"bottle"`・45〜48 `TYPE_TOKENS`（food 語彙なし→CSV 行が不正扱い）・51 `TYPE_LABEL_JA`・149〜150 `countByType` 3 キー固定。
  - `app/(manage)/master/products/products-board.tsx` 661 type セレクト 3 択・935 `(["drink","champ","bottle"] as const).map` の集計タブ＝**food 商品は編集 UI で選べず・タブにも出ない**。
  - `lib/nox/ui/product-groups.ts` 15〜16 `TYPE_LABEL`／`TYPE_ORDER` 3 種・43 `products.filter((p) => p.type === ty)`＝カテゴリ未登録店ではレジのグループから **food が消える**（カテゴリ登録済みなら category_id 経路で出る）。
  - `lib/nox/pay.ts` 170 型 `type: "drink"|"champ"|"bottle"`（型のみ・計算は kind 別バックなので food は 0）。`lib/nox/payroll/collect.ts` 249 `if (kind !== "champ" && kind !== "bottle") continue;`＝安全。
  - `lib/nox/analytics/category-map.ts` 16 `CategoryKey` に other あり・44〜49 未知 kind→`"other"`＝**安全**。`register-board.tsx` 1026 `CLEARABLE_KINDS` 3 種＝「商品をクリア」で food 行が残る（要判断）。`bottle-keep-panel.tsx` 39 は bottle のみ＝安全。
  - `lib/nox/setup/template-plan.ts` 63 `CLASS_TO_TYPE`（food→null＝271-9 で除外中）・85 `ProductItem.type` 3 種＝0148 後に food を通す変更点。
- 検索した範囲: app／lib／components／scripts の `.type ===`／`case "drink"`／型リテラル（結果は上記以外は verify スクリプトと kiosk／punch の `type === "in"` 等の無関係ヒット）。

## f. 0148 receivable_policy

- 型・CHECK・既定（live）: `stores.receivable_policy text not null default 'customer_only'`・`stores_receivable_policy_check CHECK ((receivable_policy = ANY (ARRAY['disabled','customer_only','cast_liability_allowed'])))`。定義元＝`supabase/migrations/0114_c1_comp_v2_schema.sql` 256〜257。live 実在値＝4 店とも customer_only。
- **読む箇所＝0**: RPC prosrc に `receivable_policy` を含む関数なし（`%receivable%` を含む 13 本＝check_pay／receivable_collect 等は列名でなく receivables 表）・client（app／lib／components／scripts）に文字列ヒットなし。docs では `docs/dp/dp_v1_写像対応表_v1.md` 12／83／120（「列あり・UI なし」）。＝**器だけの列**。
- setter の写経元（`set_store_*` 12 本）:
  - 文言・構造が最も近い＝**`set_store_okuri_mode(p_store_id uuid, p_mode text)`**（text enum 2 値の検査 → org 一致 → **owner 限定** → 前値退避 → update → audit(prev/new)）。ただし okuri_mode は `settings_json` への jsonb_set＝**実列を書く写経元**は `set_store_tax_config`（text enum 複数＋整数）／`set_store_pin_policy`／`set_store_pricing`（`update public.stores set 列 = …`）。
  - 案: `set_store_receivable_policy(p_store_id uuid, p_policy text)`＝okuri_mode の骨格に `p_policy not in ('disabled','customer_only','cast_liability_allowed')` と `update public.stores set receivable_policy = p_policy` を差し替え・owner 限定・audit 'set_store_receivable_policy'。
  - 別案: 0147 の `set_store_profile` whitelist（20 キー・settings_json）に載せない（実列のため二重管理になる）。
- 読み手の設計は別件（D35「売掛 OFF→全非表示」は写像対応表 558 行で「新要件（器なし）」・0148 は setter のみ）。

## g. M1 第2レーン（21 表）と M5

### 21 表（横スクロール容器なし・HEAD `e3b73a0` の行）

裁定251 本文の「残り 21 表」＝9/14 調査 `docs/tmp/mobile_m1_m2_survey.md` §4-b「なし 24」から report-board 3 表（699／996／1256＝第 1 レーン `5543d9b` で `.nox-tablewrap` 済み）を除いた 21。直前 8 行に `overflowX`／`overflow:"auto"`／`.nox-tablewrap`／`.nox-ptwrap`／`.nox-barwrap` が無いことを機械確認（wrap=0）:

| # | ファイル:行 | `<table` の現物 |
|---|---|---|
| 1 | app/(manage)/analytics/analytics-board.tsx:1143 | `className="nox-table"` |
| 2 | app/(manage)/analytics/analytics-board.tsx:1213 | `className="nox-table"` |
| 3 | app/(manage)/master/cast-comp/comp-sections.tsx:225 | `nox-table` `width:"auto"` |
| 4 | app/(manage)/master/cast-comp/comp-sections.tsx:337 | `nox-table` |
| 5 | app/(manage)/master/cast-comp/comp-sections.tsx:393 | `nox-table` |
| 6 | app/(manage)/master/cast-comp/comp-sections.tsx:616 | `nox-table` |
| 7 | app/(manage)/master/cast-comp/comp-sections.tsx:709 | `nox-table` `width:"auto"` |
| 8 | app/(manage)/master/cast-comp/comp-sections.tsx:763 | `nox-table` |
| 9 | app/(manage)/master/cast-comp/comp-sections.tsx:833 | `nox-table` |
| 10 | app/(manage)/master/cast-comp/comp-sections.tsx:957 | `nox-table` |
| 11 | app/(manage)/master/cast-comp/plan/plan-editor.tsx:73 | `nox-table` |
| 12 | app/(manage)/master/seats/seats-board.tsx:121 | `nox-table`（9/14 は 105） |
| 13 | app/(manage)/payroll/payment-panel.tsx:106 | inline `width:"100%"` |
| 14 | app/(manage)/payroll/payroll-board.tsx:595 | `nox-table`（9/14 は 505） |
| 15 | app/(manage)/payroll/payroll-board.tsx:651 | `nox-paytable` `width:"100%"`（9/14 は 561） |
| 16 | app/(manage)/register/register-board.tsx:2820 | inline `width:"100%"`（9/14 は 2810） |
| 17 | app/(manage)/register/register-board.tsx:2993 | inline・幅指定なし＝内容幅型（9/14 は 2983） |
| 18 | app/kiosk-register/page.tsx:1037 | inline `width:"100%"` |
| 19 | app/kiosk-register/page.tsx:1096 | inline・幅指定なし＝内容幅型 |
| 20 | app/mine/ranking/page.tsx:49 | inline `width:"100%"` |
| 21 | components/simulator-panel.tsx:395 | inline `width:"100%"` |

補足: analytics-board.tsx:1291 は wrap あり（9/14 も「あり」側）。9/14 以降に `.nox-tablewrap` が入った表（第 1 レーン外）＝audit-board 394／442・business-hours-panel 325・feature-flags-panel 79・staff-shift-panel 172・drink-claim-queue 120・shift-board 1022／1446／1841・staff-shift-manage 156・setup-wizard 255＝いずれも 21 表の外。

### `.nox-ptwrap`（app/globals.css）

- 定義行 **1734**: `.nox-ptwrap { border: 1px solid var(--line); border-radius: 11px; background: var(--card); overflow: hidden; }` ← 251-(C) の `hidden → auto` 差し替え点（`overflow-x: auto` に）。
- **1824**（`@media (max-width: 900px)` 内・1823 から）: `.nox-ptwrap { border: 0; background: transparent; border-radius: 0; overflow: visible; }`＝≤900 ではカード積み（1825 `.nox-ptable, tbody, tr, td { display:block }`・1826 thead 非表示）に切り替わるため、**スマホ幅では 1734 の hidden は効いていない**（潰れ型ではなくカード型）。1734 を auto にする効果は 901px 以上のみ。
- ptwrap 8 表の現在行: categories-board 134／pricing-board 947・1002・1268・1443／products-board 488／stock-board 268／receipts-board 98。

### M5（shift-add-form の 2 ペイン grid）

- `app/(manage)/shift/shift-add-form.tsx` **365**: `<div style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr)", gap: 12 }}>`（364 `.nox-modalbody` 直下・366 コメント「左ペイン: キャスト選択（CastPicker 維持＝裁定108）」・367 `.nox-inset` 左ペイン）。
- 同ファイルに `@media`／`matchMedia`／`nox-2col` の使用なし（inline style のため CSS 側から上書き不可＝クラス化するか、`gridTemplateColumns` を `repeat(auto-fit, minmax(230px, 1fr))` 等に変えるかの 2 択）。他の grid は 405 `.nox-calgrid`・509 `display:"grid", gap:5`（ペイン内）。

## 変更なし

repo の追跡ファイルは不触（`git status` ＝ `?? docs/tmp/` のみ）。DB 書込なし。dev サーバ起動なし。
