# 0176 手貼り案内（Agoora 向け・2026-10-22 起草・便 0175／0176 起草＝401 LINE・399 の残り（スタッフ契約の書込・登録→招待・基本情報）・400 の残り（連絡先の履歴）・I-4 連絡の確認済み・SH-UI-b の 0176 行き 5 件）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **Downloads/0176_people_line_draft.sql** の全文を貼って Run（1 本だけ・所要 1 分）。**0175 v2 の後**（users.contact_email／staff_contracts.pay_kind／memberships.hire_date を前提・v1 は貼らない）・0177 の前。
2. 中身＝①LINE 連携（stores.line_config／line_monthly_limit・line_links・line_bind_tokens・line_push_log・RPC 8＝Vault のシークレットは service_role だけ）②スタッフ契約の書込 staff_contract_set・登録→招待の 2 段（staff_invites＋create／accept）・本人の基本情報 member_profiles（申告→店が確定）③遅刻・当欠の連絡＝確認済み（attendance.ack_*）と履歴（attendance_contacts）④連絡先の変更履歴 contact_changes（set_my_contact を置換）⑤シフト＝期間ごとの必要人数・締切の自動遷移（cron 用 RPC）・本人の辞退・キャスト 1 人あて通知・宛先つきお知らせ。
3. Success 後に **docs/demo/verify_0175_0176.sql（1 文）** を貼り、**返った行（ok 列）を CC へ貼る**（全行 true が期待）。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | Downloads/0176_people_line_draft.sql（docs/tmp の同名と同一・repo には適用確認後に 0176_people_line.sql として収蔵） |
| sha256 | `afaf05e83adba89461951f252aaf63f2efa80a7946b59892a52af2a9280eb821`（77,266 B・974 行・LF・CR 0） |
| 順序 | **0175 の後**（0175 が無いと users.contact_email 等が無く set_my_contact の置換で止まる＝単一トランザクションで全部戻る）。0177 とは触る所が重ならない |
| 生成器 | docs/tmp/gen_0176.mjs（新設の表・RPC＝文字列・live の関数置換は set_my_contact＝0175 の本文＋履歴の insert だけ） |
| 構文検査 | scripts/mig-check.mjs＝libpg_query（153 文）＋ローカル Postgres 18（plpgsql 24 本・ROLLBACK）で **errors 0**（2026-10-22） |
| Vault | supabase_vault は本番に有効（0021／0163 で使用済み）。set_line_secret／get_line_secret が vault.create_secret／update_secret／decrypted_secrets を使う |

```bash
sha256sum ~/Downloads/0176_people_line_draft.sql
```

★既存データの書換え＝0（列追加は全部既定値つき・新表・新 RPC）。stores.line_config／line_monthly_limit は NOT NULL だが既定値あり＝デモの reset は 0175 の demo_org_reset（列指定 insert）で失敗しない。
★service_role 専用 6 本（set_line_secret／get_line_secret／bind_line／staff_invite_accept／line_push_log_write／shift_periods_auto_close）＝4 ロール明示 revoke→service_role だけ grant。route（admin client）からだけ呼ぶ。line_bind_tokens は SELECT ポリシー 0 本（RPC 専任＝cast_pin と同型）。
★client との順序（P176）: LINE の route（/liff/[storeId]・/api/line/{bind,session,webhook}・lib/nox/line）・店舗設定「LINE」節・ホームの送信カード／スタッフ登録→招待の画面と route／基本情報の画面／連絡の確認済みの表示／シフトの期間ごとの必要人数の読み替え（dayStat）・cron route（shift_periods_auto_close・毎日 JST 06:10）・/mine の辞退ボタン（shift_cast_decline）・通知欄（cast_notifications）・お知らせの宛先絞り（notices.cast_ids）。適用直後は全部「器だけ」＝画面は変わらない。
★411（キャストの打刻 使う／使わない）は DB 変更なし（punch_methods の組合せ・便 X13-G W-23 で client 済み）。

## 2. 貼る

1. SQL Editor の新規タブに `0176_people_line_draft.sql` の全文（冒頭コメントから `-- ===== end 0176 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証（Success の後・1 文で）

`docs/demo/verify_0175_0176.sql` の全文を新規タブに貼って Run（SELECT のみ・0175 と共通）。

| 見るところ | 期待 |
|---|---|
| ok 列 | 全行 true（0175→0176 の両方が入った状態） |
| 「md5 不一致の関数名」の v | 空（set_my_contact は 0176 の値で一致） |
| 「関数数」「表数」 | 357／104 |

**Success 表示は適用の証明にならない（恒久注意28）＝上の 1 文の返り値（ok 列）を貼ってから P177（0177_okuri_mode_4way_draft.sql・docs/tmp・sha16 e22bfcc3eb93625c）へ。**

## 4. 適用記録
- （未適用・2026-10-22 起草）
