# 0916 調査（裁定258 の core／UI 合成の前提・読取のみ）

- 実施 2026-09-15 17:11〜17:20 JST（機械時刻 Tokyo Standard Time）・HEAD 3c786f7＝origin/main（rev-list 0 0）・作業ツリー差分 docs/tmp のみ
- migrations 末尾 0146・live に payroll_adjustments 1 表＋ payroll_adjustment_add／_delete 2 関数（pg 直結で確認）
- Supabase: postmaster 起動 16:46:22 JST・max_connections 60・client backend 17（PostgREST idle 10／pgbouncer 3／Storage 2／Supavisor 1 active／exporter 1）・直結の他クライアント 0・応答 164 ms
- 裁定200 の 3 値（NOX DB 基準）: 直結クライアント 0／直近 60 秒 audit_logs 0／ローカル NOX verify プロセス 0 ＝ 再実測不要

## a. payroll-board の構成と、調整控除 UI を置ける場所

ファイル: `app/(manage)/payroll/`（7 本・1,712 行）

| ファイル | 行 | 役割 |
|---|---|---|
| page.tsx | 28 | `?store&period` が揃えば PayrollBoard、無ければ PayrollList（月次一覧） |
| payroll-board.tsx | 860 | 明細画面本体（下記） |
| payroll-list.tsx | 227 | 月次一覧・「明細へ」リンク・支払済み化 |
| payment-panel.tsx | 169 | 支払記録（確定済み run のみ・fetch `/api/payment/record`） |
| invoice-panel.tsx | 216 | 税区分・支払調書 CSV |
| payment-tax-panel.tsx | 155 | 納付管理（owner） |
| export-csv.ts | 57 | CSV 出力共用 |

payroll-board.tsx の節（タブは無く縦積みの section）:

| 行 | 節 | 状態依存 |
|---|---|---|
| 338–357 | 段1 期間選択（店舗 select・月 input・プレビュー） | 常時 |
| 359–496 | run バー＋4 ステップ＋KPI 4 枚＋要対応 | 常時（値は「—」で待つ） |
| 501–520 | プレビュー前の空表 | rows 無し |
| 521–739 | 段2 キャスト別表（左 2/3）＋右 sticky 明細パネル（654–736） | rows あり |
| 638–650 | 段3 「この期間を確定する」 | status==='draft' のみ |
| 741–766 | D1 確定を解除（理由必須） | finalized のみ・owner/manager |
| 771–772 | 下段1 支払・明細 → PaymentPanel | 確定後 |
| 775–839 | 下段2 税務・出力（CSV 776–797／印刷 799–839） | 確定後 |
| 842／846 | InvoicePanel／PaymentTaxPanel | — |

調整控除の入力 UI 候補（3 案・所見付き）:

1. **段2 の右 sticky パネル（654–736）に「調整控除」小節を足す**（推奨）。行タップで cast が選択済み＝cast_id が手元にある。draft のときだけ add／delete を出し、finalized では読取表示のみ。preview 再実行で反映を見せる導線が最短。
2. 段2 表と段3 確定ボタンの間（626–650）に独立 section「調整控除（この期間・下書きのみ）」を置き、キャスト picker＋mode＋金額／%＋源泉前後＋明細表示＋理由の 1 行フォーム（deduction-panel.tsx 190–210 の横並びフォームと同型・裁定259 の picker 化対象と同じ器）。全キャスト分の一覧を出しやすい。
3. PaymentPanel の隣（下段1）: 状態依存が逆（支払は確定後・調整は draft）なので不適。

**前提の注意（★UI 設計に効く）**: `payroll_adjustment_add` は `p_run_id` 必須で `payroll_runs` の行が draft であることを要求する（mig0146 118–130・'run not found'／'run not draft'）。一方 preview route は純参照で run を作らず（preview/route.ts 1–2）、`payroll_run_create` の呼び元は finalize route のみ（finalize/route.ts 14）。したがって初回の draft 期（run 行なし＝runInfo null）には調整行を入れる先の run_id が存在しない。UI 側で「調整を入れる前に run を作る」経路（run_create を呼ぶ route の新設、または add RPC 側で run を自動作成）のどちらかが要る＝別裁定事項。reopen 後（finalized→draft）は run が既に存在するので問題ない。

## b. 明細（payslip）の表示箇所と控除の並び順

表示箇所（PayslipSlip の呼び元 3＋準明細 2）:

| 箇所 | ファイル:行 | データ源 |
|---|---|---|
| /mine 確定給与明細 | app/mine/page.tsx:169–184（177 で PayslipSlip） | payslips 凍結値（直近 6 期） |
| manage 右パネル「明細プレビュー」 | payroll-board.tsx:714–729 | preview 行から breakdown_json を合成（pay/extras 素通し・ar/adv/okuri は deducted 1 要素） |
| manage 印刷（A4 1 人 1 枚） | payroll-board.tsx:829–836 | payslips 凍結値 |
| manage 右パネル簡易内訳（明細ではない） | payroll-board.tsx:667–710 | preview pay の再掲 |
| 給与明細 CSV | lib/nox/payroll/csv.ts | payslips 凍結値（控除は合算 1 列） |

PayslipSlip（components/payslip-slip.tsx・111 行・数値ロジックなし）の控除の並び（84–98）:

1. 固定控除 ＝ `fixedDed − sanction.applied`（49・fixedDedRest）
2. 制裁（罰金・減給）＝ `sanction.applied`（原額＞適用額なら「原額 → 法定上限適用」併記）
3. 罰金 ＝ `fine`
4. 源泉 ＝ `withholding`（ラベルは taxMode で「源泉（報酬・料金）」「源泉（給与）」「源泉」）
5. ノルマ未達 ＝ `normPenalty`
6. 売掛 ＝ ar の `action==='deducted'` 合計（30–33 deductTotal）
7. 前借り ＝ adv 同上
8. 送り ＝ okuri 同上

全行「>0 のみ表示」（60–61 ded）。hasDed（53）で「控除」見出しの有無を決める。extras は控除後の「加算（総支給の内訳）」節（100–106）で、gross に内在＝足し戻さない（裁定26）。

右パネル簡易内訳（673–678）は別順序: 源泉 → 送り → 制裁 → 前借り → 売掛 → その他（fixedDed−sanction＋fine＋normPenalty）。**調整控除を凍結形に足す場合、この 2 箇所＋ CSV の dedTotal（csv.ts:53）＋ payroll-board の ded 合算（142–143・588–591）＋ ui-calc.kpiOfDraftRows の 5 箇所が「控除計」の式を各自持っている**（欠落キーは 0 扱いの流儀）。新キーを足すなら全箇所同時に。show_detail=false の行は合算に入れて理由を出さない（258-5）ので、凍結形は「行配列＋合算」ではなく行配列のみ（データは行で保持・258-5）で、表示側が show_detail で分岐する形が自然。

## c. core.ts 179–205 と pay.ts 556–625 の合成に、gross 確定後・fixedDed 適用前の割り込み点があるか

**pay.ts 側（純関数）**: 割り込み点は**ある**。

- 578 `const gross = grossBase + achievementBonus + guaranteeAdd;` で gross 確定。
- 580–611 が fixedDed（sanction 分離・cap 計算）・612–614 fine・616 withholding・617 normPenalty・619–627 net。
- 578 と 580 の間に行を挿す余地がある。ただし **258-2「分母＝gross」・258-3「before_withholding=true は gross から引き源泉対象額が減る」**を満たすには、
  - 率行の分母は 578 の gross（逐次適用しない）。
  - before=true の合計を引いた値を 616 `withholdingOf(gross, …)` の第 1 引数に渡す（＝現在は生 gross を渡している）。
  - 591／593／595 の sanction cap（`gross / periodDays`・`gross * 3 / (effDays*5)`・`gross / 10`）も gross を参照する。「一賃金支払期の賃金総額」を減額後にするか否かは未裁定（現状は生 gross）。
  - before=false の合計は 619–627 の net 式に新項として足す（ar/adv/okuri と同列）。
- PayInput（172–200）には調整の入力が無い。`arDeduct／advanceDeduct／okuriDeduct／extrasTotal` と同列に、行配列（mode/amount/rate_bp/before_withholding）または集計済み 2 値（beforeTotal／afterTotal）を足す。**率行は gross が payOf 内で確定するため、集計済み値では渡せない＝行配列（少なくとも率行）を渡して payOf 内で ÷10000 する**（裁定258 の「専用の除算行が core.ts/pay.ts に要る」と一致）。
- PayResult（222–）にも `fixedDed／withholding／arDeduct…` と同列で新キー（例 adjBefore／adjAfter／adjustments 行）が要る＝凍結形。

**core.ts 側（オーケストレーション）**: 割り込み点は**二段 payOf の前**。

- 187 `pay0 = payOf(buildPayInput(c, taxMode, masters, periodDays, extrasTotal, 0, 0, 0))` → 189 available = pay0.net → 190 rem0 → 195–197 の送り→前借り→売掛の budget 消費 → 205 確定額で再 payOf。
- 裁定258「配分順序は現状維持＝調整控除が先に引かれ available が減る」＝調整を **pay0 の入力**に入れれば、available が自動的に減り、ar/adv/okuri は残り budget で回る（追加の順序制御は不要）。205 の再 payOf にも同じ調整を渡す（両段で同一入力）。
- buildPayInput（assemble.ts:69–78）は positional 8 引数（arDeduct/advanceDeduct/okuriDeduct は既定 0）。調整の行配列を 9 番目に足すか、CastRaw（collect の出力）に載せて buildPayInput 内で詰めるかの二択。後者なら core.ts の 187／205 は不変。
- 読取側: collect.ts は `payroll_runs` を loadAvgDailyWage（446–449・過去 3 期）でしか読まない。当期 run の id は computePayrollDraft（117–123）の引数に無い。調整行を読むには (i) collect で `payroll_runs(store_id, period, status='draft')` → `payroll_adjustments(run_id)` を引く（run 無し＝調整 0 件）か、(ii) finalize route が持つ run.id（16）を core に渡す。preview は run を持たないので (i) が両経路で同形。
- 258-8「差引後マイナスは net=0 で止め超過額は保持・消費しない」: 現在の net（619–627）は負値を止めていない（rem0 の `Math.max(0, …)` は budget 側のみ）。0 床と超過額の保持キーは pay.ts の net 式直後に新設が要る＝0147 で消費。

## d. roundYen の定義と、既存の除算箇所の丸め方向

- `lib/nox/money.ts:6–8` `roundYen(n) = Math.round(n)`（四捨五入・モック忠実・差替点 1 箇所）。
- 同 13–15 `floorYen = Math.floor`（源泉専用・裁定23）。負値注意の注記あり。
- 同 18–20 `roundPt1`、27–29 `takeHomeFloor() = 0`。

既存の「率 × 基底 ÷ 100」は**全て roundYen（四捨五入）を 1 回**（lib/nox 内 18 箇所の roundYen 呼び出しのうち除算を伴うもの）:

| 箇所 | 式 |
|---|---|
| pay.ts:357 | `roundYen((price * rate) / 100) * qty`（商品 rate バック・1 本ずつ丸めて掛ける） |
| pay.ts:403 | `roundYen((metrics.sales * d.value) / 100)`（自由設計 basis=sales） |
| pay.ts:430 | `roundYen(((sales||0) * d.amount) / 100)`（fixedDedOf per=rate） |
| pay.ts:499／502 | 本指名／場内の rate バック |
| pay.ts:517 | `roundYen(cast.sales * sRate)`（売上バック率・小数率） |
| pay.ts:599 | sanction per=rate（430 と同式） |
| sim.ts:64 | plan_rate 商品バック |
| check-calc.ts:26／141 | サービス料 |
| report-board.tsx:242 | カード手数料 |

四捨五入以外の丸めは**上限・分母系のみ Math.floor**: pay.ts:591／593／594／595（sanction cap）・pay.ts:370（qty 按分の floor＋最大剰余）・withholdingOf は floorYen。**bp の除算行は `roundYen((gross * rate_bp) / 10000)` が既存流儀と整合**（1 行につき 1 回丸め・逐次適用しない＝各行が同じ gross に掛かる）。

## e. % 入力を bp に変換している既存 UI

**無い**（新規）。app／components で bp・10000 を扱う箇所は pricing-panel の「丸め単位 1〜10000」と register の金種 10000 のみで、いずれも率ではない。既存の率入力は全て**整数 %（0〜100）をそのまま格納**:

- comp-sections.tsx:362／369 `本 率(%)` `場内 率(%)`＝`<input type="number" min=0 max=100>` → `p_hon_back_rate` にそのまま（41 で「0〜100 の整数」検証）。
- deduction-panel.tsx は率入力を持たない（金額(円)＋日付＋メモ＝前借り／送り実費の発行フォーム）。控除マスタの per=rate（fixedDedOf）は別画面の deductions 編集で整数 % を amount に入れている。
- sales_rate／card_tax_rate（pricing）も整数 %。

新規に要るもの: 入力は「%（小数 2 桁まで）」→ 格納 `rate_bp = Math.round(pct * 100)`（0..10000 のガード）・表示 `pct = rate_bp / 100`。lib/nox に純関数 2 本（pctToBp／bpToPct）を置いて verify で往復を assert するのが money.ts と同じ集約流儀。既存 UI との違い＝deductions.amount は「%」、0146 は「bp」なので画面上の単位表記を「%」に統一し bp は見せない（裁定258「UI は %↔bp の換算を持つ」）。

## f. payroll_adjustment_add／_delete を呼ぶ route

**0 件**（実測）。`payroll_adjustment` を含むファイルは scripts の verify 3 本のみ（verify-nox-payroll-adjust.ts／verify-nox-payroll.ts／verify-nox-billing.ts）。app／components／lib には 0。`app/api/payroll/` は finalize／mark-paid／preview／reopen／tax-overview／tax-report-csv の 6 route のみ。

呼び方の既存型は 2 通り:
- ユーザー文脈 client → route → `supabase.rpc(...)`（payment/record/route.ts:31 payment_record_add・idemKey 検証あり）。
- service 経路（finalize の payroll_finalize＝`g.admin.rpc`）。
0146 の 2 本は authenticated に EXECUTE があり RPC 内で owner/manager と自店を判定するので、前者（ユーザー文脈）で足りる。冪等キー引数は add に無い（署名 uuid,uuid,text,integer,integer,boolean,boolean,text）＝二重送信は UI 側 busy ガードのみになる点は留意。

---

# 0916 追補（第 2 便・live prosrc と凍結経路・読取のみ）

- 実施 2026-09-15 17:2x JST・HEAD 3c786f7＝origin/main（rev-list 0 0）・pg 直結 310 ms（無応答なし）
- live md5(prosrc): payroll_finalize 608489f5d6c37a466c4240a5e969fef6／payroll_run_create 401423b93b0a6eccb0e1ce0979bfbf43

## 1. payroll_finalize（live 逐語・pg_get_functiondef・292 行）

署名 `payroll_finalize(p_org_id uuid, p_actor uuid, p_run_id uuid, p_idem_key uuid, p_payslips jsonb) returns integer`・SECURITY DEFINER・search_path public。

- **a. payroll_adjustments の参照**: **無し**（本文全走査で 'adjust' 0 件・実測）。
- **b. payslips への insert 列**（本文 265–266）: `org_id, store_id, run_id, cast_id, period, breakdown_json, net` の 7 列。
  値＝`v_org, v_store, p_run_id, v_cast, v_period, v_bd, (v_ps->>'net')::int`。
  live の payslips は 11 列（id／org_id／store_id／run_id／cast_id／period／breakdown_json／net／paid／created_at／updated_at）＝残り 4 列は default。
  **控除計に相当する凍結列は存在しない**。凍結されるのは `net`（整数列）と `breakdown_json`（pay 全キー＋extras＋ar/adv/okuri）のみで、控除計は読取側が `breakdown_json->'pay'` の fixedDed／fine／withholding／arDeduct／advanceDeduct／okuriDeduct／normPenalty を都度合算する（第 1 便 b の 5 箇所）。
  breakdown_json の算出行＝264 `v_bd := (v_ps->'breakdown') || jsonb_build_object('ar', v_ar, 'adv', v_advarr, 'okuri', v_okarr)`＝入力 breakdown を素通しし ar/adv/okuri の遷移記録（prev_*／applied_* 付き）を注入するだけ。
- **c. 金額の計算場所**: finalize 内では**計算していない**。`net` も `breakdown.pay` も引数 `p_payslips` の値をそのまま insert（266）。RPC が検算するのは器の形（66–74: 配列・cast_id／net 非 null・breakdown.pay 存在・extras が配列・空配列拒否）と、ar/adv/okuri の各行の残高上限（161／204／246）と cast の org／store 一致（145–147）のみ。gross と各控除の整合・net 恒等は **route 側の core.ts（207–210 の net 恒等 throw）が唯一の検算**＝「client 計算の受け渡し」ではなく「server route（Node）計算の受け渡し」。ブラウザからの入力は storeId／period／idemKey の 3 値だけ（下記 4）。
- **d. fixedDed／fine／withholding に相当する計算行**: finalize 本文に**無い**。対応は全て lib/nox/pay.ts の payOf 内＝fixedDed 583／611（fixedDedOf＋sanction.applied）・fine 612–614・withholding 616（withholdingOf・floorYen）・normPenalty 617・net 619–627。finalize は結果キー名を知らず（'pay' の存在だけ検証）、余分なキーを拒否しない（finalize/route.ts 39–40 の注記どおり cast_name も同じ経路で通っている）＝調整控除の新キー（例 adjBefore／adjAfter／adjustments[]）を pay に足しても RPC 側の器検証は通る。

そのほか本文の構造: 冪等リプレイ 57–60（finalized かつ同一 idem_key なら件数だけ返す）／paid 拒否 63／退避 77–78／巻き戻し (B) 88–135（再確定時に前回の ar/adv/okuri 遷移を条件付き復元）／(C) 138 で `delete from payslips where run_id` → 143–268 の FOR で 1 cast ずつ insert／271–275 run を finalized・finalized_at・finalize_idem_key・period_start/end／278–290 audit_log_write_service。

## 2. payroll_run_create（live 逐語・40 行）

署名 `payroll_run_create(p_store_id uuid, p_period text) returns table(id uuid, status text)`・SECURITY DEFINER・呼び元は finalize route のみ（ユーザー文脈 `g.supabase.rpc`）。

- 冒頭 null guard（309）・period 正規表現（311）・store の org 照合（313–314）・owner 全店／manager 自店（315–318）。
- **同一 store×period の既存 run**: 321–325 で `select id, status from payroll_runs where store_id and period` → **存在すれば status を問わず（draft／finalized／paid いずれも）その id と status を返す＝自然冪等・raise しない**。unique index `payroll_runs_store_period_uidx (store_id, period)` に**当たる前に select で先取り**する設計。
- 無ければ 327–330 で `insert … status 'draft', created_by = users.id` → 332–333 audit_log_write('payroll_run_create')。
- **payroll_finalize は run を作らない**（本文に insert into payroll_runs 無し）。route が run_create → その id を p_run_id に渡す（finalize/route.ts 14–18・paid なら 409）。finalize は p_run_id の行を読み（50–52）status が draft でも finalized でも受け付け（paid のみ拒否 63）、finalized の再確定は退避→巻き戻し→delete→insert の**差し替え**（同 run_id を再利用・新規作成しない）。
- 0146 との接続: 調整行の入力には draft の run_id が要るが、preview は run_create を呼ばない。run_create は既存を返す自然冪等なので、**調整 UI の保存前に run_create を呼ぶ route（または既存 preview route に run_create を足す）を新設すれば、run 行が draft で作られ、以降 finalize が同じ行を拾う**＝index 衝突も二重作成も起きない。ただし preview 段で run 行を作ると payroll_list（月次一覧）に「下書き」行が現れる副作用がある＝裁定事項。

## 3. PayslipSlip を描画する画面パスと閲覧者・データ源

| 画面パス | 描画箇所 | 閲覧者（ゲート） | データ源 |
|---|---|---|---|
| `/mine` | app/mine/page.tsx:177 | **cast 本人のみ**（mine/layout.tsx:9–11＝role≠cast は /register へ）。owner/manager は到達しない | 直 SELECT `payslips(period, net, breakdown_json)` 直近 6 期（94–98）。RLS payslips_select＝`org一致 ∧ (owner ∨ 自店) ∧ role≠staff ∧ (role≠cast ∨ cast_id=auth_cast_id())`＝本人行のみ |
| `/payroll?store=&period=`（右パネル「明細プレビュー」） | payroll-board.tsx:716 | owner／manager（payroll/page.tsx:16＝staff は /register へ・cast は manage layout で /mine へ） | **RPC ではなく route** `/api/payroll/preview` の返り値（preview 行）から breakdown_json を合成（722–727）＝**凍結値ではない**参考値 |
| `/payroll?store=&period=`（報酬明細 印刷／PDF） | payroll-board.tsx:833 | owner／manager（同上） | 直 SELECT `payslips(cast_id, period, net, breakdown_json) where run_id`（200–203）＝凍結値。名前は凍結 cast_name → 現在名 |

cast 本人が到達する経路は `/mine` の 1 本のみ。manage 側 2 箇所は owner/manager 限定で、cast は manage layout（app/(manage)/layout.tsx:24–31）で /mine に戻される。PayslipSlip 自体は presentation-only で RPC を呼ばない。

参考（PayslipSlip 非経由で payslips を読む箇所）: payroll-list.tsx:54（一覧の凍結合計）・payment-panel.tsx:37（net）・export-csv.ts:18（CSV）・analytics-board.tsx:246／273・month-report.tsx:115（人件費）・api/payroll/tax-overview:43・tax-report-csv:64（admin 経由）。調整控除を show_detail=false で「控除計に合算し理由を出さない」場合、cast 本人の /mine は payslips 直読なので、**理由（reason）は breakdown_json に凍結しない**か、凍結しても Slip 側で show_detail を見て出し分ける設計になる（258-10「cast 本人にも非開示」は payroll_adjustments 表の RLS であり、breakdown_json に写した時点で本人可視になる点に注意）。

## 4. payOf の返り値型と、確定時に route へ渡す引数（逐語）

`export function payOf(input: PayInput): PayResult`（lib/nox/pay.ts:485）。PayResult（222–264）逐語:

```ts
export type PayResult = {
  plan: CompPlan;
  eplan: CompPlan;
  hasOv: boolean;
  wage: number;
  timePay: number;
  wHours: number;
  wbasis: Partial<Record<WageBasis, number>>;
  wdays: WageDay[];
  honBack: number;
  jonaiBack: number;
  dohanBack: number;
  drinkBack: number;
  champBack: number;
  bottleBack: number;
  calculatedBack: number;
  sRate: number;
  salesBack: number;
  cbacks: CBack[];
  customTotal: number;
  achievementBonus: number;
  guaranteeAdd: number;
  compSkipped: string[];
  gross: number;
  fixedDed: number;
  sanction: SanctionResult | null;
  fine: number;
  withholding: number;
  arDeduct: number;
  advanceDeduct: number;
  okuriDeduct: number;
  normPenalty: number;
  net: number;
  lateN: number;
  absentN: number;
  taxMode: TaxMode;
};
```

このオブジェクトがそのまま `breakdown.pay` として凍結される（finalize/route.ts:41）。

**ブラウザ → route**（payroll-board.tsx:255–260 逐語）:

```ts
const idemKey = crypto.randomUUID();
const res = await fetch("/api/payroll/finalize", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ storeId, period, idemKey }),
});
```

＝金額は一切送らない（guardPayroll が storeId／period／idemKey のみ検証・route-guard.ts:33–44）。

**route → RPC**（finalize/route.ts:34–54 逐語）:

```ts
const payslips = draft.rows.map((r) => ({
  cast_id: r.castId,
  net: r.net,
  breakdown: { pay: r.pay, extras: r.extras, cast_name: r.castName },
  ar_deducted: r.arDeducted,
  ar_carried: r.arCarried,
  adv_deducted: r.advDeducted,
  adv_carried: r.advCarried,
  okuri_deducted: r.okuriDeducted,
}));
const { data: count, error: eFin } = await g.admin.rpc("payroll_finalize", {
  p_org_id: g.orgId,
  p_actor: actor.id,
  p_run_id: run.id,
  p_idem_key: g.idemKey,
  p_payslips: payslips,
});
```

`draft` は `computePayrollDraft(g.admin, g.supabase, g.storeId, g.period, { previewDefaults: false })`（21）＝確定時点で再計算・preview 値は使わない。
