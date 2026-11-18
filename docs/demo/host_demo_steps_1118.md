# デモの 7 店目＝ホストクラブ（架空 CLUB VESPER・店コード host）を出す手順（2026-11-17 夜 起草 → 2026-11-18 夜 今夜の結果で更新・相談役 ④）

## 0. 今夜の結果（2026-11-18 18:3x〜18:4x・CC）
- **会社とユーザーは作成済み**（`node scripts/demo/create-demo-orgs.mjs --apply --only=host`・18:34）。作ったのは会社 1・org_billing 1（active）・auth ユーザー 5・users 4 だけ。
  - 書く前に既存の行を写し（docs/tmp/host_snap_before.json）、書いた後と比べた：既存の orgs の行・org_billing・stores・users・auth.users・memberships のハッシュは**全部同じ**。数は orgs 10→11・auth 48→53・users 198→202・stores 11 のまま。
  - **もう一度流しても重複しない**（2 回目の DEMO_USERS の id は 1 回目と同じ・数は増えない）。会社は名前・auth は email・users は auth id で探してから作る。
- **初回の中身入れ（reset）は作業ツリーから**（docs/tmp/host_reset_1118.mts＝env DEMO_USERS の代わりに demo-host-<役割> のメールから写像を組む・ホストの会社 1 社だけ）。18:35・18:40 の 2 回。先月（10 月）の給与は 12 人で確定。
  - 1 回目は stores の receivable_policy の CHECK で止まった（Y2c の値 'customer'＝制約に無い→ 'customer_only' に直した・会社は空だったので影響なし）。
- **写真**：NEST-CAST-001〜012.jpg を HOST-CAST-001〜012.jpg に写した（元はそのまま）。006〜012（11/18 に Agoora が足した写真）＝レオ・アキラ・ミナト・ソウマ・ハル・ルイ・ジン、001〜005＝ユウキ・カイト・ハヤト・リョウ・シン。`upload-photos.mjs --apply --casts --dir=<ホストの 12 枚だけのフォルダ>` で 12 枚を入れた（他の店の写真には触れていない）。reset のたびに印が付け直される（12/12）。
- **入口にはまだ出ない**：/demo と LP は env DEMO_USERS にその店の owner の鍵がある店だけを出す（lib/nox/demo/session.ts demoStoresShownOf）。Agoora が env を入れて deploy し直すまで、ホストのカードは出ない。

## 1. ID の対応（本番・2026-11-18 18:4x 読取）
| 種類 | 値 |
|---|---|
| 会社 NOX-DEMO-HOST | 12320315-4b8b-4b9b-860e-3e7c4f946cda |
| 店 CLUB VESPER（payload の id を会社ごとに付け替えた値） | 57ac90a9-e0f1-5833-b0b7-64f54af2be92 |
| オーナー（demo-host-owner・デモ オーナー） | users.id 56f3bcc1…／auth f39abd39… |
| 店長（demo-host-manager・デモ 店長） | users.id d0213469…／auth 57a25926… |
| スタッフ（demo-host-staff・加藤） | users.id 3eeac28a…／auth 8ea7b8d4… |
| キャスト（demo-host-cast・レオ＝casts.user_id に結線） | users.id 1951a178…／auth b3540534… |
| 端末（demo-host-kiosk・users 行なし＝kiosk_devices.auth_user_id） | auth 6b391ea0… |
- 4 人の所属（memberships）はどれも CLUB VESPER。全文の id は docs/tmp/host_ids_1118.json（git に入れない）。

## 2. Vercel の env（Agoora・CC は Vercel にログインしない）
- 今の DEMO_USERS（JSON）に次の 5 つの鍵を**足す**（6 店の 30 鍵は消さない）。値の全文は docs/tmp/host_demo_users_1118.txt と朝の報告：
  `host:owner`・`host:manager`・`host:staff`・`host:cast`・`host:kiosk`
- 保存したら deploy し直す（/demo と LP は build の時に env を読む＝deploy し直すとホストのカードが出る）。

## 3. cron（Agoora・SQL Editor・URL の ref を目視・貼り先証明を先頭に）
```sql
select 'nox-project-proof', count(*) from public.orgs;
select cron.schedule('nox-demo-reset-host', '17 21 * * *',   -- JST 06:17（6 店の 06:05〜06:15 の後・retry 06:35 の前）
  $$select net.http_get(url := (select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url') || '?org=host', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 60000)$$);
select jobname, schedule from cron.job where jobname like 'nox-demo-reset%' order by jobname;   -- 8 行（6 店＋retry＋host）
```
- 同じ名前で 2 回流しても job は 1 つ（cron.schedule は同じ名前を上書き）。形は今の 6 店の job と同じ（url の末尾が ?org=host なだけ）。
- **順番**：コードの push（DEMO_STORES に host が入った deploy）→ env → cron。env の前に cron が走ると route は host の写像が無く失敗する（他の店には影響しない）。

## 4. 中身（payload＝scripts/demo/profiles.mjs と gen-demo.mjs）
- 店：CLUB VESPER・業態 **host**（0201o）・サ 30%・税 10%・会計の丸め 1,000 円切り上げ・売掛はお客様だけ（customer_only）。
- 料金：セット 7,000 円／60 分・延長 3,000 円／30 分・本指名 3,000・場内 2,000。
- 報酬：VESPER Standard（時給 0・本指名 1,000・場内 500・同伴 2,000）・キャストドリンク 200 円（本指名／場内／同伴／フリー＝ヘルプにも）。
  - **売上歩合の段**＝自由設計のバック 6 行（基本「売上歩合（小計の 40% 相当）」28%＋加算 3／4／3／4／3%・境＝請求額 429,000／715,000／1,430,000／2,860,000／4,290,000）。小計の基準への切り替えは profiles.mjs の `HOST_COMMISSION_BASIS` 1 か所（③の公開後に 'subtotal'＝率 40／5×5・境 30〜300 万・店の鍵 sales_basis／sales_back_default_off）。
  - 新人 3 人（カイト・ハヤト・リョウ）＝プラン「VESPER 新人」最低保証 160,000 円。
  - レオの幹部手当 50,000 円＝出勤ボーナスの表（宛先レオだけ・理由「幹部手当」）。精算調整は控除だけで加算の口が無い。
- 人ごとの売上：生成器が本指名（シンは場内）の伝票を人ごとの目標（小計 × 1.43）へ割り振り直す（大きい伝票から足りない人へ・余りはレオ）。先月の売上の目標は LUNA の写し × 2.85（月 22,339,000 円）。
- 先月の明細（18:40 の reset で確定）：docs/tmp/host_slip_table_1118.md。
- 未対応の機能：docs/demo/host_unsupported_1118.md。

## 5. 検査
- verify:nox-demo1118 d(6)・d(7)（payload＝人ごとの段・段の 6 行・小計への切り替え・幹部手当・シン・写真の対応）。6 店の差別化の pin と golden は 6 店のまま。
- /demo・LP の入口＝demo-guard dg(6-6)・demo-payload dp(5-1)（env に鍵のある店だけ）。
