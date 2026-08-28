# C1/C2 事前調査 — comp_plans 現行と payroll golden・R-2b との接点

読み取り専用調査（2026-08-28）。**設計・実装・migration 起草はしない**。dev DB = mig0001〜0110。

## 結論（3行）

1. **comp_plans 17列は「per_count（円/本）と rate（率）の二本立て」まで既に到達済み**
   （`hon_back_mode`/`hon_back_rate`/`jonai_back_mode`/`jonai_back_rate`＝D3 率バック方式切替・mig0086）。
   C1/C2（報酬モデル v2）は**ゼロからの新設ではなく、この二本立ての上への拡張**になる。
2. **golden 張り替えの当たりは `loadMasters`（`collect.ts:74`）の select 12項目**。
   ここに列を足す＝`CompPlan` 型 →`pay.ts` の分岐 →玲奈 golden 5931/125802 の順に波及する。
   **`dohan_back` は現状「円/本のみ」（裁定i）で mode/rate を持たない**＝v2 で最初に非対称が出る箇所。
3. **R-2b との共有点は `dohan_back` の分母**。裁定74 が「同伴料は cast_id 必須へ」と決めており、
   現状 `check_dohan_add(uuid,integer)` は cast_id を取らない。**同伴バックの計算可能性が R-2b に依存**
   するため、**C1/C2 で dohan 系を触ると R-2b と衝突する**。

## D1. comp_plans 現行スキーマ・参照 RPC・golden 接点（実測）

### `comp_plans`（17列）

| 群 | 列 |
|---|---|
| 識別 | `id, org_id, store_id, name, is_active, created_at, updated_at` |
| 定額 | `base` |
| バック（円/本） | `hon_back, jonai_back, dohan_back` |
| バック（方式切替・mig0086） | `hon_back_mode text NOT NULL`, `hon_back_rate int NULL`, `jonai_back_mode text NOT NULL`, `jonai_back_rate int NULL` |
| スライド | `sales_slide jsonb`, `point_slide jsonb` |

★**`dohan_back` にだけ `_mode`/`_rate` が無い**（hon/jonai は対で持つ）＝**現行の非対称**。

### 関連テーブル

- `cast_plan`（7列）… `cast_id / org_id / store_id / plan_id / overrides_json jsonb / created_at / updated_at`
  → **期間列を持たない上書き型**（起票#26 が指摘済み・遡及計算に効く）
- `cast_norms`（11列）… `period, days_target, dohan_target, sales_target bigint, shimei_target`（C2 ノルマ側）

### 参照 RPC（`prosrc` 実測・2本だけ）

```
set_comp_plan(uuid,uuid,text,int,int,int,int,jsonb,jsonb,bool,text,int,text,int)   -- 14引数
set_cast_plan(uuid,uuid,jsonb)
```
→ **comp_plans を書くのはこの2本のみ**。読み手は RPC ではなく **`collect.ts` の直読**。

### payroll golden への接点（張り替え対象の当たり）

| 段 | 場所 | 内容 |
|---|---|---|
| 1 | `lib/nox/payroll/collect.ts:74` | `comp_plans` を **12項目 select** して読む（RPC 非経由＝裁定75 が「店舗側にバック列を二重化しない」根拠にした箇所） |
| 2 | `collect.ts:90-100` | DB 行 → `CompPlan` 型へ写す（`base/honBack/jonaiBack/dohanBack/salesSlide/pointSlide/honBackMode/honBackRate/jonaiBackMode/jonaiBackRate`）。`?? "per_count"` / `?? null` の**既定値がここにある** |
| 3 | `lib/nox/pay.ts:438` | 「per_count 側の式は従来と1バイト不変（玲奈 golden 5170/5931 の経路）。**dohan は円/本のみ（裁定i）**」 |
| 4 | golden の係留 | `verify-nox-pay.ts:170`（T1b 5931）／`verify-nox-rate-back.ts:122-123`（5931・125802）／`verify-nox-labor-forecast.ts:194`（55233＝**別系統・payOf 非接触**） |

→ **張り替えが起きるのは 5931 / 125802 の2値**。**55233 は労務予測の別系統で無関係**（誤って巻き込まない）。

## D2. R-2b との共有点（裁定74/75 と突合）

| 論点 | 裁定74/75 の決め | C1/C2 側から見た制約 |
|---|---|---|
| **同伴の帰属（cast_id）** | 「**同伴料は cast_id 必須へ**（現状 `check_dohan_add` は cast_id=null＝同伴バックが計算不能）」 | **`dohan_back` に mode/rate を足しても、帰属が無ければ率の分母が作れない**。C1/C2 で dohan を率化するなら **R-2b が先**か、少なくとも同時裁定が要る |
| **請求とバックの器** | 裁定75＝**請求＝`stores.hon_fee/jonai_fee/dohan_fee` ＋ `pricing_rules` / バック＝`comp_plans` ＋ `cast_plan.overrides_json`**。店舗側にバック列を二重化しない | C1/C2 の追加列は**必ず `comp_plans` 側**に置く。`stores` へ逃がすと裁定75 違反 |
| **同伴と指名の同時成立** | 裁定74＝「別軸・同一キャストに同時成立を許す（同伴かつ本指名）」 | 同時成立を許すと**同一キャストに hon_back と dohan_back が同時に立つ**。v2 の合成規則（加算か択一か）が未裁定 |
| **キャスト別種別** | 裁定74＝`check_nominations` に**キャスト別種別列を追加**し、`check_close` の分配を「卓から1回引く」→「**キャストごとに積む**」へ | `cast_sales_aggregate` が帰属の実体（教訓41）。**C1/C2 の率バックの分母はこの集計**なので、R-2b の改修は分母の定義変更に等しい |
| **`stores` の新設列** | 裁定75＝**「同伴時の本指名自動付与」1本のみ**・実列 boolean・**列追加は R-2b の mig に同梱** | C1/C2 の mig でこの列を先に入れない（同梱先が決まっている） |

★同伴（dohan）を本文に含む RPC は実測 **26本**（`check_open` / `check_dohan_add` / `check_set_nominations` /
`cast_sales_aggregate` / `daily_report_*` / `reservation_*` ほか）＝**R-2b の影響半径は広い**。

## 開いている前提（本調査では裁定しない）

- **起票#25**（報酬のコンポーネント模型＝ポイント・利益歩合・達成ボーナス・保証判定単位・複合スライド）
  … C1/C2 の本体。`comp_plans` 変更は `collect.ts` 直撃で golden が動く
- **起票#26**（`cast_plan` の期間列＝履歴）… 上書き型のため遡及計算に効く。社労士回答と対
- **裁定82**（NOX は計算「機構」を提供し法適合の判断と責任は店舗に置く）／**裁定83**（`payroll_finalize` の確定の射程）
- **裁定81**（comp_plans の可視範囲＝mig0105）／**裁定79**（ランク別指名料は絶対額）
- **弁護士 L3 待ち**・**A5 送り控除の編入**（v17 §3）
