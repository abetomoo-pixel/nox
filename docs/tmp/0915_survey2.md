# 2026-09-15 調査 その 2（読取のみ・HEAD 32d2123・実装なし）

出典＝相談役ブロック 2026-09-15 14:01。live 逐語＝`docs/tmp/0915_dump.txt`（末尾に本調査分を追記）。何も変更していない。

## a. punches に書き込む RPC の全数

- prosrc 走査（`public.punches` を含む関数）＝**3 本のみ**・いずれも insert だけ（update／delete する関数は無い）:
  - `kiosk_punch(p_cast_id, p_pin, p_type)`＝source **'kiosk'**（PIN 照合後に in／out を盲目記録）
  - `punch_self(p_type, p_lat, p_lng)`＝source **'self'**（本人・auth_cast_id）
  - **`punch_proxy(p_cast_id, p_type, p_note)`＝source 'manager'**（owner 全店／manager 自店の代理打刻・inactive cast は拒否・audit 'punch_proxy'）
- ⇒ 'manager' を書く経路は **RPC として実在**（punch_proxy）。ただし **UI からの呼び出しは 0 件**（app／lib に punch_proxy の参照なし）＝定義済み・未使用。dev の punches 実データは 218 行すべて self/in（kiosk・manager・out は 0 行）。
- 打刻の訂正・削除の RPC は無い（打刻は追記のみ）。

## b. deductions（live 逐語＝dump に追記）

- 13 列: id／org_id／**store_id**／name／amount（CHECK ≥0・default 0）／**per**（CHECK **day／month／rate**）／is_active／created_at／updated_at／**kind**（CHECK **unworked／sanction／statutory／agreed_cost／store_receivable／advance_settlement** の 6 種・default 'agreed_cost'）／basis_confirmed_at／basis_confirmed_by／basis_note（sanction のとき 3 つとも必須＝CHECK deductions_sanction_basis_check）。
- **店単位**（store_id・cast_id 列なし）。**適用期間の列（有効期間・effective_from）は無い**＝is_active のオン／オフのみ。index＝store_id／org_id。
- 格納形＝amount は整数（円）。per='day' は出勤日数（effDays）×amount、'month' は 1 回、'rate' は売上×amount% を fixedDedOf（pay.ts 419）が算出。
- dev 実データ: CLUB NOX＝sanction/day 1,000 が 1 件、NOX-VERIFY-A1＝agreed_cost/day 2,000 が 1 件。
- ※「kind 7 種」の記載は誤りで **live は 6 種**（pay.ts 121 の型も同じ 6 値）。

## c. attendance_incentives（live 逐語＝dump に追記）

- 14 列: id／org_id／store_id／biz_date／**kind**（CHECK bonus／drink_boost・default 'bonus'）／**amount_mode**（CHECK per_head／pooled）／amount（≥0）／**status**（CHECK published／cancelled）／created_by／created_at／cancelled_by／cancelled_at／reason（≤200）／**target_cast_ids uuid[]**（null＝全員）。部分 UNIQUE（store_id, biz_date where status='published'）＝同日 1 件。
- `incentive_publish(p_store_id, p_biz_date, p_kind, p_amount_mode, p_amount, p_reason, p_target_cast_ids)`: org null→forbidden／billing／bad date／**kind は 'bonus' のみ受理**（drink_boost は予約値→'kind reserved'）／bad mode／bad amount／reason ≤200／target の空・重複→'bad target'／店の org 照合・owner∨manager 自店／target の帰属検証（同 org・同 store の casts）／**paid 期間は 'paid period'**／insert on conflict（部分 unique）do nothing→'already published'／audit。
- `incentive_cancel(p_incentive_id)`: org 照合・ロール・published のみ・paid 期間拒否・status='cancelled'＋cancelled_by／at・audit。
- attendance 表そのものには書かない（前回の走査で「attendance を書く関数」に出たのは名前の部分一致＝attendance_incentives）。

## d. 給与計算の client 側（控除・一時金・罰金の合成）

### 組み立ての経路

1. UI（payroll-board）は **金額を計算しない**。`/api/payroll/preview` と `/api/payroll/finalize` を fetch するだけ（225／256 行）。
2. `app/api/payroll/finalize/route.ts` 20〜48 行: `computePayrollDraft(admin, supabase, storeId, period, { previewDefaults: false })` を**確定時点で再計算**（プレビュー値は使わない）→ blockers（税区分／プラン未設定）があれば 422 → `draft.rows` から p_payslips を組む＝`{ cast_id, net, breakdown: { pay, extras, cast_name }, ar_deducted, ar_carried, adv_deducted, adv_carried, okuri_deducted }` → `admin.rpc("payroll_finalize", …)`（service 経路）。
3. `lib/nox/payroll/core.ts computePayrollDraft`（117〜）: `collectPeriod`（collect.ts）で対象 cast・マスタ（plans／deductions／penalty_config／norm／tax）・incentives・punches／shifts／attendance・receivables／advances／transport を読む → cast ごとに:
   - 179: **extras**＝incentiveExtrasFor（出勤インセンティブ・受給者は punch-match final ∈ {ok, late}・pooled は最大剰余法）
   - 187: `pay0 = payOf(buildPayInput(…, extrasTotal, ar 0, adv 0, okuri 0))` → available＝pay0.net
   - 191〜197: budget＝available − takeHomeFloor() を **送り（transport・繰越なし）→前借り（advances）→売掛（receivables）** の順に allocateCategory で消費
   - 205: `pay = payOf(buildPayInput(…, extrasTotal, ar, adv, okuri))` → **net＝pay.net**（恒等チェック 208）
4. `lib/nox/pay.ts payOf`（556〜625）の合成順序（純関数・整数）:
   - **grossBase**＝timePay＋honBack＋jonaiBack＋dohanBack＋drinkBack＋champBack＋bottleBack＋calculatedBack＋salesBack＋customTotal＋**extrasTotal（一時金＝源泉対象として gross に含める・裁定23-b）**
   - gross＝grossBase＋achievementBonus＋guaranteeAdd（保証時給の床）
   - **fixedDed**＝fixedDedOf（sanction 以外の deductions・per day／month／rate）＋ **sanction.applied**（雇用は労基法91条の cap＝1 回 ≤ 平均賃金/2・総額 ≤ gross/10・委託は上限なし）
   - **fine**＝absentN×fineAbsent＋lateN×fineLate（punch-match の final 回数×penalty_config）
   - withholding＝withholdingOf(gross, periodDays, taxMode)（委託のみ・floor((gross−5000×日数)×10.21%)）
   - normPenalty＝normPenaltyOf（ノルマ未達）
   - **net＝gross − fixedDed − fine − withholding − arDeduct − advanceDeduct − okuriDeduct − normPenalty**（619〜）
5. DB 側 `payroll_finalize` は breakdown をそのまま凍結し ar／adv／okuri の遷移だけを注入（cast_name も素通し）。**client が渡した net をそのまま insert**（RPC は形の検証のみで再計算しない）＝計算の正は lib/nox/pay.ts（golden 5931／125802 で係留）。

### breakdown_json の実データ 1 件（DEMO CLUB NOX・あべ・2026-09・paid・net 130,251）

```
top: pay, extras, ar, adv, okuri, cast_name
pay（plan／eplan を除く要点）:
  gross 130251 / net 130251 / taxMode "委託" / withholding 0 / fixedDed 0 / sanction null / fine 0 / lateN 0 / absentN 0
  timePay 0 / honBack 9000 / jonaiBack 0 / dohanBack 0 / drinkBack 1480 / champBack 52000 / bottleBack 1200 / salesBack 8618
  customTotal 57953（cbacks: シャンパンバック sales 57453・ドリンクバック flat 500）/ calculatedBack 0 / achievementBonus 0 / guaranteeAdd 0
  arDeduct 0 / advanceDeduct 0 / okuriDeduct 0 / normPenalty 0
  wage 3000 / sRate 0.03 / wHours 0 / hasOv false / wbasis {保証:1, 売上:2}
  wdays [{d:1, basis:保証, sales:11867, hourly:3000, pts:1.4}, {d:2, basis:売上, sales:101200, hourly:3500, pts:12.3}, {d:10, …}]
  plan／eplan: {id, name "レギュラー", base 3000, honBack 3000, dohanBack 2000, jonaiBack 1000, salesSlide [{at 100000, wage 3500}], honBackMode per_count, productBackMode product_rule, …}
extras: []   ar: []   adv: []   okuri: []   cast_name: "あべ"
```

（pay の全キー＝dump の「d. pay 全文」に逐語。ar／adv／okuri の要素は finalize が注入する `{action, amount, receivable_id|advance_id|transport_id, prev_status, applied_status, …}` 形＝この明細は 3 天引きとも空。）

### 要点（相談役向け）

- 一時金＝attendance_incentives → extras → **gross に含めて源泉対象**。罰金＝penalty_config × punch-match 回数。控除＝deductions（店単位・期間列なし）。いずれも**事前定義された規則から純関数が算出**し、cast 別の手動額は入る口が無い。
- 「手動調整」を入れるなら候補は (1) extras に手動行を足す（kind='manual'・attendance_incentives 同型の器か新表・gross に入る＝源泉対象）、(2) 控除側に cast 別の一時控除表を足す（deductions は店単位なので別表）、のどちらか。どちらも mig＋core.ts の合成＋breakdown の凍結＋reopen の巻き戻しが要る＝小さくない。
- punch_proxy（source='manager'）は RPC だけ実在・UI 無し。代理打刻の UI を出すなら client のみで可（RPC は既に owner∨manager 自店ガード・audit 付き）。
