# 相談役の指示（2026-11-11・■2〜■6）

v62 確定版の後に相談役から受けた指示の本文（Agoora がチャットに貼ったもの・逐語）。次の CC が探せるようにここに置く。0201 は相談役の合図まで貼らない。本番の DDL／データは触らない。

■2 0201 の作り直し（③〜⑥）→ 再生成・試走・handpaste と verify の更新・sha と行数を報告
 ③ punch_self_impl＝店の範囲が判定できない（v_eval が false）ときは within_geofence を null で記録し、返り値の within_geofence も null（punch_self の「未判定＝null」と揃える）。試走に「ソフト・位置未設定の店＝within null」「ip で IP 未登録の店＝within null」を足す。
 ④ punch_self_impl＝予定外 block の出勤は within_schedule が true のときだけ通す（null は 'no shift'＝route が渡し忘れたら閉じる）。試走に null の段を足す。
 ⑤ punch_self_impl＝ハード＋both は IP の不一致を精度不足の保留で通さない（both＝v_ipok ∧（v_gpsok ∨ v_pend）・either は今のまま）。lib の decidePunch も同じに。一致表に「both ハード・精度不足＋他の IP＝geofence_blocked」「both ハード・精度不足＋店の IP＝ok」を足す。※Agoora の返事待ち＝「BANZEN どおり」なら⑤だけ外す。返事が来るまでは⑤を入れた形で起草しておく。
 ⑥ punch_self のコメント「本人のスマホ打刻 OFF の店は 'use route'」→ 実装どおり 'self disabled' に直す。
 verify に③④⑤の行を足す（not like はコメントを除いた本文＝教訓137）。

■3 0201 の前に読取（read only・結果を報告）
 a. 本番で「ハード（punch_enforce）または予定外 block」かつ本人のスマホ打刻 ON（punch_methods.self が true・punch_mode が store でない）の店の件数と店名（デモ／デモ以外）。0201 を貼ると今の client の punch_self はこれらの店で 'use route' になり、フラグ便の反映まで本人のスマホ打刻が止まる。0 件でなければ、フラグ便を先に用意して貼った直後に push する段取りを報告。この SELECT を handpaste_0201.md の事前確認にも足す。
 b. 1 人の auth に有効な casts が 2 行以上ありうるか（本番の件数も）。punch_self_impl は limit 1（順序なし）で、auth_cast_id() と同じ行を選ぶ保証がない。ありうるなら auth_cast_id() と同じ決め方に揃える案を報告。
 c. manager_punch_enabled が false の店で、打刻端末の名前一覧に店長が出たままになるか（出るならフラグ便で一覧から外す）。
 d. 店舗設定で「ハード」を位置も IP も未設定のまま保存できるか（0175 の DB の検査の範囲）。保存できる組み合わせを報告。

■4 相談役へ貼る（次の照合の材料）
 - docs/tmp/night_reads_1110.md の M-134・M-137・M-146・M-153 の節（逐語）
 - docs/tmp/privacy_scan.md（全文）
 - docs/tmp/lane5_plan_1110.md（全文）
 - 0201b の SQL・docs/tmp/0201b_verify.sql・docs/demo/handpaste_0201b.md

■5 起草の可否
 - 0201c＝起草してよい（裁定480 体入・M-146 の DDL 側）。M-156（PIN の重複）は Agoora の方針の後に同じ mig へ足す。staff_pin_self_set／cast_pin_self_set も対象に入れる。
 - 0201d＝起草してよい（裁定478）。条件＝price_dow の数え始めを列のコメントと検査に明記（料金ルールの dow_mask と同じ月始まり）・両端（月・日）の試走を入れる（教訓141）。
 - 0202・477＝lane5_plan を相談役が読んでから。
 - 順序＝0201 → フラグ便 → 0201b → 0201c → 0201d → 0202。

■6 お金に関わる読取の追加（read only）
 - M-146＝デモ以外の org で、バック 50% かつ在庫追跡 ON のまま登録されている商品の件数（意図せず入った既定値の残り）。
 - M-137＝本番の経路で伝票のヘッダとセット行が同じルールから作られることを固定する verify があるか（無ければ次の便で足す）。
 - 教訓141＝曜日を 2 つの数え方で比べている箇所がほかに無いか（シフトの必要人数・営業カレンダー・gen-demo）を一覧で。

## 進み具合（CC が追記・2026-11-11）

同日の Agoora の確定＝裁定474 追補（both は IP が店のものでなければ精度不足でも止める＝⑤は外さない）・店長の打刻の許可の既定 ON（SQL の変更なし）・M-156 の方針（台帳）。

### ■2 0201 の作り直し＝済（貼っていない）
- 生成器 docs/tmp/gen_0201.cjs に③〜⑥・lib/nox/punch/geofence.ts の decidePunch に⑤（tsc 0）。入力＝本番の pg_get_functiondef を取り直し（docs/tmp/dump_live0201.mjs・read only）＝作り直し前の生成器で旧 SQL と 1 バイトも違わないことを確認してから直した。
- **0201＝sha16 ccf2d6d61e36da42・529 行**（旧 7c2ca5ce2ae751bd・524 行は破棄）。検証＝docs/tmp/0201_verify.sql **17 行**（貼り先証明＋16・③④⑤の 3 行はコメントを除いた本文で like／not like＝教訓137）。
- 試走＝**58/58**（本番 ref で BEGIN…ROLLBACK・関数 427→431→427・表 121・DB 変更 0）。足した段＝③ 4（ソフト・位置未設定＝within null／ip で IP 未登録（ソフト・ハード）＝within null／判定できる店は true）・④ 1（within_schedule なし＝no shift）・⑤ 3（both 精度不足＋他の IP＝blocked／＋店の IP＝ok／either 精度不足＋他の IP＝ok）＝lib と RPC の一致表は 18 通り。
- handpaste_0201.md を更新（sha・行数・検証 17 行・一致表・仮置き 3 と 7 を確定・事前確認に■3a の SELECT＝本番で実行して貼り先証明 1 行だけ）。

### ■3 0201 の前の読取（本番 read only・docs/tmp/read_1111_advisor.mjs）
- **a.** ハード（punch_enforce）または予定外 block かつ本人のスマホ打刻 ON の店＝**0 件**（全 11 店が punch_enforce false・require_shift off・self ON・punch_mode punch＝デモ／verify 10・実店舗 1）。0201 を貼ってもフラグ便までに本人のスマホ打刻が止まる店は無い＝段取りの変更なし。SELECT は handpaste_0201.md の事前確認に足した。
- **b.** 1 人の auth に有効な casts が 2 行以上＝**ありえない**（users.auth_user_id は一意 users_auth_user_id_key・casts は有効 1 人 1 行 casts_one_active_per_user_idx（user_id where is_active））・本番 0 件。punch_self_impl の取り方（users.auth_user_id＝p_actor ∧ u.is_active ∧ c.is_active）は auth_cast_id() と同じ条件＝同じ行。limit 1 は残るが、索引で 1 行に決まる。揃える直しは不要（念のため limit 1 を外して「2 行なら forbidden」にする案は 0201c で可）。
- **c.** **出たまま**＝kiosk_staff_list（打刻端末の名前一覧）は role in ('manager','staff') で manager_punch_enabled を見ない＝OFF の店でも店長が一覧に出て、押すと staff_punch が not_found。直し＝フラグ便で一覧から外す（client で店の manager_punch_enabled を読んで除く）か、0201c で kiosk_staff_list に条件を足す（SQL 1 行）。おすすめは後者（端末の client に店設定の読取を足さない）。
- **d.** **保存できる**＝打刻設定の DB の検査は形だけ（stores の CHECK＝restrict_mode 5 値・require_shift 3 値・radius 10〜100000 or null／set_store_profile＝型と範囲）。組み合わせの検査は無い＝ハード＋gps で位置 null／ハード＋ip で IP 0 件／ハード＋both で片方だけ、すべて保存できる。0201 の判定では evaluable false＝素通し（within null・③）。直し案＝店舗設定の画面で「ハードにするには位置か IP が要る」を出して保存を止める（client）＋必要なら 0201c で set_store_profile に組み合わせの検査。

### ■4 相談役へ貼る材料＝docs/tmp/advisor_paste_1111.md（1,190 行・逐語・生成＝build_advisor_paste_1111.cjs）
- night_reads_1110.md の M-134・M-137・M-146・M-153 の節＋privacy_scan.md＋lane5_plan_1110.md＋handpaste_0201b.md＋0201b_verify.sql＋0201b の SQL（sha16 83d59c5b78778d2a・変更なし）。

### ■5 起草の可否＝受領（台帳に記録）
- 0201c（裁定480 体入・M-146 の DDL 側・M-156＝方針確定済み・staff_pin_self_set／cast_pin_self_set を含む・■3c の kiosk_staff_list）・0201d（裁定478・price_dow は月始まりを列のコメントと検査に明記・月と日の両端の試走）＝起草してよい。0202・477 は相談役が lane5_plan を読んでから。順序＝0201 → フラグ便 → 0201b → 0201c → 0201d → 0202。**起草はこの報告の後**。

### ■6 お金に関わる読取（本番 read only）
- **M-146**＝デモ／verify 以外でバック率 50%・在庫 ON の商品＝**実店舗（TEST CLUB）0 件**（商品 0）。is_demo false の旧デモ NOX-DEMO（CLUB NOX・7/30 の seed）に 2 件・NOX-VERIFY-A に 3 件（verify の fixture）。意図せず入った既定値の残りは実店舗に無い。
- **M-137**＝本番の経路（check_open・check_move_seat・apply）でヘッダの set_fee と明細のセット行の単価が一致することを固定する verify は**無い**（ある検査はデモの payload だけ＝verify:nox-night1110 L3-1）。→ 次の便で足す（check_open → set 行の unit_price_snapshot＝checks.set_fee・set_rule_id あり／席の移動・料金の適用の後も一致）。
- **教訓141**＝曜日の数え方は 2 つ。**0 日始まり（JS getDay＝pg extract(dow)）**＝store_business_hours.dow・staffing_needs.dow・shift_period_needs.dow・availability.dow・availability_terms.fixed_off_dows・関数 shift_is_closed_day／reservation_is_closed_day／store_hourly_aggregate／set_store_business_hours／set_staffing_need・client のシフト（必要人数・定休・固定休）・日報／月報／ダッシュボード／分析。**月始まり（bit0 月＝isodow−1）**＝pricing_rules.dow_mask だけ（pricing_resolve_core・ext_menu_build・set_pricing_rule・biz_minutes_of（isodow））。**2 つを比べている箇所**＝料金の帯の定休（pricing-board・maskBitOfBizDow で変換済み＝9d59112）・初期設定 v5（月始まりに直し済み）・gen-demo（isodow→dow_mask は bit＝isodow−1、営業時間は isodow→0 日始まりに変換＝正しい）。**ほかに無い**。これから増える箇所＝0201d の price_dow と臨時営業の日付（営業カレンダー）＝■5 の条件どおり月始まりを明記して両端を試走。

### M-156 の先行の読取（Agoora 11/11 の 2・本番 read only・docs/tmp/read_1111_pindup.mjs＝ハッシュの文字列の一致だけ・平文は扱わない）
- **①今ある重複**＝実店舗（TEST CLUB）は PIN 0 行＝0 件。デモ 6 店＝全員が同じデモ用ハッシュ（gen-demo の固定値＝1234）＝店ごとに staff_pin どうし（2〜3 行）・cast_pin どうし（5〜8 行）・staff と cast の間＝3 つとも重複。旧デモ CLUB NOX（is_demo false）は staff 2・cast 1＝salt が別で判定できない（平文を試さない限り）。verify の A1 は staff 1 行。
  - 直し方の案＝(1) DB に一意制約は貼れない（salt つきハッシュ）＝設定の RPC で同じ店の有効な行と crypt 照合して拒否（既存の重複は mig では消さない＝適用を止めない）。(2) デモ＝gen-demo で人ごとに別の PIN（デモの案内に出す人だけ固定の 1234 など）→ reset で解消。(3) 旧デモ CLUB NOX＝使っていなければ PIN を消す／再設定（Agoora の判断）。(4) staff と cast の間＝同じ人（レジを許可されたキャストは staff_pin と cast_pin の両方を持つ）は同じ PIN を許し、別の人とだけ比べる。
- **②PIN だけで本人を特定する入口**＝**kiosk_unlock（p_membership_id なし）だけ**（staff_pin を店で照合・複数一致は ambiguous で候補の名前を返す＝components/nox/kiosk-unlock-pad.tsx が「名前を選んでください」）。名前を選んでから照合する入口＝kiosk_login・kiosk_punch（cast_pin）・staff_punch（staff_pin）・cast_loan_grant（キャストの同意の PIN）・本人の変更（0201 の self_set）。PIN を設定する入口＝set_staff_pin（スタッフ編集・マスタのキオスク PIN・初期設定 v5）・set_cast_pin（キャスト一覧・初期設定の 1 人ずつ／CSV＝空なら client の genPin で 4 桁）・staff_pin_self_set／cast_pin_self_set（0201）。
- **③複数一致で名前を出さない代わりの挙動の案**＝(a) 失敗として扱う（wrong_pin と同じ返り・端末の失敗回数に数える）＝誰とも分からない・重複があること自体も分からない。設定時に重複を止めた後は、残りの重複（デモ・旧データ）でだけ起きる。(b) 名前を選ぶ画面へ落とす（返りは候補なしの 'choose'・画面は店の全員の一覧から選んで PIN をもう一度）＝使える人は使えるが「同じ PIN の人がいる」ことは分かる。**おすすめは (a)**（実店舗の重複 0・デモは (2) で解消＝(b) の利点が残らない・情報を出さない）。

### 訂正（2026-11-11 夕・相談役の照合）
- ■3d の「打刻設定の DB の検査は形だけ・組み合わせの検査は無い」は**誤り**。set_store_profile には「ハード ∧ 判定方法が gps／both ∧ 位置か半径が null → 拒否」が 0175 から入っている（0201b の SQL の 756 行）。CC は stores の CHECK と set_store_profile の 606〜650 行（値の形）だけを見て、後ろの組み合わせの検査を読み落とした。抜けているのは①punch_restrict_mode が null のとき（null in (...) が null で素通し）②ip／either／both の IP 未登録＝0201e で足す。
