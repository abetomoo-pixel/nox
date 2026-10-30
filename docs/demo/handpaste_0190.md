# 0190 事後照合の記録（★手貼り済み扱い・2026-10-30・裁定436＝K-5 打刻ゲート／端末の束縛／退店の失効＋便 K ⑥〜⑧＝RLS kiosk 腕／M-29 上限 3 台・再発行して有効化・削除／K-1 ロック 10 分）

**結論 3 行**
1. 0190 は **Agoora の手貼りではなく、2026-10-30 12:08〜12:13 に CC の docs/tmp/t0190_verify_rows.mts（verify 期待値の採取）が本番 ref hiqbfagmkrdpmlqhkmsu に COMMIT した**（切り出しの起点が 9 行目の見出しコメント「===== verify =====」に当たり、本体＋commit; を含む全文を流した＝教訓128）。12:16 の計測（関数 393）で検知・12:20 報告。
2. **相談役裁定（Agoora 2026-10-30 12:3x）＝適用済みとして受け入れる（例外）**。down は実行しない（案＝docs/tmp/0190_down_draft.sql）。DB の DDL は触らない。根拠＝事後照合で本番の 40 関数の prosrc md5 が supabase/migrations/0190_duty_gate_device_bind.sql（sha16 6a73e1109a39b996）と **40／40 一致**・_select_kiosk 29・kiosk_devices 5 列・index・end_reason CHECK・下の verify 51 行が期待値と差 0（DDL の xid 2121215＝1 トランザクション）。
3. **貼らないこと**。残りは ①duty_gate を 7 店で OFF（台帳 便 K ①の UPDATE＝Agoora が SQL Editor で）②0191 を新 CC で live から再生成→handpaste_0191.md 更新→手貼り ③0190 のフラグ true 便（K client）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0190_duty_gate_device_bind.sql（3,954 行・LF） |
| sha256 | 先頭 16 桁 **6a73e1109a39b996** |
| 翻訳元 | live pg_get_functiondef（2026-10-29・0189 適用後）＋生成器 docs/tmp/gen_0190.cjs（裁定436）→ docs/tmp/gen_0190_k.cjs（便 K ⑥〜⑧の後処理）＝手打ちなし（関数本体は live の写し＋アンカー置換・新設は生成器の文字列） |
| 構文検査 | scripts/mig-check.mjs＝parse ok・$function$ の対応 ok（39 本×2）・plpgsql 39 本は試走で本番の構文検査を兼ねる |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/t0190_rollback.mts・NOX-VERIFY-A1＝この走は無傷・残留 0）＝**ok 18／ng 0（2026-10-30 12:04・docs/tmp/t0190_rollback.mts＝打刻ゲート cast／staff／manager 免除／duty_gate OFF・端末の束縛・退店・白名単・ACL・⑥ RLS 29・⑦ 上限 3／再発行して有効化／削除・⑧ ロック 10 分）**・関数数 386→393・残留 0 |
| 営業中に貼ってよいか | （貼らない＝適用済み） |

**中身**
- ★1 打刻ゲート（裁定436 ①a 差し替え＝レジだけ）: 内部ヘルパー duty_gate_of／on_duty_of／assert_on_duty（4 ロール revoke）・レジの check_*＋approval 25 本の冒頭（課金ゲート行の直後）に assert_on_duty（店長以上は免除＝audit 'off_duty_exempt'・店設定 duty_gate=false なら何もしない・在庫／日報は対象外）。
- ★2 端末の束縛（①b）: kiosk_devices に device_fp／bound_at／bound_ua／unbound_at／unbound_by・kiosk_device_bind（端末が呼ぶ・初回で束縛・別 fp は 'device bound'）・kiosk_device_unbind（オーナー）・kiosk_login／unlock／qr_secret／qr_poll に p_device_fp。
- ★3 退店（①c）: cast_leave／staff_deactivate の中で staff_pin の削除と kiosk_sessions の終了（end_reason 'retired'）。auth の失効・ban は route（client 便）。
- ★4 店設定 duty_gate（boolean・既定 true）＝set_store_profile の白名単。
- ★6 RLS kiosk 腕（裁定435 追補＝キオスクのレジは register-board と同一部品）: register-board が直読みする 29 表に SELECT ポリシー `<t>_select_kiosk`（store_id = auth_kiosk_register_store_id() and auth_kiosk_operator() is not null＝端末ユーザーが操作担当の解除中だけ・permissive＝通常ユーザーの判定は不変）。
- ★7 M-29: kiosk_provision の上限＝店舗×用途ごとに **3 台**（無効は数えない・'device limit'）・部分ユニーク index は非ユニークに・kiosk_reactivate（無効化済み→有効・上限内・audit）・kiosk_delete（無効化済みだけ・kiosk_sessions を先に消す・audit）。
- ★8 K-1（裁定437）: kiosk_login の既定ロック＝10 分（店設定 pin_lock_minutes が無いとき・最大失敗 5 は既定のまま）。

## 事後照合 SQL（SELECT のみ・適用済みなら missing は「kiosk_devices.device_fp exists, kiosk policies exist, kiosk_reactivate exists」の 3 語になる＝正常）

```sql
select 'nox-project-proof', count(*)::text from public.orgs
union all
select 'missing', string_agg(x, ', ') from (
  select f from (values ('auth_kiosk_register_store_id'),('auth_kiosk_operator'),('auth_kiosk_org_id'),('kiosk_login'),('kiosk_unlock'),('kiosk_qr_secret'),('kiosk_qr_poll'),('kiosk_provision'),('kiosk_deactivate'),('cast_leave'),('staff_deactivate'),('audit_log_write'),('billing_writable_of'),('check_open'),('check_pay')) v(f)
  where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v.f)
  union all select 'kiosk_devices.device_fp exists' where exists (select 1 from information_schema.columns where table_schema='public' and table_name='kiosk_devices' and column_name='device_fp')
  union all select 'kiosk policies exist' where exists (select 1 from pg_policies where schemaname='public' and policyname like '%_select_kiosk')
  union all select 'kiosk_reactivate exists' where exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('kiosk_reactivate','kiosk_delete'))
) m;
```
期待（適用済み）＝`nox-project-proof 9`・`missing`＝`kiosk_devices.device_fp exists, kiosk policies exist, kiosk_reactivate exists`。

## verify の期待値（末尾 ===== verify ===== を貼ると返る行＝2026-10-30 12:1x の本番の実測と全行一致）

51 行（nox-project-proof 9・has 0190 37・gated 25・helpers 3・kiosk entry acl 6・kiosk policies 29・kiosk_reactivate/delete 2・kiosk_login lock 10 true・device limit true・whitelist has duty_gate true・md5 37 本）。

| 行 | 期待値 |
|---|---|
| nox-project-proof | **9** |
| device limit | **true** |
| end_reason has retired | **true** |
| gated 25 | **25** |
| has 0190 (37 fns) | **37** |
| helpers 3 (acl postgres only) | **3** |
| kiosk entry acl (no anon) | **6** |
| kiosk entry args | **kiosk_device_bind:2,kiosk_device_unbind:1,kiosk_login:3,kiosk_qr_poll:1,kiosk_qr_secret:2,kiosk_unlock:3** |
| kiosk policies | **29** |
| kiosk_devices cols 5 | **5** |
| kiosk_login lock 10 | **true** |
| kiosk_reactivate/delete | **2** |
| md5 approval_direct | **7f319b6c** |
| md5 approval_request | **9a211943** |
| md5 assert_on_duty | **09ca6016** |
| md5 cast_leave | **6c485a34** |
| md5 check_add_line | **c22a417e** |
| md5 check_add_seat | **518cf92b** |
| md5 check_close | **982ce1ca** |
| md5 check_customer_add | **ab934607** |
| md5 check_customer_remove | **7eac9c19** |
| md5 check_dohan_add | **b72e0577** |
| md5 check_extension_add | **2aebf22c** |
| md5 check_line_set_customer | **97b2c1ec** |
| md5 check_line_set_group | **b8fa55fb** |
| md5 check_merge | **bceec55a** |
| md5 check_move_seat | **fede3309** |
| md5 check_open | **7a8eef42** |
| md5 check_pay | **7fbbcf6a** |
| md5 check_referral_remove | **bdb6b0ae** |
| md5 check_referral_set | **49a743a0** |
| md5 check_remove_line | **00fe093c** |
| md5 check_remove_seat | **72c240da** |
| md5 check_set_ext_rule | **813e82e6** |
| md5 check_set_nominations | **146426ba** |
| md5 check_set_people | **321b54e5** |
| md5 check_shimei_add | **a0034ff6** |
| md5 check_time_charge_apply | **c31261e8** |
| md5 check_void | **402b0fa8** |
| md5 duty_gate_of | **a19d7936** |
| md5 kiosk_device_bind | **0b2ec706** |
| md5 kiosk_device_unbind | **4ca6bc71** |
| md5 kiosk_login | **a91f85ab** |
| md5 kiosk_qr_poll | **84afd08c** |
| md5 kiosk_qr_secret | **94a6536c** |
| md5 kiosk_unlock | **3d65ef8c** |
| md5 on_duty_of | **dd0a738d** |
| md5 set_store_profile | **e56d9253** |
| md5 staff_deactivate | **c64a7d72** |
| nox-project-proof | **9** |
| whitelist has duty_gate | **true** |

## 新 CC がやること（0190 のフラグ true 便の前）
1. 照合済み（本書）。t0190 を本番の定義で再走するなら **T0190_NO_APPLY=1**（本体を流さない）＝BEGIN…ROLLBACK・残留 0。verify 採取の別スクリプトは作らない（教訓128）。
2. **0191 を live から再生成**（gen_0191.cjs＝set_store_profile が 0190 の duty_gate 込みになる）→ sha16 と handpaste_0191.md の表を更新 → Agoora が 0191 を貼る。
3. 0190 を収蔵・フラグ **MIG_0190_APPLIED** を追加して true（client＝K-5 の device_fp・端末一覧の「束縛中」「端末を解除」・店舗設定の「打刻ゲート」スイッチ・退店ダイアログの注記・ゲートの文言・退店 route の admin signOut＋ban／K-0＝キオスクのレジを register-board の包みに／M-29 の「再発行して有効化」「削除」／K-1 の人を選ぶ→PIN（0185 の PIN だけの解除は撤去））・pin 張替え・f0 2 連・live・push・6 店 reset。

**Success 表示は適用の証明にならない（恒久注意28）。本件は verify 51 行の実測一致と md5 40／40 を適用の証明とした。**
