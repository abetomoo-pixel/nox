# NOX 料金ルール一般化 設計書 v1.2（2026-08-05・相談役起草・裁定4点確定・B最終形＝バック正本はcomp_plan）

**正本性**: 本書はモック（nox-rate-settings-redesign.html）＋プリフライト8点戻り＋Agoora 裁定を統合した設計正本。実装は本書ロック後。repo/live と食い違えば live が正（プリフライト実測 2026-08-05 基準）。

---

## 0. 前提（確定済み裁定・再掲）

- 軸フル装備＝fee_kind × 席種 × 曜日 × 時間帯、指名系のみ＋キャストランク
- 凍結＝**伝票オープン時刻で全料率確定**（延長も開栓時レート固定）。例外はランク軸のみ＝指名行追加時のキャストランクで解決（軸の性質であり凍結原則の例外ではない）
- 曜日・時間帯判定は**営業日基準**（biz_cutoff_hm・金曜25時=金曜）
- 優先順位＝**明示 priority 数値**（推論型不採用）
- 席種＝seats.kind 既存3値を参照（**kind null は '卓' 扱い**）
- ランク＝**casts.rank_id 新設**（casts.kind は流用しない＝在籍区分と混在するため。kind には comment on column で意味を確定させる）
- カードTAX＝伝票経路外（日報レイヤ）を**変えない**。プレビューは概算表示＋注記
- 指名料3値（hon/jonai/dohan）は現状**保存のみで未課金**＝課金経路の新設
- モック修正3点＝指名料ランク別テーブル化／席種列追加／判定時刻設定 UI 撤去→凍結注記

## 1. データモデル

### 1-1. cast_ranks（新設・店スコープ）
```
id uuid pk / org_id uuid NN / store_id uuid NN
name text NN（trim 1..40）/ sort_order int NN default 0
is_active boolean NN default true / created_at / updated_at
unique (store_id, lower(name))    -- product_categories 同型
```
- casts に `rank_id uuid null references cast_ranks(id)` を追加（NULL=ランクなし）
- ランク別指名料は pricing_rules の rank_id 参照で表現（単価をランク行に持たせない＝軸を pricing_rules 一本に寄せる）

### 1-2. pricing_rules（新設・店スコープ）
```
id uuid pk / org_id uuid NN / store_id uuid NN
fee_kind text NN check in ('set','extension','dohan','hon_shimei','jonai_shimei')
seat_kind text null check in ('卓','カウンター','VIP')   -- null=全席種
dow_mask int null check (between 1 and 127)              -- null=全曜日。bit0=月..bit6=日。
                                                         --   0（曜日ゼロ選択）は禁止
time_from_min smallint null / time_to_min smallint null  -- null=終日。時計分 0..1439
rank_id uuid null references cast_ranks(id)              -- 指名系のみ。他は CHECK で null 強制
amount int NN check >= 0
duration_min smallint null check (is null or >= 1)       -- set/extension のみ意味を持つ
priority int NN default 100                              -- 小さいほど優先
is_active boolean NN default true / created_at / updated_at
check (fee_kind in ('hon_shimei','jonai_shimei') or rank_id is null)
```
★v1.2: back_rate は撤回（指名バックの正本は comp_plan＝報酬側の一本。二重計上の構造的排除）。
料金レーンは料金額のみを扱う。率バック（指名料額×%）はキャスト・報酬群分割レーンで
comp_plan に方式切替（円/本｜率・hon/jonai 別・排他＝併用なし）として実装する。
- **時間帯は時計分で保存し解決時に営業日拡張**（cutoff 変更でデータが腐らない）：`ext(x) = x < cutoff_min ? x+1440 : x`。適用は半開区間 `[ext(from), ext(to))`。cutoff を跨ぐ帯は UI で禁止
- **重複は DB で許容**＝priority が解決する（モックの「重複禁止」文言は撤回。裁定(2) 明示 priority の帰結。UI は同一条件重複を警告表示のみ）
- ワイルドカード（null）に特異性加点は**しない**＝priority のみが順位（推論不採用の裁定どおり。UI で並べて見せる）
- ★端点仕様（CC 机上トレース 2026-08-05 済み）：from に `<`・to に `<=` の非対称拡張で
  [cutoff, cutoff+1440) を完全被覆（隙間0・重複0）。**from=to=cutoff（例 06:00→06:00）は
  「丸一日」の帯として合法に通る**（半開区間の帰結）。他の from=to は空帯として拒否。
  UI は cutoff 同値入力時に「終日の帯になります」を警告表示すること

### 1-3. 既存テーブルへの追加列
```
checks.dohan_fee int null            -- 開栓時に解決した同伴単価スナップ
check_lines.fee_kind text null check in (5値)   -- 分析・日報区分用。既存行は null のまま
check_lines.cast_id uuid null references casts(id)
   -- ★v1.2: 指名行の対象キャスト凍結。将来の率バック（Σ指名行額×率 group by cast_id）を
   --   過去分まで遡って計算可能にする布石。既存行・商品行は null のまま
```
- check_lines.kind の 8値 CHECK は**触らない**（golden 保護）。指名/同伴行は kind='charge'＋fee_kind で区別

## 2. 解決規則（pricing_resolve）

```
pricing_resolve(p_store_id uuid, p_at timestamptz, p_fee_kind text,
                p_seat_kind text default null, p_rank_id uuid default null)
returns table(amount int, duration_min smallint, rule_id uuid)   -- 0行=基本料金へ
stable / security definer / search_path=public
```
- 認可：owner ∨ manager 自店（プレビューUI からも直接呼ぶため grant authenticated・ガードは RPC 内）
- 手順：
  1. 営業日ヘルパー `biz_minutes_of(p_store_id, p_at)` → (biz_dow, biz_min)。cutoff は `settings_json->>'biz_cutoff_hm'` の既存イディオムを**ヘルパー内に1回だけ**再掲（既存7箇所のインライン展開は触らない＝負債として台帳記録）
  2. 席種は `coalesce(p_seat_kind, '卓')`
  3. 一致行を `priority asc, created_at asc, id asc` で1行：
     `is_active and fee_kind=… and (seat_kind is null or seat_kind=…) and (rank_id is null or rank_id=…) and (dow_mask is null or (dow_mask>>biz_dow)&1=1) and (時間帯 null or biz_min ∈ [ext(from),ext(to)))`
  4. 0行＝**基本料金フォールバック**：set/extension → stores.set_fee/set_min/ext_fee/ext_min、dohan/hon/jonai → stores.dohan_fee/hon_fee/jonai_fee（フォールバックの適用は呼び出し側＝RPC は 0行を返すだけ。既存の stores 列と「基本料金」UI がそのまま生きる）

## 3. 凍結と結線

### 3-1. check_open（live 起点改稿）
- seat の kind を引き、open 時刻で set/extension/dohan を解決 → **既存スナップ列にそのまま格納**（set_fee/set_min/ext_fee/ext_min。duration_min null は stores 値）＋新列 dohan_fee
- ルール0件のテナントでは現行と**完全同値**（フォールバック＝stores 列）＝既存挙動不変・golden 不変の構造保証
- ★check_time_charge_apply は**無改稿**（checks スナップだけを見る既存設計のまま自動/手動とも新料率が効く）。席移動しても料率は開栓時のまま（凍結裁定どおり）

### 3-2. 指名・同伴の課金経路（新設 RPC）
```
check_shimei_add(p_check_id, p_cast_id, p_shimei_kind 'hon'|'jonai')
  → cast の現在 rank_id ＋ checks.started_at（開栓時刻）＋卓の席種で解決
  → check_lines INSERT: kind='charge', fee_kind='hon_shimei'|'jonai_shimei',
    name_snapshot='本指名料（源氏名）'等, unit_price_snapshot=amount, qty=1
check_dohan_add(p_check_id, p_count int default 1)
  → checks.dohan_fee（スナップ）× p_count を kind='charge', fee_kind='dohan' で1行
```
- 共通ガード：null guard・owner∨manager自店（＋kiosk 経路は既存 kiosk RPC の型に従い別途）・payments 存在で拒否（check_time_charge_apply 同型）・audit あり
- ★v1.2（B の最終形）：check_shimei_add は指名行に **cast_id と fee_kind を凍結するのみ**。
  back_snapshot は作らない（非商品行の既存規約 v_back := null と同じ）＝
  check_close の按分ループ（money-core・golden 54400）・check_cast_backs・collect.ts は
  **一切触らない**。指名バックの計算は従来どおり comp_plan × 指名本数（payOf 既存経路）。
  率バック（指名料額×%）は報酬レーンで comp_plan に方式切替として実装し、
  その時点で「Σ(指名行 line_total × 率) group by cast_id」が本レーンの凍結データで
  過去分まで計算可能になる。二重計上は方式切替の排他（円/本｜率・併用なし）で防ぐ

## 4. RPC 一覧（新設）

| RPC | 型 |
|---|---|
| pricing_resolve | §2 |
| biz_minutes_of | ヘルパー（pricing 専用・内部） |
| set_pricing_rule(p_id null=新規, 全属性) | set_product 同型 upsert・検証は §1-2 CHECK と同値を RPC でも |
| delete_pricing_rule(p_id) | 物理削除可（伝票は額スナップ済み・ルール行に履歴責務なし） |
| pricing_rule_reorder(p_store_id, p_fee_kind, p_ids[]) | 0077/0081 同型・**(store, fee_kind) スコープ**で priority を 1..N 再採番 |
| set_cast_rank(p_id null=新規, name, is_active) / cast_rank_reorder | product_categories 系と同型 |
| set_cast_rank_of(p_cast_id, p_rank_id null 可) | casts.rank_id 更新・audit |

## 5. RLS・grants

- pricing_rules / cast_ranks：select は owner∨manager（自店）。**cast/staff には見せない**（料率＝経営情報）
- 書込は RPC 専任。grants は**規範形＝`revoke all on table … from public, anon, authenticated` → `grant select to authenticated` のみ戻す**（_r2 改訂。名指し revoke では TRUNCATE/REFERENCES/TRIGGER が残存し、★TRUNCATE は RLS 非適用＝全消し可能。0002 検証(4) 規約・既存テーブル実測 ACL と同型）
- 全 RPC：revoke from public, anon → grant to authenticated（ガードは RPC 内）

## 6. migration 分割と手貼り順

| # | 内容 | 冪等性 | live 起点 |
|---|---|---|---|
| 0083 | cast_ranks＋casts.rank_id＋pricing_rules＋RLS/grants＋biz_minutes_of＋pricing_resolve＋CRUD/reorder RPC 群＋casts.kind への comment | ★非冪等（create table＋add column） | 不要（全て新設） |
| 0084 | checks.dohan_fee＋check_lines.fee_kind＋check_open 改稿＋check_shimei_add＋check_dohan_add | ★非冪等（add column）＋check_open は live 全文起点 | ★要：CC が check_open live 全文を**ファイル供出**（貼付不可・0082 の転写劣化教訓） |
| app | UI（§7） | — | — |

手順は各 mig とも通常どおり：プリフライト→本文貼付1回→Downloads→検証バンドル→CC 収蔵→runtime 段→client。

## 7. UI（モック準拠＋修正3点＋IA 完成）

- `/master/pricing` 実ページ化・3タブ＝**時間帯料金**（pricing_rules エディタ：帯行に席種列・適用日チップ・priority ∧∨〔D&D は後日共用部品〕・帯モーダルはモックの形から判定時刻項目を撤去し「料率は伝票オープン時に確定します」注記）／**基本料金**（既存 pricing-panel＋time-pricing-panel を移設＝フォールバック値の編集）／**会計ルール**（time_mode・time_per・丸め・サービス料・カードTAX・営業日区切り）
- **指名料金**＝ランク別テーブル（行=ランク×hon/jonai。実体は pricing_rules の rank_id 行）＋ランクマスタ編集（キャスト・報酬群と導線相互リンク）
- **料金プレビュー**＝pricing_resolve を直接呼ぶシミュレータ（モックどおり。カードTAX は「日報集計用・伝票請求額には含まれません」注記）
- マスタ概要カードの遷移先重複（改善6）はこの実ページ化で解消。master-board の view は残り4つに

## 8. 検証・golden

- **golden 不変が最重要**：pay 83 / receipt 52 / rls 472(54400) / labor-forecast。check_open 改稿の回帰段＝「ルール0件の店で改稿前後のスナップ8値＋dohan_fee(null 起点)が完全一致」を明示 assert
- 新スイート verify:nox-pricing：解決マトリクス（席種×曜日×時間帯×ランク×priority×ワイルドカード×フォールバック×cutoff 跨ぎ端点）／営業日拡張（25時=前営業日曜日）／CRUD 認可／reorder 両方向検証／anon・grants
- 指名/同伴 RPC：rank 変更後の指名行が新ランク額・既存行不変／payments 後拒否／fee_kind 格納

## 9. 裁定（2026-08-05 Agoora・全4点確定）

- **A. 確定＝祝日・特定日軸は初回外**：曜日のみで launch。祝日/イベントは post-launch「特別日」機能へ
- **B. 確定（v1.2 最終）＝指名バックの正本は comp_plan 一本・料金レーンは料金額のみ**：
  hon/jonai の有無・額の差は既存 comp_plan（円/本・キャスト別）で充足済み。
  「指名料額に率で連動」は報酬レーン（キャスト・報酬群分割）で comp_plan に
  方式切替（円/本｜率・hon/jonai 別・排他）として実装。料金レーンは 0084 で
  check_lines.cast_id を凍結し、率バック導入時に過去分まで遡及計算可能な形だけ確保。
  money-core（check_close 按分・golden 54400）は料金レーンで一切触らない
- **C. 確定＝同伴は単価×人数**（check_dohan_add(p_count)）
- **D. 確定＝帯の重複は DB 許容・priority 解決**（モックの「重複禁止」文言撤回）

## 10. スコープ外（post-launch 記録）

祝日/特定日軸（A）・指名料の率バック＝comp_plan 方式切替（報酬レーン管轄）・D&D 並べ替え共用部品・営業日イディオム7箇所のヘルパー集約（負債）・固定額バック 'flat'（既存メモどおり料金レーンと同時判断→今回は見送り可）

---

## 11. live 差分（2026-08-27 実測）

本書ロック（2026-08-05）以降の実装で、**本書の記述と live が食い違っている点**（★live が正＝冒頭「正本性」の規約どおり）。

1. **`pricing_resolve` は2本**＝**公開ラッパ `pricing_resolve`（org 照合・ロール判定あり）**と
   **内部 `pricing_resolve_core`（認可なし・呼び出し元の公開 RPC が二重防御を済ませている前提）**。
   §2／§4 は1本前提で書かれている。`check_shimei_add` が呼ぶのは `_core` の側。
2. **`set_cast_rank` は4引数**＝`(p_id, p_store_id, p_name, p_is_active)`。§4 の3引数表記は古い。
3. **会計ルールタブは読み取り専用ミラー＋「基本料金タブで編集」導線**（DP-R 裁定A）。
   §7 は編集タブ前提だったが、サービス料・カードTAX・丸めは `set_store_pricing` の、
   自動延長は `set_store_time_pricing` の引数で、**1本の atomic な upsert が2タブに割れる**ため
   読み取り専用に変更済み。**列が無い項目（内税/外税・税計算前の値引き・締め後修正権限・
   監査ログ保存期間）は器のみ disabled＋「準備中」**。
4. **`check_shimei_add` の `name_snapshot` は `'本指名料'` / `'場内指名料'` 固定＝源氏名を含まない**
   （§3-2 の「`'本指名料（源氏名）'等`」は不採用。audit と同じ「PII を載せない」流儀）。

★ ランク別指名料の**加算/絶対額**は**裁定79 で絶対額に確定**（モックの「基本の指名料金に加算する」は不採用）。
★ 既定（`rank_id` null）行の `priority` は**裁定80 で 200 固定**（ランク行は 100）。
