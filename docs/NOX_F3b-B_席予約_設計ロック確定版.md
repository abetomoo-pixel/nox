# NOX F3b-B 席予約機能 設計ロック確定版

最終更新: 2026-07-13 / 状態: 実装完了（mig0029 + UI・origin/main 005b2a1）

## 0. 位置づけ

F3a-3（卓なし予約・案A）に対する席指定予約の追加。既存 `reservations` テーブルを拡張し、
卓なし予約と席予約を同一テーブルで共存させる（seat_id nullable による coexistence）。
F3a-3 確定版と対で読むこと。

## 1. 確定裁定（4論点）

### 裁定1: 登録フォーム = 卓指定トグル方式
- 「席を確保する」トグル。既定 OFF = 従来の卓なし予約（seat_id null / stay null）。
- ON で自店 active 卓 select ＋ 滞在時間 select を展開。
- 滞在時間: 1/1.5/2/3時間（既定 2時間）。RPC 内ホワイトリスト 60/90/120/180 分と一致。

### 裁定2: 空き枠表示 = (b) 選んだ卓の当日既存枠を表示
- 卓選択時、その卓の当日 booked 枠を `reservations` から seat_id + 日付で直 SELECT（RLS で読める範囲）。
- 専用 RPC は作らない。表示形式「18:00-20:00（席一郎）」＋被り注記。
- 編集時は自枠を除外して表示。

### 裁定3: 来店処理 = 案2（来店済 → 卓 select 展開）
- 来店済にすると卓 select を展開。予約卓を既定選択（「（予約卓）」表示）。
- 使用中卓は openMap で候補から除外＋赤字注意。別卓を明示選択して上書き可（実来店が勝つ）。
- nom_type も上書き可。
- audit 挙動（確認A）: 予約卓と実卓が別の場合、audit に両方残存する。
  例: 予約 PERM卓 / 実来店 卓1改 → audit に PERM卓・卓1改の両方。

### 裁定4: 予約編集 = 卓/時間変更を含める（新設）
- F3a-3 には編集 UI 自体が存在しなかったため新規追加。
- booked のみ編集可。
- 全フィールド明示送信（規約7・birthday 同型の「未送信フィールドが消える」罠回避）。
- トグル OFF で保存 = 卓クリア（seat_id null / stay null を明示送信）。注記つき。

## 2. DB 層仕様（mig0029）

### 2-1. reservations 拡張
- `seat_id uuid null`（卓なし予約との共存）
- `stay tstzrange null`（滞在区間）

### 2-2. EXCLUDE 排他制約（二層防御の一層目）

```sql
EXCLUDE USING gist (seat_id WITH =, stay WITH &&)
  WHERE (seat_id IS NOT NULL AND status = 'booked')
```

- 同一卓・時間帯重複を DB レベルで排他（発火時 23P01）。
- btree_gist（extensions スキーマ・v1.7）を schema extensions と共にインストール。
- seat_id null（卓なし予約）は WHERE 条件で対象外 → 非干渉。

### 2-3. stay CHECK 制約 2本
- both-or-neither: seat_id と stay は「両方 null または両方 not null」。
- 整合: `lower(stay) = reserved_at` かつ `upper(stay) > lower(stay)`。

### 2-4. 滞在時間ホワイトリスト
- RPC 内で 60/90/120/180 分のみ許可。範囲外は拒否。

### 2-5. RPC 3本改修
- create / update: invalid store ガードを拡張。
- to_check: `coalesce(p_seat_id, 予約卓)` で卓解決。seat occupied 検証（発見1・確認A）。
- 二層防御の二層目 = RPC 事前検証が 'seat time conflict'（日本語「枠重複」）を返す。

## 3. 実機で発見・修正したバグ

### parseStay の Invalid Date（★重要・再発防止）
- 症状: PostgREST が tstzrange を分なしオフセット（`+00`）で返し、V8 の `new Date` が
  Invalid Date → 時間枠が空表示。
- 原因: tstzrange は今回初導入の型。SQL Editor（service role）でも prosrc でも surface せず、
  実来店フローを実 session で通して初めて出た。
- 修正: parseStay で裸の `±HH` オフセットに `:00` を補って正規化（`+00` → `+00:00`）。
  リテラル置換ではなく、将来 TZ 変更（`+09` 等）でも耐える実装であること。

## 4. 実機シナリオ（全通過・regression 基準）

- 席予約作成 → pill「PERM卓 18:00-20:00」
- 枠重複 → 「枠重複」日本語エラー（RPC 事前検証）
- 隣接 [20,22) → 成功（境界非重複）
- 来店正常 → 予約卓既定で開店
- 来店・予約卓使用中 → 候補除外 → 別卓で開店 → audit に予約卓・実卓の両方残存（確認A）
- 卓なし予約 → 従来動作維持（非干渉）
- 編集・同値保存 → 成功（自分除外）
- 編集・衝突移動 → 枠重複
- 編集・23:00 移動 → pill 23:00-01:00（日跨ぎ表示正）
- 編集・トグル OFF → 卓クリア
- owner タブ可視

## 5. verify

- 段21（21 assert 全緑）: EXCLUDE 実発火(23P01) / cancelled 同枠可 / seat time conflict 事前検証 /
  seat_id null 非干渉 / 隣接枠境界 / stay-checks 独立 / invalid store / 段19 回帰 /
  滞在時間 whitelist / 自分除外。
- f0 全緑 1215（7スイート ALL PASS）。

## 6. 流用元・canonical

- UI 流用元: reservation-panel.tsx（F3a-3）・openMap/loadOpenMap（会計連動）・cast 名解決（塊1-3）。
- canonical mock: nox-nightwork-app-responsive.html
- 対の正本: NOX_F3a-3_予約機能_設計ロック確定版.md

## 7. F4（将来）への含み

- seats PK は単独のまま（EXCLUDE 見直し不要）。
- memberships 部分ユニーク drop + ヘルパー差し替えでマルチ店舗対応する前提が仕込み済み。
