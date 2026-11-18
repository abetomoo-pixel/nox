# 読取 2026-11-18（相談役 3 a〜c・コードは変えていない）

## a. LUNA の表で入れられなかった 3 行
参考の表は 11 段（≤40／41〜50／51〜60／61〜69／70〜89／90〜100／101〜130／131〜200／201〜250／251〜300／≥301）。器の上限は 10 段（comp_plan_pay_rate_check：jsonb_array_length > 10 → 'bad pay_rate_tiers'）＝**全部を表せても 11 段は上限に当たる**。今は表せる 8 段だけ入れている。

| 行 | 今の作りで表せない理由 | 種類 | 表すのに要る変更 |
|---|---|---|---|
| 70〜89% バック 70% | 時給もお金も据え置きでバックだけ 70% にしたい＝方向は「据え置き」。canonOutcomeOf（lib/nox/rules-0175/canon.ts）はバックの倍率を UP か査定のときだけ使う（据え置きは常に 100）。 | バックの率の持ち方 | 計算（canon.ts の canonOutcomeOf：据え置きの段でも back_mult を当てる・店が「適用」したときだけ）。RPC の検査と mig は要らない（back_mult は 0〜100 でどの段にも書ける）。※今の作りのままでも「下げる額 1 円」を足すと査定の扱いになりバック 70% が効く（下げる額はお金に効かない＝⑫）が、査定の連続の数・入店後の猶予に混ざるので勧めない。 |
| 90〜100% バック 50% | 同じ（据え置きの段ではバックの倍率が効かない）。 | バックの率の持ち方 | 同じ（canon.ts）。 |
| 301% 以上 総報酬 70% | 境（at_pct）の上限が 300（comp_plan_pay_rate_check：at_pct > 300 → 'bad pay_rate_tiers'）。 | 上限（境の値） | DB の検査の差し替え＝mig（comp_plan_pay_rate_check の 300 を上げる）＋画面の検査（lib/nox/comp/pay-rate-tiers.ts PAY_RATE_AT_MAX）。計算（pay.ts／canon.ts）は変えなくてよい。 |

- 3 行とも入れるには、上の 2 つに加えて**段の数の上限 10 → 11 以上**（同じ検査関数の mig＋画面の PAY_RATE_TIER_MAX）が要る。
- Y3 の画面に、今の計算で効かない欄が出ているか：
  - **「下げる額」**：入れると方向が査定になるだけで、金額には効かない（⑫ で査定は決定時給を変えない・outcome の downAmount を使う所が pay.ts にも集計にも無い）。**効かない欄が出ている**。
  - **「バック率」**：UP の段・査定の段では効く。据え置きの段（UP 額も総報酬の率も無い段）では効かない。**段によって効かない**。
  - 「UP 額」「総報酬の率」「連続の期の数」「境」は効く。
  - 直すなら（見せ方）：下げる額を出さない（または「金額には効きません」）・バック率は UP／査定の段でだけ入れられるようにする。今日は変えていない。

## b. reset が途中で失敗すると店が空のまま残る
- 今の流れ（lib/nox/demo/seed.ts runDemoReset）：payload が 1 MB 以下＝1 回の呼び出し（mode 'all'＝消す＋読み込むが 1 つの取引＝失敗すれば元に戻る）。1 MB を超える＝**'wipe' を 1 回呼んでから 'load' を塊ごとに呼ぶ＝呼び出しごとに別の取引**。今は 6 店とも 3〜6 塊＝wipe の後の load で失敗すると空のまま残る（11/17 21:10 の LUNA）。
- 案 1（mig なし・すぐできる）：**消す前に payload の形を確かめる**（route の側＝TS）。表ごとに全行の鍵がそろう・NOT NULL の列に null が無い（列の一覧は scripts/demo の COLS と同じ元）・id の重なりなし。今回の失敗（鍵の欠け）はこれで止まる。外部キー・CHECK の違反は止められない。
- 案 2（mig なし）：load が失敗したら、**同じ deploy の payload で wipe からやり直さない**代わりに、失敗した店を「前回成功した payload（Storage に置いておく）」で読み込み直す。置き場と書込が増える＝勧めない。
- 案 3（mig あり・本筋）：**1 つの取引で戻る形**。塊を一時の表（例 demo_reset_stage：org・seq・jsonb）に積む呼び出しと、最後に 1 回「積んだ分で消す＋読み込む」呼び出し（1 つの取引）に分ける。失敗すれば全部戻る＝店は前の状態のまま。要る mig：一時の表（RLS あり・revoke・service だけ）＋demo_org_reset に mode 'stage'／'commit' を足す。PostgREST の 1 MB の制限は塊を積む側で守れる。取引の長さは今の合計（6〜8 秒）程度。
- 勧め：案 1 を先に（client だけ・次の便）・案 3 は起草して相談役へ。

## c. JST 03:00〜04:00 に実際に走っている処理（本番の cron を読んだ・11/18）
| 時刻（JST） | 処理 | 何を書くか | デモに触るか |
|---|---|---|---|
| 毎日 03:00 | expire-trials（vercel.json `0 18 * * *`） | org_billing.status を期限切れの試用だけ inactive に（見た目だけ・課金の判定は述語で別） | 触らない（デモの会社は status active・試用でない） |
| 15 分ごと（03:00・03:15・03:30・03:45 も） | nox-shift-auto-confirm（pg_cron → route） | 店設定 shift_auto_confirm_hours が 1〜168 の店の、送り返しのまま古いシフトを確定にする | 設定のある店だけ（デモの店の既定は「自動確定しない」） |
| ほか | 04:30 audit-purge・05:00 billing-reminders・05:15 demo-entries-purge・05:30 billing-quantity・06:05〜06:15 デモの初期化 6 本・06:20 shift-periods-close・06:35 初期化の再試行 | — | 06:05〜06:35 はデモを書き換える |

- 「見込み客デモの作り直し」に当たる処理は無い（デモを作り直すのは 06:05〜06:15 の初期化と 06:35 の再試行だけ）。
- 03:00〜04:00 を避ける理由：デモの reset と重なる処理は無い。expire-trials は試用の会社だけ、自動確定はデモの店に既定で効かない。**デモの書込や reset を避ける理由は見当たらない**（f0 は検査の会社だけ＝重ならない）。避けるなら 06:00〜06:40（初期化と再試行）。

## d. 店の軸（reward_axis）を pay_rate にしたとき、計算に効かせるのに要る変更
- 今：報酬率（CANON）の計算に入るのは「プランの reward_axis が 'pay_rate'」のプランのキャストだけ。店の設定に軸の鍵は無い（0201o で保存の口を作る＝起草）。
- 要る変更（式＝報酬率＝時給分 ÷ 売上小計・段の当て方・canonApplyOf は**変えない**。変わるのは「どのプランに当てるか」の入口）：
  1. lib/nox/store-systems.ts rewardAxisOf：店の settings_json.reward_axis があればそれ（'pay_rate' を返せる型に）・無ければ今のフラグからの導出（売上／pt）。
  2. lib/nox/rules-0175/settings.ts planRewardAxisOf：プランが null のとき店の軸＝'pay_rate' も返す（今は売上／pt だけ）。
  3. lib/nox/payroll/rules-0175-collect.ts（**計算の入口**）：40 行（planIds）と 73 行（キャストごと）の `plan.reward_axis === 'pay_rate'` を「プランの軸、null なら店の軸」で判定。loadRules0175Store が店の settings を既に読んでいる（10〜21 行）＝追加の読取は要らない。
  4. 段（pay_rate_tiers）はプランの列のまま＝店の軸を報酬率にしても、段の無いプランは判定しない（0 円）。画面の注記で「段は待遇プランで」。
  5. lib/nox/demo/seed.ts demoCanonBandsFor：プランの reward_axis だけを見ている（MUSE だけに絞った）＝店の軸は見ない（デモは変えなくてよい）。
  6. 店の軸を売上／pt に戻すときの扱い（プランの軸が null の人は報酬率から外れる＝slide_decisions の提案の行が残る）を決める。
- 触れる式：pay.ts は変えない（canon の結果を受け取るだけ）。集計（cast_sales_aggregate）も変えない。入口の判定（collect.ts の 2 か所）が計算の対象を広げる＝f0 の payroll・pay と、報酬率の検査（payrate1118・0175-0176）の張り替えが要る。
