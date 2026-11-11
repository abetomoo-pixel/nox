# 0201 手貼り案内（裁定474＝打刻設定を BANZEN と同じ形に・M-133 の DDL＝kiosk_login の 4〜6 桁・本人の PIN 変更・staff_pin_status の旧キー＝2026-11-10 起草・同日 相談役の作り直し 2 点を反映・2026-11-11 作り直し③〜⑥を反映）

**手貼りは相談役の合図＝ここでは貼らない。** 順序＝0200（2026-11-10 適用済み＝関数 427・表 121）→ **0200b**（デモの reset の直し・handpaste_0200b.md）→ 0200 のフラグ便（push・6 店 reset）→ **0201**。0200b は demo_org_reset だけを触る＝0201 と関数が重ならない。0200 とは関数が重ならない（0200 は kiosk_login／staff_pin_status／punch_self／staff_punch を触らない・set_store_profile も 0201 は触らない＝店長の打刻の許可は専用の RPC）。

## 内容（★1〜★9）
- ★1 punches に判定の結果の列 10＝within_schedule（予定外の判定・出勤だけ）・geo_distance_m・geo_gps_ok・geo_ip_ok・geo_reason・geo_store_lat・geo_store_lng・geo_radius_m・geo_mode・geo_accuracy_m（BANZEN 0109／0062 と同じ列名）。ソフト＝記録だけ残して通す（勤怠に印＝client）。
- ★2 stores.manager_punch_enabled（boolean・既定 true＝今の挙動）。
- ★3 **punch_self_impl(p_actor, p_type, p_geo jsonb, p_okuri)**（**service_role だけ**＝route が本人の auth と判定の材料を渡す＝BANZEN 0205 の翻訳）。判定は lib/nox/punch/geofence.ts の decidePunch と同じ決まり：
  - 本人のスマホ打刻 OFF／打刻しない店は 'self disabled'。
  - ハード＋店の端末のみ（tablet）は 'terminal_only'（理由でも通さない）。
  - **ハード＋GPS＋位置が取れない（許可拒否・取得失敗・精度不足）は 'geofence_unavailable'＝範囲外と同じ扱い**（作り直し②）。範囲外は 'geofence_blocked'。どちらも理由なしは拒否・理由ありは通して geo_override＋note。
  - ハード＋IP は IP の一致で判定（IP はサーバーで取る＝常に判定できる）。either は BANZEN と同じ（精度不足の判定保留は通す）。**both は IP が店のものでなければ止める（精度不足の保留は位置の側だけ＝裁定474 追補・BANZEN と違える＝作り直し⑤）**。
  - **店の範囲が判定できるか（evaluable）と IP の一致は RPC が店の値から再計算**（route の申告に頼らない）。**判定できない店は within_geofence を null（記録と返り値＝作り直し③）**。
  - 予定外 block の出勤で確定シフトなし（**within_schedule が true でない＝null も**＝作り直し④）は 'no shift'・順序は punch_seq_check・**生の座標は残さない**（BANZEN 0109）・判定当時の店の値を写す・audit は audit_log_write_service（座標なし）。
- ★4 **punch_self**（7 引数・authenticated のまま＝今の呼び手と verify を壊さない）＝**端末の自己申告（p_within_geofence／p_geo_override）を受けない**（within は null＝未判定・座標は残さない）・ハード／予定外 block の店は **'use route'**・本人打刻 OFF は 'self disabled'。
- ★5 **kiosk_login＝PIN 4〜6 桁**（4 桁固定だった＝set_staff_pin／kiosk_unlock は 0191 から 4〜6 桁＝5〜6 桁の PIN はキオスクで必ず失敗していた＝M-133 の読取で発見）＋**旧キー cast_register_enabled の OR を外す**（sys_cast_register ≥1 だけ＝0200 で旧キーを消す）。
- ★6 **staff_punch＝店長の打刻の許可**（manager_punch_enabled が false の店は店長の打刻が not_found）。
- ★7 **set_store_manager_punch(p_store_id, p_on)**（owner だけ・audit）。
- ★8 **本人の PIN 変更（M-133）**＝staff_pin_self_set(p_current, p_new)（店長／スタッフ＝staff_pin）・cast_pin_self_set(p_current, p_new)（キャスト＝cast_pin）。**誤りは例外にせず jsonb で返す**（作り直し①）＝{ok:false, reason:'bad current'|'locked'|'bad pin'}・成功は {ok:true}。例外だと失敗回数の update ごと巻き戻り総当たりできた。今の PIN が要る（未設定なら不要）・失敗の上限とロック時間は店設定 pin_lock_max_fail（既定 5）／pin_lock_minutes（既定 10）＝kiosk_login と同じ型・4〜6 桁・audit は事実だけ（値なし）。
- ★9 **staff_pin_status**（同じ署名・ACL 不変）＝レジを許可したキャストの判定を **sys_cast_register ≥1** に（旧キーだけで判定していた＝0200 で旧キーが消えると PIN の状態一覧からキャストが外れる＝0200→0201 の間だけの注意は handpaste_0200.md に 1 行）。

| 項目 | 値 |
|---|---|
| ファイル | docs/tmp/0201_punch_rules_pin.sql（LF）→ 手貼り後に supabase/migrations/0201_punch_rules_pin.sql へ収蔵 |
| sha256 | 先頭 16 桁 **ccf2d6d61e36da42**（**529 行**・2026-11-11 作り直し③〜⑥）＝0200b 適用後の live（2026-11-11 取り直し・既存 4 本は前回と同じ＝作り直し前の生成と 1 バイトも違わないことを確認）から生成。旧版＝7c2ca5ce2ae751bd（524 行）は破棄（punch_self md5 74a22063・kiosk_login 1f5bc5c9・staff_punch 1c1ed455・staff_pin_status aa641edc） |
| 翻訳元 | BANZEN（../makanai-shift）0205 punch_self_impl・lib/geofence.ts・lib/punch-rules.ts／NOX の live（scratchpad/live0201）＋生成器 docs/tmp/gen_0201.cjs（既存 4 本はアンカー置換・新設 4 本と列） |
| 試走 | docs/tmp/try_0201.mjs（BEGIN…ROLLBACK・教訓128／132）＝結果は下の「試走の結果」 |
| 教訓138 | 生成器の置換に行の途中のコメント 0 件（docs/tmp/check_midline_comment.cjs・0200 の型を模擬して 1 件検出できることを確認済み）・試走は作り直す 4 本（punch_self・kiosk_login・staff_punch・staff_pin_status）をすべて実際に呼んでいる |
| 関数数・表数 | 0200 の後＝427／121 → **431／121**（**新設 4**＝punch_self_impl／set_store_manager_punch／staff_pin_self_set／cast_pin_self_set・**作り直し 4**＝punch_self／kiosk_login／staff_punch／staff_pin_status）・列 punches +10・stores +1 |

## 試走の結果（2026-11-11・本番 ref で BEGIN…ROLLBACK＝0200b 適用後の live・DB 変更 0）＝**58/58**
- 前提＝0201 が触る既存 4 本の md5 は起草時と同じ（punch_self 74a22063・kiosk_login 1f5bc5c9・staff_punch 1c1ed455・staff_pin_status aa641edc＝0200／0200b は触っていない）。教訓128／132＝begin;／commit; は行頭に 1 回ずつ・body に commit なし・begin の直後に lock_timeout。
- 検証 17 行＝すべて期待どおり（10／**431**／121／10／1／0/0/1／yes／yes／yes／0/3／yes/yes／jsonb/jsonb／yes／yes／**yes／yes／yes**）。関数 427→431（tx 内）→ ROLLBACK 後 427・表 121 不変。
- 前回（2026-11-10）は 50/50＝作り直し③〜⑤で 8 段を足した（③ 4 段・④ 1 段・⑤ 3 段）。

**lib（lib/nox/punch/geofence.ts の decidePunch）と RPC（punch_self_impl）の 18 通り＝全一致**
| # | 店の設定・端末の状態 | lib | RPC |
|---|---|---|---|
| 1 | gps ソフト・範囲外 | ok（記録だけ） | ok |
| 2 | gps ハード・範囲内 | ok | ok |
| 3 | gps ハード・範囲外・理由なし | geofence_blocked | geofence_blocked |
| 4 | gps ハード・範囲外・理由あり | override | override |
| 5 | gps ハード・位置情報の許可拒否・理由なし | **geofence_unavailable** | geofence_unavailable |
| 6 | gps ハード・位置情報の許可拒否・理由あり | override | override |
| 7 | gps ハード・精度不足（±500m）・理由なし | **geofence_unavailable** | geofence_unavailable |
| 8 | ip ハード・店の IP | ok | ok |
| 9 | ip ハード・他の IP | geofence_blocked | geofence_blocked |
| 10 | either ハード・位置なし＋店の IP | ok | ok |
| 11 | either ハード・位置なし＋他の IP | geofence_blocked | geofence_blocked |
| 12 | either ハード・精度不足＋他の IP | ok（判定保留＝BANZEN と同じ） | ok |
| 13 | both ハード・範囲内＋店の IP | ok | ok |
| 14 | both ハード・範囲内＋他の IP | geofence_blocked | geofence_blocked |
| 15 | tablet ハード | terminal_only（理由でも通さない） | terminal_only |
| 16 | **both ハード・精度不足＋他の IP** | **geofence_blocked**（裁定474 追補＝BANZEN と違える） | geofence_blocked |
| 17 | **both ハード・精度不足＋店の IP** | ok（保留は位置の側だけ） | ok |
| 18 | either ハード・精度不足＋他の IP | ok（either は今のまま） | ok |

**そのほかの段**
- ★3 記録＝within は RPC の判定・IP は route の値・**ip_ok は店の IP からサーバーで再計算**（route が偽っても false で記録）・生の座標は null・距離／精度は丸め・判定当時の店の値を写す・予定外 off は null。予定外 block＋確定シフトなし＝no shift／**within_schedule なし（null＝route の渡し忘れ）＝no shift（④）**／あり＝ok（within_schedule true）。**③＝ソフト・位置未設定の店／ip で IP 未登録の店（ソフトとハード）＝within null（記録と返り値）・判定できる店は within を記録（範囲内＝true）**。退勤＝ok・2 回目＝no open punch。本人打刻 OFF の店＝self disabled。authenticated から＝permission denied・知らない auth＝forbidden・audit に生の座標なし。
- ★4 punch_self（ソフト）＝自己申告を記録しない（within null・override false・座標 null）・ハードの店／予定外 block の店＝use route。
- ★5 6 桁の PIN でキオスクの解錠が通る。
- ★6／★7 店長の打刻の許可＝manager は設定できない（forbidden）・owner＝ok・OFF の店は staff_punch が not_found・ON（既定）は今どおり打刻できる。
- ★8 本人の PIN 変更＝誤りは例外にせず {ok:false, reason:'bad current'}・失敗回数が巻き戻らない（4 回で 4）・5 回目＝locked（locked_until）・ロック中は正しい PIN でも locked・10 分後は ok（fail_count 0）・形式誤り＝bad pin・audit に PIN の値なし（失敗も staff_pin_self_fail で残る）・キャストは staff_pin_self_set を使えない／スタッフは cast_pin_self_set を使えない・キャストは未設定なら今の PIN なしで設定でき、5 桁にも変えられる。
- ★9 staff_pin_status＝旧キーが無くても sys_cast_register 1 の店で can_register のキャストが出る（7 人）・段階 0 の店では出ない（6 人）。

## 仮置き（相談役の裁定待ち）
1. ★4 punch_self は残す（authenticated のまま）＝ソフトで判定の要らない店だけの互換の入口・自己申告は捨てる・ハード／予定外 block の店は 'use route'。client はフラグ（MIG_0201）の後に route へ切り替える。
2. ★3 生の座標（lat／lng）は残さない（BANZEN 0109 と同じ）＝距離・精度・判定の可否だけ。
3. **確定（2026-11-11 Agoora）**★2 店長の打刻の許可の既定＝true（今の挙動＝店長もキオスクで打刻する）。BANZEN は既定 false。NOX の本人のスマホ打刻はキャストだけ＝店長の許可はキオスク（staff_punch）に効かせる。SQL の変更なし。
4. ★8 本人の PIN 変更＝今の PIN が要る（未設定なら不要）・失敗の上限とロック時間は kiosk_login と同じ店設定（既定 5 回・10 分）・キャストは cast_pin（キオスクの打刻の PIN）を変える（レジの操作担当の PIN＝staff_pin はキャストからは変えない）。
5. ★3 予定外 block の判定は route（確定シフトの有無）＋RPC の再確認（within_schedule が true でない出勤を拒否＝null も＝相談役 11/11 ④）。warn は記録だけ。
6. Wi-Fi の IP の登録は既存の store_wifi_add／remove（0175）を使う＝route がサーバーで x-forwarded-for の先頭を取って渡す（client の申告にしない）。
7. ★3 ハード＋GPS で位置が取れないとき＝'geofence_unavailable'（範囲外と同じ＝理由ありなら通す）。either の精度不足は BANZEN どおり判定保留で通す。**both は確定（2026-11-11 Agoora・裁定474 追補）＝IP が店のものでなければ精度不足でも止める**。
8. ★8 ロック中は正しい PIN でも 'locked'（ロック中の入力は失敗回数に数えない）。'bad pin'（桁の誤り）は失敗回数に数えない。
9. ★9 staff_pin_status の判定は sys_cast_register ≥1（キャストのレジ 1 段＝会計まで含む・旧キーは読まない）。

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK
- 'self punch stops until flag push' の行が出たら、その店は 0201 の適用からフラグ便の反映まで本人のスマホ打刻が 'use route' で止まる（相談役 11/11 ■3a）＝出たら貼らずに相談役へ（2026-11-11 の読取＝0 件）。
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'self punch stops until flag push: ' || o.name || ' / ' || s.name, case when o.is_demo then 'demo' else 'not demo' end
  from public.stores s join public.orgs o on o.id = s.org_id
 where (coalesce(s.punch_enforce, false) or coalesce(s.punch_require_shift, 'off') = 'block')
   and coalesce((s.punch_methods->>'self')::boolean, true) and coalesce(s.settings_json->>'punch_mode', 'punch') <> 'store'
union all
select 'md5 drift ' || p.proname, left(md5(replace(p.prosrc, chr(13), '')), 8)
  from pg_proc p join (values ('punch_self','74a22063'),('kiosk_login','1f5bc5c9'),('staff_punch','1c1ed455'),('staff_pin_status','aa641edc')) x(n, m) on x.n = p.proname
 where p.pronamespace='public'::regnamespace and left(md5(replace(p.prosrc, chr(13), '')), 8) <> x.m
union all
select '0200 not applied', 'yes' where not exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='staff_labor_mark_paid')
union all
select 'already applied', 'yes' from pg_proc where pronamespace='public'::regnamespace and proname='punch_self_impl';
```

## 検証クエリ（貼った後）＝docs/tmp/0201_verify.sql（17 行＝貼り先証明＋16）
| k | 期待 |
|---|---|
| nox-project-proof | orgs の件数 |
| fn count | 431（0200 の後 427＋新設 4） |
| table count | 121 |
| punches geo cols | 10 |
| stores.manager_punch_enabled default true | 1 |
| punch_self_impl anon/authenticated/service_role | 0/0/1 |
| punch_self ignores self-report / use route | yes |
| kiosk_login pin 4-6 | yes |
| staff_punch manager gate | yes |
| new authenticated fns anon/authenticated | 0/3 |
| staff_pin_status / kiosk_login read sys_cast_register, not legacy key | yes/yes |
| staff_pin_self_set / cast_pin_self_set return jsonb | jsonb/jsonb |
| self pin fail returns jsonb, no raise for bad current | yes |
| punch_self_impl has geofence_unavailable | yes |
| ③ punch_self_impl within null when not evaluable | yes |
| ④ punch_self_impl block needs within_schedule true | yes |
| ⑤ punch_self_impl both requires store ip even when accuracy pending | yes |

## 手貼り後（CC＝0201 のフラグ便）
- MIG_0201_APPLIED=true・収蔵・verify:nox-0201・client＝lib/nox/punch/geofence.ts（haversine・誤差 200m で保留・IP 完全一致・decidePunch・decideShiftGate＝BANZEN の翻訳・RPC と 15 通り一致済み）・route /api/punch/self と /api/punch/precheck（本人の auth・x-forwarded-for の先頭・確定シフト・admin で punch_self_impl）・/mine の打刻ボタン（位置の取得・理由の入力・事前確認）・店舗設定の打刻設定の節（ハード／ソフト・判定方法 5 択・地図でピン＝Leaflet＋OpenStreetMap（npm 追加）・半径・Wi-Fi の IP 登録（route がサーバーで取る）・予定外 許可／記録／禁止・店長の打刻の許可）・勤怠の印（範囲外／予定外）・スタッフ／キャストの本人の PIN 変更の欄（jsonb の reason を日本語に＝errJa）・初期設定の「条件に合わないとき」の写し先を punch_enforce に直す（setup_gap §3 の食い違い）。
- 0201b（0201 適用後の live から起草）＝売掛 ar_enabled を正本に・set_cast_sensitive の 18 歳判定・税込は price_display を正本に（tax_inclusive_display を白名単から外す）。
