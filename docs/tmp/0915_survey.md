# 2026-09-15 調査（読取のみ・HEAD 32d2123・実装なし）

出典＝相談役ブロック 2026-09-15 13:52。live 逐語の生データ＝`docs/tmp/0915_dump.txt`。何も変更していない。

前提: HEAD 32d2123＝origin（0 0）・migrations 末尾 0145・live に seat_reorder 1 本・裁定200 の 3 値＝NOX 基準 0（他プロジェクト verify 3＝BANZEN・裁定249 で除外）。

## a. attendance の列と CHECK／退勤・早上がりの記録

- **attendance**（11 列）: id／org_id／store_id／cast_id／**date**／**status**（CHECK shukkin／dohan／late／off／absent）／**eta**（text・CHECK `^([0-3][0-9]|4[0-7]):[0-5][0-9]$`＝到着予定の 30 時間制 HH:MM）／reason／**source**（CHECK staff／self）／created_at／updated_at。UNIQUE (cast_id, date)。
- **退勤時刻・早上がりを記録する列は attendance に無い**。あるのは到着予定（eta）と状態だけ。
- 退勤の事実は **punches**（12 列: cast_id／punched_at／**type CHECK in／out**／lat／lng／ip／within_geofence／**source CHECK self／manager／kiosk**／note）にだけある＝打刻端末（kiosk_punch）・本人打刻（punch_self）・店側代理（punch_proxy）の 3 経路で in／out を積む。
- 早上がりの判定は **lib/nox/punch-match.ts**（純関数）が `close − out > earlyGraceMin`（既定 30・penalty_config.early_grace_min＝**表示専用**）で `early` を出す。over（out−close > over_grace_min 90）も表示専用。**罰金に効くのは late／absent の回数のみ**（payOf の fine.lateN／absentN）。
- ⇒ 「早上がり」を記録・集計する器は attendance にも payslips にも無く、punches の out と確定シフトの終了時刻から都度導出する設計。

## b. /shift 今日タブの出勤記録セグメント

- 実装＝app/(manage)/shift/shift-board.tsx 95〜101（選択肢定義 `[["shukkin","出勤"],["late","遅刻"],["absent","当欠"],["dohan","同伴"],["off","休み"]]`）・1008 付近（.nox-seg のボタン群・押すと `setAtt`）・**556 行 `setAtt`**＝`attendance_set({ p_cast_id, p_date: attDate, p_status, p_eta: null, p_reason: null })` を呼び `loadAtt` で再読込。書き込みは今日のみ（RPC 側に未来日ガードが無いため UI で制限）。未記録に戻す操作は無い（RPC が 5 値のみ受理）。
- RPC＝`attendance_set(p_cast_id uuid, p_date date, p_status text, p_eta text, p_reason text) → uuid`: org null→forbidden／bad date／bad status（5 値）／bad eta／cast の org 照合／店ロール判定→ **upsert（on conflict (cast_id, date) do update・source='staff'）**。本人用＝`attendance_set_self(p_date, p_status, p_eta, p_reason)`（source='self'）。attendance を書くのは他に incentive_publish／incentive_cancel（出勤インセンティブの付随）だけ。

## c. 遅刻の判定と「遅刻・未着 n 人」

- **今日タブの KPI（shift-board 777〜792 `todayCounts`）**は判定を持たない集計:
  - 今日の確定シフト行ごとに attendance.status を見る → shukkin／dohan＝出勤済み・**late＝遅刻・未着**・absent＝欠勤・off＝数えない。
  - status が無い行は、**punches の in があれば出勤済み**、無ければ `now ≥ 暦日 00:00 JST＋start_hm` で**未着**（＝遅刻・未着に加算）。
  - ⇒ 「遅刻・未着 4 人」＝`late の記録 ＋（未記録 ∧ 打刻なし ∧ 開始時刻経過）`。**何分から遅刻かの閾値は今日タブには無い**（開始時刻を 1 分でも過ぎれば未着）。
- **給与側の遅刻判定は実装済み**＝lib/nox/punch-match.ts `matchPunches`（S3 対応表）: `in − start > lateGraceMin`（**既定 10 分**・店の penalty_config.late_grace_min）で `late`、in が無ければ absent、status がある日は対応表で final（shukkin／dohan は punch の late を打ち消し ok・late は late・absent は absent）。lateN／absentN が payOf の罰金（fine_late／fine_absent）に入る（collect.ts 292〜・punch-io→matchPunches）。
- ⇒ 今日タブ（0 分・表示）と給与（10 分・罰金）で閾値が違う。表示に grace を揃えるなら penalty_config.late_grace_min を client で読むだけで可（client のみ）。

## d. 送り代の発生経路

- **一律（flat）**: settings_json.okuri_mode='flat'（既定）のとき、送り代は **deductions**（控除ルール表: name／amount／per CHECK day／month／rate／kind CHECK unworked／sanction／statutory／agreed_cost／store_receivable／advance_se…）の行として給与計算で引く（lib/nox/payroll/collect.ts が控除マスタを読み payOf へ）。発生の「都度記録」は無い＝出勤日数×日額の計算。
- **実費（actual）**: okuri_mode='actual' の店だけ **transport_issue(p_store_id, p_cast_id, p_amount, p_biz_date, p_note)** で **transport** 表（amount／deducted_amount／status open／deducted／cancelled／biz_date）に 1 件ずつ発行（fail-closed＝flat 店は 'okuri not actual'・paid 期間は 'paid period'）。取消＝transport_cancel。給与確定（payroll_finalize）が open の transport を deducted に振り替え breakdown.okuri に凍結、reopen で巻き戻す。
- **打刻から呼ばれる経路は無い**。kiosk_punch／punch_self／punch_proxy は punches と audit（と cast_pin の失敗カウンタ）だけを書き、transport／deductions／attendance には触れない。UI の入口＝/master の deduction-panel（okuri_mode トグル・okuri_base）と /master/cast-comp/deduction（deduction-board＝transport_issue／adv_issue）。

## e. payslips の列と手動調整

- **payslips**（11 列）: id／org_id／store_id／run_id／cast_id／period（CHECK YYYY-MM）／**breakdown_json**（jsonb・pay＋extras＋ar／adv／okuri の凍結）／**net**（integer）／paid／created_at／updated_at。**手動調整の列（端数調整・一時金・控除の手動減額）は無い**。
- payslips を書く関数＝**payroll_finalize**（insert）と **payroll_mark_paid**（paid=true の一括更新）の 2 本のみ。個別の update RPC は無い。
- UI（payroll-board）: 金額を入力する欄は無い（input は 対象月・キャスト名絞込・解除理由の 3 つ）。一時金に当たるのは **attendance_incentives**（incentive_publish＝bonus／drink_boost・per_head／pooled）で、core.ts が extras として合成（総支給＝pay.gross＋Σextras）。手動の端数調整・控除の手動減額の口は **無い**（sanction 系の控除は deductions の kind='sanction'＋根拠 3 列の CHECK で管理）。

## f. 給与確定の RPC と確定後の書き換え口

- `payroll_run_create(p_store_id, p_period) → (id, status)`／**`payroll_finalize(p_org_id, p_actor, p_run_id, p_idem_key, p_payslips jsonb) → integer`**（service 経路・client が計算した payslips 配列を凍結。形の検証＝cast_id／net／breakdown.pay／extras 配列・空拒否・paid なら 'run paid'・同一 idem は冪等・再確定は旧 payslips の ar／adv／okuri を条件付き巻き戻し）／`payroll_mark_paid(p_org_id, p_actor, p_run_id, p_idem_key) → text`（finalized→paid のみ）／`payroll_reopen(p_org_id, p_actor, p_run_id, p_idem_key, p_reason) → text`（flag reopen_flow・理由必須）。
- **確定後に金額を書き換える口＝無い**。paid 後は finalize も拒否（'run paid'）。finalized の再確定は payroll_reopen → 再 finalize（全件差し替え）だけ＝行単位の修正 RPC は存在しない。

## g. select でキャスト・顧客・商品を選んでいる箇所（全数）

`<select` は app／components に **67 箇所**（seg-select のコメント 1 を除く）。うち対象＝**キャスト 6・顧客 2・商品 2**（＋ボトルキープの顧客／商品 2 は 9/14 の裁定254 でピッカー化済み）:

| 対象 | ファイル:行 | 用途 |
|---|---|---|
| キャスト | app/(manage)/analytics/analytics-board.tsx:1176 | castSel＝顧客ランキングの対象キャスト |
| キャスト | app/(manage)/customers/customers-board.tsx:480 | aCast＝顧客登録の初期担当 |
| キャスト | app/(manage)/customers/[id]/customer-detail.tsx:213 | assignSel＝担当変更 |
| キャスト | app/(manage)/master/cast-comp/comp-sections.tsx:780 | castId＝プラン割当の対象 |
| キャスト | app/(manage)/master/deduction-panel.tsx:195 | castId＝前借り／送り実費の対象 |
| キャスト | app/(manage)/master/sensitive-tax-panel.tsx:228 | castId＝機密・税務の対象 |
| 顧客 | app/(manage)/register/reservation-panel.tsx:527 | eCustomer＝予約編集 |
| 顧客 | app/(manage)/register/reservation-panel.tsx:621 | fCustomer＝予約作成 |
| 商品 | app/mine/drink-claim-form.tsx:108 | productId＝ドリンク申告の商品 |
| 商品 | app/(manage)/master/stock/stock-board.tsx:256 | prodFilter＝在庫履歴の絞込 |

残り 57 は店舗（14）・期間／月・状態・区分・席（reservation 486／558／638・kiosk-register 899／903）・プラン（plan-board 111・comp-sections 632・simulator 160）・ランク（casts 644）・カテゴリ（products 670・pricing 1858）・回収方法・切替時刻・pay_group／method・開卓ルール（register 1503／1519）・合算先伝票（register 1635）・伝票（mine/drink-claim-form 97）などで、キャスト・顧客・商品の選択ではない。

## 判定（相談役向けの要点）

- 退勤・早上がり: **器なし**（punches の out から導出のみ・早上がりは表示専用の early 判定）。記録するなら attendance に列を足す mig か、punch-match の early を KPI に出す client。
- 遅刻: 今日タブは 0 分閾値の「未着」・給与は 10 分の grace（penalty_config）。**閾値の不一致は client のみで揃えられる**。
- 送り代: flat＝控除ルール／actual＝transport_issue。打刻連動なし。
- 給与の手動調整: **列・RPC・UI とも無し**。一時金は attendance_incentives、罰金は penalty_config、控除は deductions で「事前定義」する設計。確定後の行修正は reopen→再確定のみ。
- select: キャスト 6・顧客 2・商品 2 が裁定254 のピッカーへ置換可能な候補。
