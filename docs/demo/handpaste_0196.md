# 0196 手貼り案内（キオスクの便＝裁定448 B 方式・453・§9 出勤時の控除・M-93 差し替え・2026-11-05 夜の自走便 2 で起草）

**手貼りは相談役の合図＝ここでは貼らない。** 順序＝0195 の後（本番は 0195 適用済み＝関数 416・表 119）。0197 はこの後に別紙（handpaste_0197.md）。

## ★仮置き 10 点（相談役が朝に裁定・変更があれば gen_0196.cjs を直して live から再生成）
1. **§6-1 staff の PIN 入場**＝操作担当の候補のまま（staff は can_register の人だけ＝kiosk_login の候補と同じ・候補は広げない）。
2. **§6-2 無操作**＝店設定 kiosk_person_idle_minutes（M-49・既定 10・1〜120）を流用（kiosk_person_claim の戻り idle_minutes）。
3. **§6-3 予約・顧客のタブ**＝本人セッションなら本店と同じ RLS＝出す（DDL には関係しない・client の kioskNavOf＝レジ／打刻／予約／シフト／在庫／顧客／日報）。
4. **§6-4 卓カードの指名**＝kiosk_register_state の checks に nominations（本指名・場内・同伴の印・終了していない行）を足す（端末セッションのレジでも出る・写真は既存 /api/kiosk/photos）。
5. **§9-1 cast セルフ腕**＝cast_day_deductions_set に本人の経路（自分の行・当日の営業日だけ＝'not today'・audit は本人）。
6. **§9-2 kiosk_punch の 5 引数目 p_day_deductions**（in のときだけ受理＝退勤に付けると 'bad day deductions'・既定どおりの行は消す＝set と同じ式・PIN が本人確認＝操作担当は要らない・set_by は null）＝旧 4 引数は drop（多重定義の曖昧さを残さない・3／4 引数の呼び出しは DEFAULT で従来どおり）。
7. **§9-3 kiosk_punch_state(p_cast_id uuid default null) に day_rules**（pick ルール＝有効・自店のキャスト・キャスト別の適用で使わないは除く・額の上書きを反映）＝旧 0 引数は drop（0 引数の呼び出しは DEFAULT で従来どおり・day_rules は空）。
8. **M-93 kiosk_operator_list と kiosk_login の候補**＝cast は `sys_cast_register>=1 または旧 cast_register_enabled='true'`（kiosk_unlock と同じ判定＝client の castRegisterLevelOf と同じ）。
9. **追加 5 代行打刻**＝punch_proxy を**自店の staff にも開く**（B 方式＝staff の本人セッションが「代わりに打刻」を押す・actor は本人・audit は従来どおり）。今の punch_proxy は owner／manager だけ＝staff は forbidden（読取で判明）。
10. **M-100 destination の自動埋め**＝route（admin の update）で済む＝0196 には入れない。

**結論 3 行**
1. 0196＝kiosk_sessions に列 2（person_auth_session／person_role）・RPC 新設 2（kiosk_person_claim／kiosk_person_end＝service_role だけ）・作り直し 8（kiosk_lock＝jsonb を返す・kiosk_register_state＝nominations・cast_day_deductions_set＝cast セルフ腕・kiosk_punch＝5 引数・kiosk_punch_state＝1 引数・kiosk_operator_list／kiosk_login＝候補の判定・punch_proxy＝staff）＝関数 416→**418**・表 119 不変。
2. live（0195 適用後・2026-11-05）から生成（手打ちなし＝関数本体は live の写し＋アンカー置換・docs/tmp/gen_0196.cjs）・**begin の直後に set local lock_timeout = '10s'（教訓132）**・試走 BEGIN…ROLLBACK＝2026-11-05 **27/27・DB 変更 0**（416／119 → tx 内 418／119 → 416／119・verify 22 行が期待値と全行一致）。
3. 手順は 0195 と同じ＝本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で事前確認 SQL（返り＝貼り先証明 1 行だけなら貼ってよい）→ 全文を 1 回 Run（begin〜commit）→ 検証クエリ（期待値と全行一致）→ CC に返り 22 行を貼る → CC が MIG_0196_APPLIED=true のフラグ便。

| 項目 | 値 |
|---|---|
| ファイル | docs/tmp/0196_kiosk_person.sql（LF）→ 手貼り後に supabase/migrations/0196_kiosk_person.sql へ収蔵 |
| sha256 | 先頭 16 桁 **91e387cabf51b8db**（571 行・36,726 B・LF） |
| 翻訳元 | live pg_get_functiondef（2026-11-05・0195 適用後・docs/tmp/dump_live_0192.mjs→scratchpad/live0196）＋生成器 docs/tmp/gen_0196.cjs・検証＝docs/tmp/0196_verify.sql |
| 試走 | docs/tmp/try_0196.mjs（教訓128＝行頭マーカー・commit; の不在 assert・lock_timeout の 1 行 assert・関数数を tx の外で前後に）＝ 2026-11-05 **27/27・DB 変更 0** |
| 根拠 | 台帳 裁定448／453／455（M-93 差し替え）／M-103／docs/tmp/0196_plan.md §1〜§10 |
| 関数数・表数 | 416／119 → **418／119**（新設 2＝kiosk_person_claim・kiosk_person_end） |

**中身**
- ★1 裁定448＝kiosk_sessions.person_auth_session（boolean・既定 false）／person_role（text）。kiosk_person_claim(p_device_auth_user uuid, p_device_fp text)＝service_role だけ（route /api/kiosk/person-session が端末セッションの uid を読んで渡す）＝束縛済みの端末だけ（'not bound'／'device bound'）・有効な解除（kiosk_sessions・無操作 kiosk_idle_sec 以内）・役割 manager／staff（owner／admin／cast＝'forbidden'）→ 印を付けて {session_id, auth_user_id, membership_id, role, store_id, device_id, idle_minutes}。kiosk_person_end(p_session_id, p_reason done／idle／manual／lock)＝ended・audit・二度目は false。kiosk_lock は jsonb {ok, person_end} を返す（void→jsonb＝drop して作り直し・既存の呼び手は戻りを見ていない）。
- ★2 kiosk_register_state の checks[] に nominations [{cast_id, kind, is_dohan}]（ended_at null・position 順）。
- ★3 §9＝cast_day_deductions_set の cast 腕（本人・当日だけ）／kiosk_punch(p_cast_id, p_pin, p_type, p_okuri, p_day_deductions jsonb default null)（in のときだけ・同じ tx で cast_day_deductions を upsert／delete・audit の after_json に day_deductions）／kiosk_punch_state(p_cast_id default null) の day_rules。
- ★4 M-93＝kiosk_operator_list／kiosk_login の cast 候補（新キー or 旧キー）・punch_proxy＝自店の staff も可。

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK（md5 は 2026-11-05 の dev＝0195 適用後の値・本番で再照合してから貼る）
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift ' || x.n, coalesce(left(md5(replace(p.prosrc, chr(13), '')), 8), 'missing')
  from (values ('kiosk_lock','51c43564'),('kiosk_register_state','a4426533'),('kiosk_punch','ffa49ad5'),('kiosk_punch_state','0ed80625'),('kiosk_operator_list','bfd6b46c'),('cast_day_deductions_set','994b62cd'),('kiosk_login','81ced32e'),('punch_proxy','bb59dc9a')) x(n, m)
  left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname = x.n
 where p.oid is null or left(md5(replace(p.prosrc, chr(13), '')), 8) <> x.m
union all
select 'already applied', 'yes' from information_schema.columns where table_schema='public' and table_name='kiosk_sessions' and column_name='person_auth_session';
```

## 本文
docs/tmp/0196_kiosk_person.sql の全文（begin〜commit を 1 回 Run）。URL の ref＝hiqbfagmkrdpmlqhkmsu を目視してから。

## 検証クエリ（貼った後）＝docs/tmp/0196_verify.sql（22 行＝貼り先証明＋21 行・期待値は各行の見出しに）
| k | 期待 |
|---|---|
| nox-project-proof | orgs の件数 |
| fn count | 418 |
| table count | 119 |
| new fns | 2 |
| col kiosk_sessions.person_auth_session／person_role | yes／yes |
| kiosk_punch 5 args／4 args | 1／0 |
| kiosk_punch_state 1 arg／0 args | 1／0 |
| kiosk_lock returns | jsonb |
| claim/end service_role／authenticated | t,t／f,f |
| anon exec on 10 fns | 0 |
| authenticated exec on 8 fns | 8 |
| register_state has nominations／operator_list・kiosk_login uses sys_cast_register／punch_proxy allows staff／cast self arm not today／kiosk_punch_state day_rules | yes ×6 |
| person sessions so far | 0 |

## 試走の記録（dev・BEGIN…ROLLBACK・DB 変更 0）
- 2026-11-05（dev＝0195 適用後）: body 560 行・commit-free ok・lock_timeout ok → 関数 416／表 119 → tx 内 418／119 → ROLLBACK → 416／119（DB 変更 0）。verify 22 行＝期待値と全行一致。
- 動作 27/27＝★1 claim（not bound／no session／owner forbidden／device bound／staff ok＝session_id・auth_user_id・membership_id・role・store・idle 10／印と audit／authenticated は permission denied）・kiosk_lock jsonb（person_end true／false）・person_end（true・二度目 false・bad reason）／★2 register_state の checks に nominations（配列）／★3 cast セルフ腕（本人・当日 ok／not today／他人 forbidden／既定に戻すと 0 行）・kiosk_punch_state(p_cast_id) の day_rules（2 本・0 引数は空・キャスト別の除外と上書き 450）・kiosk_punch（退勤に付けると bad day deductions・悪い行は statement ごと戻る・出勤と同時に 1 行＋audit・3 引数の退勤 ok）／★4 punch_proxy＝自店の staff ok・他店 forbidden・候補の判定は 2 関数とも新キー。
- ★試走の NG 2 件（初回）＝テストの順序（同じキャストで退勤の後に出勤＝'already out'）＝テストを直した（本体は不変）。
