# C3/C4 事前調査 — 料金項目・会計ルールの現状棚卸し

読み取り専用調査（2026-08-28）。**設計・実装・migration 起草はしない**。dev DB = mig0001〜0110。
教訓40/42 に従い「語の一致」ではなく**中身（列・RPC・画面が動くか）**で仕分ける。

## 結論（3行）

1. **C3/C4 の器はほぼ全部もう建っている**。モック `nox-pricing-settings.html` の
   h1 3本（時間帯料金／基本料金／**会計ルール**）は実装 `pricing-board.tsx` に3タブとして存在し、
   会計ルールタブの h2 4本（営業日・時間計算／税・サービス料／端数・精算／確認・権限）も**4本とも実在**する。
2. 欠けているのは**器ではなく挙動**＝会計ルールタブの一部が `disabled` ＋「準備中」ピル
   （**内税/外税/適用しない の切替**と**端数・精算のスイッチ**）。C3/C4 は「新規に作る」ではなく
   **「準備中を外して意味を与える」レーン**として読むのが正しい。
3. その「意味」を確定できないのは **T4/T5/T6 が未回答**だからで、現状は決め打ち
   （全項目課税・内税固定・サービス料課税）で凍結されている。**器→挙動の解錠キーが T4〜T6**。

## C1. 現状棚卸し（モック ↔ 実装 ↔ DB の対比）

### 区画の対比

| モック `nox-pricing-settings.html` | 実装 `pricing-board.tsx` | 状態 |
|---|---|---|
| h1 時間帯料金 → h2 料金スケジュール／スケジュール編集／料金プレビュー | タブ1: 「通常営業の料金スケジュール」(:642)・「料金プレビュー」(:731) | **動く**（mig0083/0084＋0107 表示名） |
| h1 基本料金 → h2 キャストランク別料金 | タブ2: 「指名料金（ランク別）」(:798) | **動く**（裁定79＝絶対額） |
| h1 会計ルール → h2 営業日・時間計算 | タブ3: (:940) | **一部動く**（`biz_cutoff_hm` は mig0106 で店設定化・判定時刻 UI は凍結注記） |
| 〃 → h2 税・サービス料 | (:982) | ★**準備中**＝内税/外税/適用しない の3ボタンが `disabled`（:1009 付近） |
| 〃 → h2 端数・精算 | (:1021) | ★**準備中**＝切替スイッチが `disabled` |
| 〃 → h2 確認・権限 | (:1056) | 実在（要中身確認） |

※ ヘッダ実装コメント(:3-21) は「モック `nox-rate-settings-redesign.html` 準拠」と書いており、
`pages-2026-08` 版とは別系統のモックを底本にしている。**C3/C4 着手時はどちらが正本かの確認が要る**
（教訓40 の「実測前に設計指示を出した時点で違反」に該当しうる箇所）。

### DB 実測

```sql
select column_name from information_schema.columns where table_name in ('pricing_rules','stores','cast_ranks');
select p.oid::regprocedure from pg_proc p ... where proname like '%pricing%' or like 'set_store%' ...;
select distinct jsonb_object_keys(settings_json) from public.stores;
```

- **`pricing_rules` 16列** — `fee_kind, seat_kind, dow_mask, time_from_min, time_to_min, rank_id, amount, duration_min, priority, is_active, name`
  → **税区分の列は無い**（T4 が問うている「項目ごとに課税/非課税」を持てる器が現状ゼロ）
- **`stores` 21列** — `service_rate, card_tax_rate, round_unit, round_mode, set_min, set_fee, ext_min, ext_fee, time_mode, time_per, hon_fee, jonai_fee, dohan_fee`
  → **税・端数は「店単位の列」としてのみ存在**。内税/外税の別を持つ列は無い（T5 の器も無い）
- **`cast_ranks` 8列** — 税とは無関係
- **`settings_json` に実在するキーは3つだけ** — `biz_cutoff_hm` / `cast_register_enabled` / `okuri_mode`
  → 税・端数は json ではなく**列側**にある＝C4 の変更は列 DDL になる公算が高い
- **料金・会計系 RPC 21本**（`set_store_pricing` 7引数・`set_store_time_pricing` 6引数・
  `pricing_resolve` / `pricing_resolve_core` / `set_pricing_rule` 13引数・`pricing_rule_reorder` ほか）

## C2. C3/C4 に効く裁定・教訓・オープン論点（番号のみ）

- **裁定**: 8 / 9 / 19 / 23 / 23-b / 26 / 29 / 30 / 31 / 36 / 39 / 61 / 68 / 74 / 79
  （とくに **裁定23・23-b＝税務要件の棚卸し**、**裁定79＝ランク別指名料は絶対額**、
  **裁定9＝B4 時間料金自動計算の設計裁定8点**）
- **教訓**: 40（語の一致で仕分けない）/ 42（区画の存在≠移植完了）
  ＝本調査そのものが両者の適用事例
- **オープン起票**: 14（`bizToday` の `"06:00"` ハードコード）/ 15（manual 店の時間帯分解）/
  16（時間帯分解の行数閾値）/ 18（`check_remove_line` の time_auto 拒否が UI のみ）/
  23（割引/無料の適用額表示）/ 29（クライアント算出 `biz_date` の素通し3経路）/
  30（`biz_cutoff_hm` イディオムの live 14関数への分散）
- **未裁定**: P-4 の5裁定点（引き継ぎ v14 §5・`pricing_rules` 既実装に照らして消し込み待ち）
- **後続**: P-2（凍結行から時刻で選び直す）/ P-3（刻みごとの料金表）は **C3 の後**（v17 §5）

## C3. 税理士 T4〜T6 ↔ ブロックしている設計点

| 設問 | 現状の決め打ち | ブロックしている設計点（実測に基づく） |
|---|---|---|
| **T4** 料金項目の税区分 | 全項目課税・店単位の税率のみ | `pricing_rules` に**税区分列が無い**（16列実測）。項目別課税にするなら**列追加＋`set_pricing_rule` の署名変更**（現13引数）＋`check_open` の帯解決経路が影響。「TAX込み調整」（非課税の伝票補正）の器も未定 |
| **T5** 内税/外税 | 内税固定 | 会計ルールタブの3ボタンが `disabled`＝**UI の器だけ在って挙動が無い**。`stores` に内税/外税の別を持つ列が無い。端数処理の**位置**（税計算の前か後か）が決まらないと `money.ts` の `roundYen` 呼び出し位置を確定できず、**値引きを税計算前に適用してよいか**が `receipt.ts` と `check_close` の両方に効く |
| **T6** サービス料・カード手数料 | サービス料＝課税・カード手数料＝日報集計のみ | `stores.service_rate` / `card_tax_rate` は**列としては既存**。課税区分が決まらないと日報の `card_gross` / `card_tax_rate` 凍結値（rls F1e の凍結 assert が係留済み）との関係を動かせない。客への転嫁を認めるなら**伝票行としての表現**が要り `check_lines` に及ぶ |

★共通の性質: **T4 は「列を増やす」= DB 変更を伴う／T5・T6 は「既存の列と器に意味を与える」**。
着手順を分けられる可能性があるが、**本調査では裁定しない**。

## 注記

- 本ファイルは調査結果のみ。設計・実装・migration の起草は含まない。
- 収載先は `docs/dp/`（`docs/tmp` は untracked scratch 専用＝0f0c355 の方針）。
