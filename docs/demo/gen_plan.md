# デモ環境 生成案（先月分の伝票・打刻＋当日のライブ状態）

便 D0-3（裁定328・2026-10-01）。対応表＝docs/demo/mapping_20261001.md。生成器そのものは便 D1（本書は方針と突合方法）。

## 1. 生成器の形（裁定276-1 録画再生の延長）

```
scripts/demo/gen-recording.mjs（D1 で新設・tsx）
  入力: docs/demo/source/20261001/nox_demo_all.json・店コード（MUSE…NEST）・基準営業日 R（既定＝実行日の営業日）
  手順（店ごと・Postgres 直結・1 トランザクション・最後に ROLLBACK＝DB 恒久変更 0）:
    1) マスタを service 直 INSERT（org は既存 NOX-DEMO-<CODE>・stores／seats／product_categories／products／product_costs／
       cast_ranks／pricing_rules／comp_plans／casts／cast_plan／cast_tax_profiles／customers／bottle_keeps／receivables（開始残高）／
       store_business_hours／store_sales_targets／cast_quotas／notices）＝seed:demo と同型
    2) 先月 M の各営業日について、owner／黒服を JWT emulate して実 RPC で伝票を作って閉じる
       （check_open→check_set_nominations→check_add_line→check_extension_add→check_pay→check_close）。started_at／closed_at／
       check_lines.created_at／payments.paid_at は RPC 後に service で該当日時へ UPDATE（seed:demo の rewind と同型）
    3) 打刻は punches 直 INSERT（in／out・source 'self'・okuri）＋ shifts（confirmed）＝RPC は now() 固定で過去日が作れないため
       （attendance は shukkin を日ごとに 1 行）
    4) 各営業日を daily_report_close（正規経路・凍結値）→ M の payroll_run_create→payroll_finalize（正規経路）
    5) 当日 R（$rel 0）: open 伝票・予約・確定シフト・in 打刻
    6) 全表を採取（verify:nox-demo-reset の採取部と同型・audit_logs と stock_logs の sale 系は除く）→
       日付を {$rel, t} に変換（dateshift.isoToRel／dateToRel）→ lib/nox/demo/recordings/<CODE>.json（meta.ids に source_id→uuid）
    7) 突合（§4）を同 tx 内で assert → ROLLBACK
  再生: 既存 seed.ts buildPayload → demo_org_reset（録画 JSON を今日基準にずらして投入）
```

録画 JSON のサイズ上限＝裁定277-4「1 org＝伝票 150〜200 枚・payload 1 MB 以下」。先月 1 か月の伝票数は店ごとに 286〜608 組（visit_groups_target）＝**上限を超える**。対処（仮決め・328 追補で追認を求める）: 
(a) 伝票は 1 日あたり visit_groups÷営業日数（MUSE 12・LUNA 19・NOIR 21・ACE 20・LILY 23・NEST 20）で生成し、payload は 1 org 2〜4 MB になる見込み。demo_org_reset は service_role 30s（0150）＝1 MB の実測が未取得のため、**D1 の最初に NOIR 1 店の録画で所要時間を実測**し、超えるなら (b) 明細を代表日のみ完全・他日は 1 伝票＝1 明細（set 行＋drink 1 行で日次目標に合わせる）へ落として 1 MB に収める。

## 2. 日付と曜日の写像

- 先月 M＝R の前月。パッケージの 9/dd → M/dd（§0.1 対応表）。M の日数が 30 でないときは生成器が日次目標を再配分（31 日＝末日は売上 0 の店休扱い・2 月＝末 2 日分を他日に比例配分）。
- 曜日は写像先の実曜日で引き直す: 定休＝写像先の日曜（store_business_hours の日曜行 is_closed）。金土料金（NOIR VIP 週末・ACE 週末・LILY 週末）＝写像先の金土。特別店休 5 日は M の同じ dd。
- 代表伝票 6 件は started_at が曜日依存（N0918 金・A0925 金・G0919 土・L0917 木 20:16 アーリー・B0926 土・M0919 土）。写像先の曜日が変わると料金が変わり golden が崩れるため、**代表伝票だけは「M 内で同じ曜日の最も近い日」へ写す**（例 9/18 金 → M の第 3 金曜）。baseline_day_header の 48 件も同じ日に付ける。
- 当日 R: open 伝票は started_at＝R の 19:00〜21:30（店の開店後）。予約は 22:00〜23:30。シフトは planned の時刻をそのまま。

## 3. 先月分の生成規則（店ごと）

| 項目 | 規則 |
|---|---|
| 営業日数 | september_business_calendar の is_open（MUSE 24・LUNA／NOIR／ACE 25・LILY／NEST 26）。 |
| 1 日の伝票数 | visit_groups_target ÷ 営業日数を基準に、曜日係数（金土 1.3・月火 0.8）で揺らす。Σ が visit_groups_target に一致。 |
| 客単価 | daily_sales_targets の日次目標を伝票数で割り、組ごとに ±30% の揺らぎ。**日次 Σ checks.total が目標 ±1%**（最後の 1 伝票で残差調整＝drink 行の数量）。 |
| 人数 | guests_target ÷ visit_groups（MUSE 1.44・LUNA 1.56・NOIR 1.55・ACE 1.56・LILY 1.56・NEST 1.40）→ 1〜4 名の分布。 |
| 指名の配分 | cast_monthly_targets の main／inhouse／accompanied_count を cast ごとの月間回数とし、伝票に nom_type hon／jonai／dohan を割り付ける（NOIR・LUNA・ACE のみ。MUSE／LILY／NEST は free）。同伴は dohan_auto_hon で本指名が付く（CALCULATION_RULES の「同伴＋本指名を重複作成しない」と一致）。 |
| 商品の配分 | cast_monthly_targets の cast_drink_count／shot_count／champagne_count と noir_champagne_sales_targets（NOIR 8 銘柄 108 本）・inventory_snapshot の sold_units_target（30 商品）を**数量制約**とし、残りは店の商品からカテゴリ別の重み（drink 60／bottle 15／champ 10／food 15%）で埋める。受領者 cast_id は卓の指名 cast（free は当日出勤の cast から輪番）。 |
| 延長 | 伝票の 35% に extension 1 回・10% に 2 回（NOIR VIP は 50%）。 |
| 支払 | cash 60／card 35／ar 5%（ar は ar_enabled の NOIR・ACE のみ・顧客付き伝票に限る・receivable_opening の 2 件は代表伝票由来）。 |
| 顧客 | customer_monthly_targets の visits_target を伝票に配る（LU-C001 は customer_visit_targets の 7 件を固定）。 |
| 打刻 | shift_targets 型の planned 時刻（店の開店 −30 分 in・閉店 +30 分 out）。cast_monthly_targets.hours_target に月の実働 Σ が ±2h で合うよう出勤日数（hours_target ÷ 6h）を決め、出勤日は指名のある日を優先。okuri は NOIR・ACE の 50%（送り実費の器）。 |
| 日報 | 各営業日を daily_report_close（p_counted_cash＝理論在高）。 |
| 給与 | M の run を payroll_finalize で確定（status finalized・paid にはしない＝/payroll の「支払い済み」操作を残す）。 |

## 4. golden と突合方法（生成器が同 tx 内で assert・赤なら録画を出さない）

| golden | 値 | 突合 |
|---|---|---|
| 代表伝票 6 件の total | 35,404／65,736／264,825／203,280／70,143／36,542 | checks.total ＝ check_group_due(check,'A') ＝ groupDueFull 鏡像（三点一致・demo-reset suite と同型） |
| 代表伝票 6 件の商品バック | 2,000／5,900／29,200／25,500／9,475／3,750 | Σ check_cast_backs（drink＋champ＋bottle）per check |
| 代表伝票 6 件の指名バック | 0／1,800／2,800／2,500／0／0 | check_nominations（nom_kind・is_dohan）× cast_plan→comp_plans の hon／jonai／dohan_back |
| 代表伝票の受領者別バック 13 名 | order_reward_calculations.total_reward | 上 2 行の cast 別 Σ |
| 月次売上 | 43,740,000（店別 3,180,000／7,860,000／13,680,000／9,240,000／5,720,000／4,060,000） | Σ daily_reports（cash＋card_gross＋uri＋other）per store ＝ 目標 ±1%（§3 の残差調整で原則 0） |
| 日次売上 | daily_sales_targets 180 行 | 同上 ±1% |
| 報酬参考 | 13,648,300（店別・こころ除外） | Σ payslips.breakdown_json の総支給（gross）±丸め（店別 ±1,000 円以内・丸めは roundYen の切捨）。net は NOX の値を正とする |
| ランキング | ranking_reference 137 行 | get_cast_ranking（M）の順位列が一致（売上・商品バック・指名 3 種） |
| 在庫 | inventory_snapshot 30 商品の closing_units | product_stock_totals ＝ opening＋received−sold |
| 売掛残 | 84,000／36,000／24,000／64,825 | Σ(receivables.amount − collected_amount) per customer |
| NOIR シャンパン | 108 本・銘柄別 8 値 | Σ check_lines.qty（type champ）per product |
| 時給スライド | standalone_slide_test 7 値 | pay.ts salesSlide の純関数テスト（投入なし） |

突合で崩れやすい点と先回り: (1) 税の丸め順序（パッケージ＝floor(小計×サ料)→floor((小計+サ料)×税)）が check_recalc と一致するかを **D1 の最初に純関数で 6 伝票を再計算**して確認。差があれば停止（golden の張替えは相談役）。(2) 月の日数差＝§2。(3) ACE の時給スライド＝NOX は日次売上で当日の時給を決める（現行式）。パッケージの ace_hourly_band（時給帯別の時間）は NOX の結果と**一致を要求しない**（適用日が保留 5 項目）＝報酬参考の店別突合は ACE だけ ±5% に緩める。

## 5. 当日のライブ状態（$rel 0）

- open 伝票 31（table_state の occupied）＝check_open のみ・明細は partial 10 行＋gross_amount_target に合う補完（LIVE-LINES の MISMATCH は明細 Σ を正）。
- 予約 7（booked）＋ cast 申請 1（pending・NOIR）。
- 確定シフト 47（shift_targets）・on_duty は in 打刻のみ。
- キープ 1 本の keep_out（LIVE-MUSE-T1）。
- 在庫注意: アルマンド（NOIR）を reorder_point 未満に。
- 入場時補充（裁定273-5）は afterResetHooks 未実装＝D1 の範囲外（D2 で「直近 3 時間に open が無ければ足す」）。

## 6. 生成器の DB 読取（裁定200）

生成器は Postgres 直結で ROLLBACK 前提だが、**f0 走行中には動かさない**（門番 A-0 の 3 値 0 を確認してから）。所要時間の見込み: 1 店 2,000 RPC 呼び（伝票 500 × 4）≒ 3〜5 分。6 店で 30 分。録画は店ごとに別 tx・別ファイル。
