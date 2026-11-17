# 報酬率スライド＝店舗設定の報酬の軸と、今の数え方（2026-11-17・相談役 3・読取だけ・コードは変えていない）

## 1. 店舗設定の「報酬の軸」に報酬率を足して 3 択にできるか
- 今の店の軸＝lib/nox/store-systems.ts の rewardAxisOf：sys_points か sys_point_slide が ON なら「ポイント」・それ以外は「売上」＝**店の設定に軸そのものを持つキーは無い**（フラグからの導出）。保存は rewardAxisPatchOf が sys_points／sys_point_slide／sys_sales_slide の真偽を書く。
- 保存の口（DB の set_store_profile）が受け付けるキーは白名単（sys_hourly・sys_backs・sys_sales_rate・sys_points・sys_sales_slide・sys_point_slide・sys_norms・sys_penalties・sys_bonus ほか）＝**reward_axis のキーは無い＝'bad key'**。
- 報酬率はプランの列（comp_plans.reward_axis＝'pay_rate'・comp_plan_ext_set）にだけ持てる。プランの軸が null なら店の軸（売上／ポイント）を引き継ぐ（planRewardAxisOf）。
- **3 択にするには mig が要る**：set_store_profile の白名単に reward_axis（'sales'／'pt'／'pay_rate'）を足す（関数の差し替えだけ・表の定義は変えない）。あわせて client の rewardAxisOf を「キーがあればそれ・無ければ今の導出」に、計算の側（rules-0175-collect の CANON の対象＝プランの reward_axis が 'pay_rate' のもの）を「プランが null で店が 'pay_rate'」にも広げる＝**計算の入口に触れる**（式は同じ・どのプランに CANON を当てるかが変わる）。
- 段（pay_rate_tiers）はプランの列のまま＝店の軸を報酬率にしても、段を入れたプランが要る。

## 2. 今の計算が報酬率をどう数えているか（lib/nox/rules-0175/canon.ts・payroll/rules-0175-collect.ts・pay.ts）
- **報酬率＝時給分の報酬 ÷ 売上小計 × 100**（小数 1 桁・payRatePctOf）。
  - 分子＝時給分（timePay＝時給×時間の合計・**バックは含めない**）。
  - 分母＝売上小計＝店の設定 sales_subtotal_mode（⑩）：既定 due＝会計額（サ料込み・丸め後・手数料の行を除く＝キャスト別に分配した売上）／pre_tax_service（税サ前・割引前）は**選べるが、今の便では集計の元が due のまま**（collect.ts 942 行の注記＝pre_tax_service の按分集計は未接続）。画面の「時給分 ÷ 売上小計」は due のときの式。
  - 小計 0 は判定しない（null）。
- **どの期の値で、どの期の時給に効くか**：今の期（給与の期）の時給分と売上小計で率を出し、段を決める。
  - UP（up_amount）＝**決定時給に加算して次の期から続く**（累積＝cast_rate_history の slide_up・⑫ 差し替え）。今の期の時給は変えない。来期の見込みは canonNextWageOf（「来期の時給見込み」）。
  - 査定（pay_pct＜100・down_amount・wage_cut_pct）＝**決定時給は変えず、今の期の総報酬（時給分＋バック）に支給率を掛ける**（wageCutPct は常に 0＝時給の減率は使わない）。down_amount は判定の結果に載るが、決定時給の履歴へは書かない（⑫）。
  - bonus_pct＝今の期の売上小計 × 率を足す（UP 側）。back_mult＝今の期のバックに倍率（UP 側は既定 100・査定側は段の値）。hon_back_rate＝査定の段の本指名バックの率。days_min／back_gate_pct＝出勤日数と率でバックの支給可否（⑰(b)）。
- **段の当て方**：段は at_pct の昇順・「率 ≥ at_pct の最大」が当たる（payRateTierOf）。
  - 方向（directionOf）＝査定（pay_pct＜100 か wage_cut か down_amount）＞ UP（up_amount＞0 か back_mult≥100 か bonus）＞ 据え置き。
- **連続した期の数**：slide_streak_n（プランごと・既定 2）。直前の期の判定ログと同じ方向なら連続を +1・違えば 1。連続が N 以上のときだけ成立（移動窓＝N 期すべて同じ帯）。成立しても**店が「適用」したときだけ金額に効く**（⑬＝提案→適用／除外）。規定（出勤日数など）を満たさないと UP 側だけ止まる（⑪）。入店後の猶予（assess_grace_months）の間は査定を止める（⑰(c)）。

## 3. 11/16 の参考の表を当てはめると
（11/16 の参考の表の全文は CC に届いていない。相談役の例「40% 以下で 1,000 円 UP」の形で当てはめた）
- **そのまま表せる**：「報酬率が x% 以下（＝低いほど良い）で時給を +n 円（次の期から・累積）」＝段を at_pct の昇順で置き、低い帯に up_amount。例＝[{at_pct 0, up_amount 1000}, {at_pct 40.1}（据え置き）, {at_pct 50, pay_pct 90}（査定）]。連続 N 期（既定 2）を 1 にすれば毎期。
- **注意が要る（表せるが形が違う）**：
  - 「40% **以下**」の境＝段は「at_pct **以上**」で当たる＝40.0% ちょうどを UP に入れるには次の段を 40.1 から始める（at_pct は小数 1 桁で書ける）。
  - UP は**次の期の時給**に効く（今の期の時給は変わらない）。
  - 店が期ごとに「適用」を押さないと金額に効かない（提案のまま）。
- **表せない**：
  - 「x% 以上で時給を n 円**下げる**」＝下げる額（down_amount）は決定時給に入らない（⑫ で査定は時給を変えない）＝支給率（pay_pct）で総報酬を減らす形にするしかない。
  - 「時給を n% 減らす」（CLUB G 型）＝wage_cut_pct は常に 0（⑫）。
  - 分母を「税サ前の小計」にする＝設定はあるが集計が未接続（due で数える）。
