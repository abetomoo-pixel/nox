# SD0 サーベイ（シフト深部レーン・読み取り専用・2026-08-21）

**新レーン: シフト深部**（承認4段・計画ライフサイクル・自動配置）。**DB 設計を含む＝Fable 5 域**
（新テーブル・status 拡張・RLS）。本サーベイは **CC の読み取り専用**＝実装・commit・DB 変更なし。

設計入力 = lane memory の5点 ＋ `docs/tmp/dp3_structure_survey.md` 末尾の申し送り。
S1/S2 は **live DB からの逐語採取**（記憶からの復元をしていない）。貼り先証明を先頭で取得済み
（`select 'nox-project-proof', count(*) from public.orgs` → **orgs=3**）。

---

## ★冒頭に申告：DP3 の前提が1件、実測と食い違っていました

**`shifts.wish_id` は live に既に存在し、`shift_wish_decide` の accept 経路が既に書いています。**

```
-- live: public.shifts の列（実測）
wish_id | uuid | null=YES | default=-
-- live: 制約
shifts_wish_id_fkey: FOREIGN KEY (wish_id) REFERENCES shift_wishes(id)
-- live: index
CREATE UNIQUE INDEX shifts_wish_id_uidx ON public.shifts USING btree (wish_id) WHERE (wish_id IS NOT NULL)
```

```sql
-- live: shift_wish_decide の prosrc（accept 経路・逐語）
  -- 【0008 決定2】accept はシフト案（planned）へ自動取り込み。二重生成は部分ユニークで物理防止。
  if p_accept then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, wish_id, created_by)
    values (v_wish.org_id, v_wish.store_id, v_wish.cast_id, v_wish.date, v_wish.start_hm, v_wish.end_hm,
            'planned', p_wish_id, v_actor)
    returning id into v_shift;
  end if;
```

**影響**:

- **DP3-S S1-2 #27 の分類（「元の希望との対比」＝ d）は誤り**でした。私は `shift-board.tsx` の
  TypeScript 型 `Shift`（`wish_id` を select していない）から推定し、**DB を見ていませんでした**。
- **DP3-③ の裁定（対比は入れない）は誤った前提の上で下されています**。
  実体は **b（表示のみ・既存データで成立）**＝`shifts` の select に `wish_id` を足し、
  `shift_wishes` の該当行（`start_hm`/`end_hm`）を引くだけで「希望 20:00〜01:00 → 確定 21:00〜01:00」が描けます。
- **lane memory / 申し送りの「1. `wish_id` 保持要件」は不要**＝**前提は既に満たされています**
  （`shifts.wish_id` の追加 mig は要りません）。
- `shift_set` の update 経路は **`wish_id` を触りません**（`set date=, start_hm=, end_hm=, status=` のみ）＝
  DP3 P2 で入れた「勤務時間の調整」を通しても**希望との紐は保たれます**。

→ **要裁定**: 対比表示を **(a) シフト深部レーンで拾う**／**(b) DP3 の追補として先に入れる**（b 相当・小）／
**(c) 入れない（DP3-③ を維持）**。

---

## S1) 現行スキーマの逐語採取（live DB 底本）

### S1-1. `public.shifts`

| 列 | 型 | null | default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| org_id | uuid | NO | - |
| store_id | uuid | NO | - |
| cast_id | uuid | NO | - |
| date | date | NO | - |
| start_hm | text | NO | - |
| end_hm | text | NO | - |
| **status** | text | NO | `'planned'::text` |
| **wish_id** | uuid | **YES** | - |
| created_by | uuid | NO | - |
| created_at | timestamptz | NO | `now()` |
| updated_at | timestamptz | NO | `now()` |

**制約（逐語）**

```
shifts_start_hm_check: CHECK ((start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text))
shifts_end_hm_check:   CHECK ((end_hm ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'::text))
shifts_status_check:   CHECK ((status = ANY (ARRAY['planned'::text, 'confirmed'::text])))
shifts_cast_id_fkey:    FOREIGN KEY (cast_id)    REFERENCES casts(id)
shifts_created_by_fkey: FOREIGN KEY (created_by) REFERENCES users(id)
shifts_org_id_fkey:     FOREIGN KEY (org_id)     REFERENCES orgs(id)
shifts_store_id_fkey:   FOREIGN KEY (store_id)   REFERENCES stores(id)
shifts_wish_id_fkey:    FOREIGN KEY (wish_id)    REFERENCES shift_wishes(id)
shifts_pkey:            PRIMARY KEY (id)
```

**index（逐語）**

```
CREATE INDEX        shifts_cast_date_idx  ON public.shifts USING btree (cast_id, date)
CREATE INDEX        shifts_org_idx        ON public.shifts USING btree (org_id)
CREATE INDEX        shifts_store_date_idx ON public.shifts USING btree (store_id, date)
CREATE UNIQUE INDEX shifts_pkey           ON public.shifts USING btree (id)
CREATE UNIQUE INDEX shifts_wish_id_uidx   ON public.shifts USING btree (wish_id) WHERE (wish_id IS NOT NULL)
```

**RLS（`relrowsecurity = true`・SELECT 1本のみ・書込ポリシー無し＝規約どおり）**

```
shifts_select [cmd=r]
USING ((org_id = auth_org_id())
       AND ((auth_role() = 'owner') OR (store_id = auth_store_id()))
       AND ((auth_role() <> 'cast') OR (cast_id = auth_cast_id())))
```

**grant**: `authenticated: SELECT` のみ（＋postgres / service_role のフル）＝**書込は RPC 経由のみ**。

### S1-2. `public.shift_wishes`

| 列 | 型 | null | default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| org_id / store_id / cast_id | uuid | NO | - |
| date | date | NO | - |
| start_hm / end_hm | text | NO | - |
| **status** | text | NO | `'pending'::text` |
| decided_by | uuid | YES | - |
| decided_at | timestamptz | YES | - |
| created_at / updated_at | timestamptz | NO | `now()` |

```
shift_wishes_status_check: CHECK ((status = ANY (ARRAY['pending','accepted','rejected','withdrawn'])))
shift_wishes_start_hm_check / _end_hm_check: shifts と同じ正規表現
FK: cast_id→casts / decided_by→users / org_id→orgs / store_id→stores
index: cast_date_idx (cast_id,date) / org_idx / store_date_idx (store_id,date) / pkey
RLS: shift_wishes_select [r] — shifts と同一の3条件（org＋store／owner 例外＋cast は自分のみ）
grant: authenticated: SELECT のみ
```

★**`shift_wishes` に「希望の強さ（pref）」の概念は無い**（BANZEN の `shift_requests` は
`preferred/available/unavailable` の3値を持つ＝流用マップ §7 DB 節）。NOX は「提出＝出たい日」のみ。

### S1-3. `public.staffing_needs`

| 列 | 型 | null | default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| org_id / store_id | uuid | NO | - |
| dow | smallint | NO | - |
| required | integer | NO | `0` |
| **from_min** | integer | NO | `0` |
| **to_min** | integer | NO | `1440` |
| created_at / updated_at | timestamptz | NO | `now()` |

```
staffing_needs_band_chk:      CHECK (((from_min >= 0) AND (from_min < to_min) AND (to_min <= 1440)))
staffing_needs_dow_check:     CHECK (((dow >= 0) AND (dow <= 6)))
staffing_needs_required_check:CHECK ((required >= 0))
staffing_needs_store_dow_from_key: UNIQUE (store_id, dow, from_min)
RLS: staffing_needs_select [r]
  USING ((org_id = auth_org_id()) AND ((auth_role()='owner') OR (store_id = auth_store_id()))
         AND (auth_role() <> 'cast'))     ← ★cast は0行（他2表と違い自分の行も見えない）
grant: authenticated: SELECT のみ
```

★**ポジション次元（キャスト／黒服）は無い**。`required` は1本＝モックの「キャスト必要数・黒服必要数」の
2列には対応していない（S4 で候補を出す）。

### S1-4. ★`shifts.status` の値域と**書き込み経路の全数**（live prosrc の実測）

**値域（逐語）**: `CHECK (status = ANY (ARRAY['planned','confirmed']))` ／ default `'planned'`

| # | 書き手 | 書く status | 経路 |
|---|---|---|---|
| 1 | **`shift_set`**（insert 経路・`p_id is null`） | `p_status`（**`'planned'` or `'confirmed'`**・RPC 冒頭で `not in ('planned','confirmed')` を弾く） | 画面の「手動でシフトを追加」 |
| 2 | **`shift_set`**（update 経路・`p_id` あり） | `p_status`（同上） | 「確定にする」／DP3 P2 の「時間を調整」（**現在値を据え置いて再送**） |
| 3 | **`shift_wish_decide`**（accept のみ） | **`'planned'` 固定**（リテラル） | 希望の採用＝`wish_id` つきで insert |

→ **`shifts` に書く経路は RPC 2本だけ**（`shift_set` / `shift_wish_decide`）。
`authenticated` に `INSERT/UPDATE/DELETE` の grant は無く、RLS も SELECT 1本＝**直書き経路は存在しない**。
**status 拡張の改修対象は、この2本の RPC と CHECK 制約のみ**。

★`shift_set` の update は `set date=, start_hm=, end_hm=, status=` の4列のみ＝
**`wish_id` / `created_by` / `org_id` / `store_id` / `cast_id` は不変**。

---

## S2) 関連 RPC の底本採取（live prosrc・要点の逐語）

全5本に共通する骨格（規約どおり）: `auth_org_id() is null → forbidden` の冒頭 null guard →
（書込系は）`billing_writable_of(auth_org_id()) → 'billing locked'` →
引数検証 → **対象行の org 照合** → **ロール照合**（`owner` ∨ `manager` かつ自店） →
本体 → **`audit_log_write` を必ず呼ぶ**。

| RPC | 引数 | 権限 | 特記（逐語の要点） |
|---|---|---|---|
| `shift_wish_decide` | `(p_wish_id uuid, p_accept boolean)` | owner ∨ manager 自店 | `if v_wish.status <> 'pending' then raise 'already decided'`／**accept のみ**定休日ハード拒否（`shift_is_closed_day`）／accept で **`wish_id` つき insert（status `'planned'` 固定）**／戻り値は生成 shift id（**reject 時は null**）／audit の after に `generated_shift_id` を入れる |
| `shift_set` | `(p_id, p_cast_id, p_date, p_start_hm, p_end_hm, p_status)` | owner ∨ manager 自店 | `p_status not in ('planned','confirmed') → 'bad status'`／`not v_cast.is_active → 'inactive cast'`／**create/update 共通で定休日ハード拒否**（ロール照合の後＝他店曜日の probing 防止）／update は `not found` を raise |
| `attendance_set` | `(p_cast_id, p_date, p_status, p_eta, p_reason)` | owner ∨ **manager/staff** 自店（台帳 #24＝黒服に開放） | `status in ('shukkin','dohan','late','off','absent')`／`on conflict (cast_id,date) do update`／`source='staff'` 固定 |
| `set_staffing_need` | `(p_store_id, p_dow, p_required, p_from_min, p_to_min)` | owner ∨ manager 自店 | `bad band`（0..1440・from<to）／**バンド重複ガード**＝`from_min <> p_from_min` かつ期間交差で `'overlap'`（充足分母の二重計上防止）／同 `from_min` は upsert 置換 |
| `staffing_need_remove` | `(p_store_id, p_dow, p_from_min)` | owner ∨ manager 自店 | `not found` を raise ／ audit の after は null |

**S2 の要点（wish→shift の対応）**: 上の `shift_wish_decide` のとおり、
**`wish_id` を書く場所は既にあり、実際に書いている**。二重生成は
`shifts_wish_id_uidx`（部分ユニーク）で**物理的に防止**されている（0008 決定2）。
`shift_set` は `wish_id` を触らないので、**手動追加は `wish_id = null`／採用由来は非 null** が保たれる。

---

## S3) E8 後送りの正確な記録

**★番号の訂正**: 指示の「shift#6（下書き・公開）/ #7（自動配置）/ #8（計画ビュー）」は、
実測のマトリクス（`docs/tmp/e8_gap_matrix.md` §3-4）と番号が食い違っています。正しくは:

| # | 区画（マトリクス逐語） | 分類/規模 | 裁定（逐語） |
|---|---|---|---|
| **#6** | **承認ワークフロー（4段階・時間調整）** — 「希望→管理者調整→キャスト確認→確定。実装は採用/見送りの二値（status に awaiting 相当が無い）」 | [C] / **L** | **後送り**（T6・**現行2値で回る**） |
| **#7** | **自動配置（たたき台）＋配置ルール** — 「実装に概念なし。★BANZEN に貪欲法の前例あり（流用マップ §7・裁定2 で「AI 最適化は実装しない」は既決）」 | [C] / **L** | **後送り**（独立レーン） |
| **#8** | **シフト計画の下書き／公開ライフサイクル** — 「計画期間・希望締切・下書き保存・公開。実装の shift_set は1件ずつの planned/confirmed のみ」 | [C] / **L** | **後送り**（T6） |
| （#9） | スタッフ別マトリクス表示 | [A] / M | **採用（E8-4）＝実装済み**（`/shift` 確定シフトタブ） |

**裁定書（`docs/NOX_E8裁定_v1.md` §2「後送り」）の逐語**:

> **T6 状態機械**（shift#6 承認4段・shift#8 計画ライフサイクル）: L 級・現行2値で回る

> shift#7 自動配置（BANZEN 貪欲法流用は独立レーン）

**当時の後送り理由と前提の整理**:

1. **#6/#8 は「T6 状態機械」として一括で後送り**＝理由は **L 級**であることと
   **「現行2値で回る」**（＝業務が止まっていない）。**技術的な不能ではなく優先度の判断**。
2. **#7 は「独立レーン」**＝T6 とは別枠。前提として **BANZEN に貪欲法の前例がある**ことと、
   **裁定2（AI 最適化は実装しない）が既決**であることが並記されている。
   → **DP3-④（2026-08-21）で裁定2 の射程が「学習型のみ」と明確化**され、
   **規則ベース（貪欲法）は対象外＝移植可**になった。よって #7 のブロッカーは
   **裁定2 ではなく「配置ルールを保持する列/テーブルが無いこと」**に確定。
3. **E8-5 のスキップ記録**（`docs/tmp/e8_5_skipped.md`）にも同型の記述があり、
   `席#5` の並べ替えを「専用 RPC が無く、2連続呼びは非原子」で見送った判断と同じ流儀
   （**原子性が保てない操作は RPC を作ってから**）。自動配置の一括反映も同じ論点を持つ。

---

## S4) モック「シフト作成」タブの深部構造（全数列挙＋スキーマ変更候補）

底本 = `mock/pages-2026-08/nox-shift-management.html` の `section.panel#create`
（＋関連ダイアログ `#autoDialog` / `#planShiftDialog` / `#adjustDialog`、および `#pendingPanel` の4段フロー）。
**裁定は相談役**＝ここは候補の提示のみ。

### S4-1. 計画バー（`.planbar`）

| # | 要素（逐語） | 前提データ | スキーマ変更候補 |
|---|---|---|---|
| 1 | `2026年8月 シフト計画` | 計画の単位（月） | **新テーブル `shift_periods`**（BANZEN 0003 に前例・`period_start`/`period_end`） |
| 2 | `計画期間 8/1〜8/31 ・ 希望締切 8/5 23:59` | 期間＋**希望締切** | 同上（`wish_deadline timestamptz`） |
| 3 | `badge: 下書き編集中` | 計画の状態 | 同上（`status` CHECK＝BANZEN は `collecting→drafting→published`） |
| 4 | `下書き保存`（`#saveDraft`） | 同上 | **新 RPC**（`shift_period_save_draft` 等） |
| 5 | `スタッフに公開して確定`（`#publishPlan`） | 同上＋一括公開 | **新 RPC**（`shift_period_publish`＝期間内 shifts を一括 confirmed 化・**原子性が要る**） |

### S4-2. 警告バナー（`.warnbanner`）

| # | 要素 | 前提データ | 候補 |
|---|---|---|---|
| 6 | `未処理の希望が 3件 あります。先に承認・時間調整すると自動配置へ反映されます。` | `shift_wishes` の `pending` 件数 | **変更不要**（既存データの再形＝**b 相当**） |
| 7 | `希望を処理`（`#goPending`） | タブ遷移のみ | **変更不要**（b） |

### S4-3. 計画 KPI（`.plan-kpi` ×4）

| # | 要素 | 前提データ | 候補 |
|---|---|---|---|
| 8 | `配置済み 132件` | 期間内 shifts 件数 | **変更不要**（b。ただし「期間」の定義は #1 に従属） |
| 9 | `予定勤務時間 486h` | shifts の時間和 | **変更不要**（b・`shift-time` の既存関数で出る） |
| 10 | `予想人件費 ¥849,600` | `forecastDay()` の期間合算 | **変更不要**（**実装済み**＝E8-4 #4 の月次ロールアップ。★money 隣接＝不触が既定） |
| 11 | `人員不足日 12日` | 日別 `assigned < required` | **変更不要**（実装済みの `fillOf` 判定の期間集計） |

### S4-4. 配置を組む（`.planner-grid` 左）

| # | 要素 | 前提データ | 候補 |
|---|---|---|---|
| 12 | `自動配置（たたき台）`（`#openAutoArrange`） | 自動配置 | **新 RPC ＋ 純関数**（S5） |
| 13 | ビュー切替 `月カレンダー` / `スタッフ別`（`.seg`） | — | **変更不要**（**両方とも実装済み**＝カレンダータブとスタッフ別マトリクス。統合するかは IA 判断） |
| 14 | `select#planPosition`（全ポジション／キャスト／黒服） | **ポジション次元** | **`staffing_needs` に position 列＋UNIQUE 再設計**、または**別テーブル**。★NOX の `shifts` は `cast_id` FK ＝**黒服のシフトを持てない**（`casts` 参照）＝**大きい設計判断** |
| 15 | 凡例 `● 自動` / `● 手修正`（`.source`） | **配置の由来** | **`shifts.source` 列**（`'auto'`/`'manual'`・CHECK）＝流用マップ §7 DB 節が「**自動配置を入れるなら「auto のみ一括取消」のため source 列追加が必須**」と明記 |
| 16 | `#planView`（計画ビュー本体） | #13 に従属 | 変更不要 |

### S4-5. 必要人数（`.rule-list`・右上）

| # | 要素 | 前提データ | 候補 |
|---|---|---|---|
| 17 | `基本帯 20:00〜21:00` / `ピーク帯 21:00〜01:00` / `深夜帯 01:00〜02:00` の3行 | 時間帯バンド | **変更不要**（**実装済み**＝`staffing_needs.from_min/to_min`・mig0093/0095）。★ただしモックは**帯に名前**を持つ＝`label` 列は無い（**任意列の候補**） |
| 18 | 各行に **input 2つ**（キャスト必要数・黒服必要数） | **ポジション別 required** | **#14 と同じ**＝`staffing_needs` に position 次元。現行は `required` 1本 |
| 19 | `必要人数を保存`（`#saveRequirements`） | 一括保存 | **変更不要**（既存 `set_staffing_need` の反復。★原子性が要るなら**配列一括 RPC**＝`product_category_reorder`(mig0077) と同型） |

### S4-6. 配置ルール（`.card`・右下）

| # | 要素（逐語） | 前提データ | 候補 |
|---|---|---|---|
| 20 | `連勤上限`（5日／6日／7日） | 制約値 | **新列**（`stores` の設定列 or 新テーブル `shift_rules`） |
| 21 | `優先順位`（`強い希望 → 勤務可 → 公平性` / `公平性 → 強い希望 → 勤務可`） | 並べ替え規則＋**希望の強さ** | **新列**（規則の選択）＋★**`shift_wishes` に pref 3値が無い**（「強い希望」「勤務可」の区別が付かない）＝`shift_wishes.pref` の CHECK 拡張が要る |
| 22 | `手動で調整した配置は、再度自動配置しても保持されます。` | **#15 の source** | `shifts.source` に従属 |

### S4-7. 承認4段（`#pendingPanel` の `.workflow`）

| # | 要素（逐語） | 前提データ | 候補 |
|---|---|---|---|
| 23 | `1 キャスト希望`（`.done`） | `shift_wishes.status='pending'` | **変更不要** |
| 24 | `2 管理者確認・時間調整` | **中間状態** | **`shifts.status` CHECK 拡張**（例 `proposed`）＋遷移 RPC |
| 25 | `3 キャスト確認` | **中間状態＋cast の応答** | 同上（例 `awaiting_cast`）＋**cast セルフ RPC**（規約5＝`auth_cast_id()` 本人チェック）。★`shifts` の書込は現在 owner/manager 限定＝**cast が書ける経路を新設**することになる（**認可設計の変更**） |
| 26 | `4 シフト確定` | `confirmed` | **変更不要** |
| 27 | 一覧列 `希望／提案時間`・`現在の段階` | 希望と提案の**両方**を持つ | ★**`shifts.wish_id` で希望側は引ける（既存）**。「提案時間」は shifts の現在値＝**変更不要** |
| 28 | `勤務時間を調整` ダイアログの `キャスト希望：20:00〜01:00`（`#originalRequest`） | 同上 | ★**変更不要＝既に出せる**（冒頭の申告） |

### S4-8. 自動配置ダイアログ（`#autoDialog`）

| # | 要素（逐語） | 前提データ | 候補 |
|---|---|---|---|
| 29 | `未処理希望があっても実行できますが、処理後の方が希望を正確に反映できます。` | — | 変更不要（文言） |
| 30 | モード3種 `チェック一括` / `優先順` / `試しながら`（`#autoModes`） | 実行モード | **新 RPC の引数**（BANZEN `shift-planner.tsx:158` に3モードの前例） |
| 31 | `配置対象スタッフ`（`#autoStaff`・チェックグリッド） | cast 一覧 | **変更不要**（既存 `casts`） |
| 32 | `自動配置を取り消す`（`#undoAuto`） | **auto のみ一括削除** | **`shifts.source` 必須**（#15）＋**一括削除 RPC**（原子性） |
| 33 | `選んだスタッフで自動配置`（`#runAuto`） | 実行 | **新 RPC ＋ 純関数**（S5） |

### S4-9. スキーマ変更候補の集計（33要素）

| 候補の別 | 件数 | 対象 |
|---|---|---|
| **変更不要**（既存データ・既存機能で成立＝b 相当） | **14** | #6,7,8,9,10,11,13,16,17(帯),19(反復),23,26,27,28 |
| **CHECK 拡張**（`shifts.status`） | **2** | #24, #25 |
| **新列** | **5** | #15 `shifts.source` ／ #20 連勤上限 ／ #21 優先順位＋`shift_wishes.pref` ／ #17 帯 label（任意） ／ #14/#18 の position（下の「新テーブル or 列」と重複計上せず） |
| **新テーブル** | **2** | #1〜#5 の `shift_periods`（計画期間・締切・状態） ／ #14/#18 の position 次元（`staffing_needs` 再設計 or 別表） |
| **新 RPC** | **5** | #4 下書き保存 ／ #5 一括公開 ／ #24/#25 の遷移 ／ #32 auto 一括取消 ／ #33 自動配置実行 |
| **認可設計の変更** | **1** | #25（**cast が `shifts` を書ける経路**＝規約5 の cast セルフ RPC 新設） |
| **純関数の新規** | **1** | #33 の貪欲法（S5） |

★重複を除いた**実質のスキーマ変更点は 4系統**:
**(A) `shifts.status` CHECK 拡張**（＋`source` 列）／**(B) `shift_periods` 新テーブル**／
**(C) position 次元**（`staffing_needs` 再設計＋**`shifts` が黒服を持てない問題**）／
**(D) `shift_wishes.pref`**（希望の強さ）。

---

## S5) BANZEN 貪欲法の移植原資

**★原資はあります。**（「原資なし＝相談役がアルゴリズム仕様を起草する必要あり」には**当たりません**）

`docs/NOX_BANZEN流用マップ.md` §7 に**アルゴリズム仕様が逐語で記録済み**でした。

> `lib/shift-autoassign.ts` | ○ | 貪欲法・説明可能・純関数 DB 非依存（走査=日→帯→職種・候補=希望あり∧未割当・
> ソート=①最低月間時間未達②割当少=公平③目標金額・出力=割当+不足枠+希望過多）。
> **NOX は帯/職種を落とし「日→必要数→候補→公平」へ縮退**

関連する記録（同 §7・逐語）:

> `shift-planner.tsx` | 1211 | ○ | 親。月カレンダー＋確定バー（不足X日/充足Y日/余剰Z日=:768-770）＋
> **自動配置3モード（チェック一括/優先順/1人ずつ仮置き=:158）**＋**一括取消（source='auto' のみ削除=:363）**＋
> 人件費見込み（:286・NOX は payOf sim 接続）。band/position 次元を落として縮退翻訳

> `_components/priority-reorder.tsx` | 144 | ○ | 自動配置モードB の優先順 D&D（@dnd-kit・遅延チャンク）

> `app/api/shift/auto-assign` route | ○ | planner:390 から fetch。**サーバ側で lib を呼ぶ構造**

> `shift_assignments`（band/position/break_min/**source auto\|manual**） | shifts 実装済み | ○ |
> **NOX に source 列なし＝自動配置を入れるなら「auto のみ一括取消」のため source 列追加が必須**

**裁定台帳 裁定2 の本文（逐語）**にも移植方針が既に書かれています:

> モック（canonical）の「AIでシフト最適化」（LLM に割当案 JSON を生成させ反映する機能）は**実装しない**。
> **シフト再実装の自動配置は BANZEN `lib/shift-autoassign.ts`（説明可能な貪欲法・純関数）の縮退翻訳で行う**
> （流用マップ §7）。

→ **裁定2 は最初から「貪欲法での実装」を指示していた**（DP3-④ の射程明確化は、この本文と整合）。

**ただし、原資が「仕様の要約」である点は残る制約**:

- 記録されているのは**走査順・候補条件・ソート鍵・出力**の4点。**タイブレーク・端数・
  「目標金額」の定義**など、実装に必要な細部は BANZEN の実ファイルにしかありません。
- 流用マップの冒頭に **「BANZEN 側は下記全ファイルを現物確認済み（読み取り専用）。翻訳時は必ず実ファイルを開くこと。」**
  と明記されています＝**翻訳着手時に `C:\Users\abet\Dropbox\cloude\makanai-shift` の実ファイルを開く前提**。
- **NOX 縮退版のソート鍵は要裁定**: 原本の「①最低月間時間未達 ②割当少=公平 ③目標金額」のうち、
  **③目標金額は NOX に対応概念があるか未確認**（`comp_plans` の保証・ノルマとの関係）。
  帯/職種を落とす方針は記録済みだが、**③をどう縮退するかは書かれていない**。

---

## S6) 影響半径（status 拡張が波及する範囲）

### S6-1. verify スイート（実測・`shifts`/`shift_wishes`/`staffing_needs`/status 語の出現）

| スイート | shifts系 | staffing | status語 | 見立て |
|---|---|---|---|---|
| `verify-nox-anon-guard`（938） | 32 | 2 | 3 | **要追随**。新 RPC を足すたびに **anon BLOCKED を assert する対象が増える**（規約＝anon/authenticated 両方で BLOCKED） |
| `verify-nox-rls`（472） | 19 | 8 | 4 | **要追随**。status 値が増えると「他店0行・cast 0行」の fixture が新値でも成り立つかを assert する必要 |
| `verify-nox-shift-bands`（24） | 2 | 17 | 1 | **要追随**（position 次元を入れる場合＝**UNIQUE (store_id,dow,from_min) の再設計に直撃**）。status 拡張だけなら影響小 |
| `verify-nox-grants`（283） | 1 | 1 | 0 | **自動回帰**。新テーブルを足すと「public 全体で authenticated=SELECT のみ」のスキーマ全体ガードが**自動で検出**＝`revoke` を忘れると落ちる（＝設計どおりの検出器） |
| `verify-nox-payroll`（133） | 5 | 0 | 2 | **★要注意**。`lib/nox/payroll/collect.ts:246` が **`.eq("status","confirmed")`** で shifts を引いている＝**中間状態を足したとき「給与に乗るのは confirmed だけ」で正しいか**の判断が要る |
| `verify-nox-punch-match`（75） | 6 | 0 | 0 | 影響小（打刻照合は shifts の時間のみ） |
| `verify-nox-labor-forecast`（26） | 0 | 0 | 6 | **影響なし**（純関数・`status` は金額に影響しない旨がコメントで明記＝`labor-forecast.ts:35`） |
| `verify-nox-billing`（51） | 5 | 1 | 0 | **要追随**。新 RPC は `billing_writable_of` ゲートの**名簿 94本**に加わる（＝ゲート集合の assert が増える） |
| `verify-nox-shift-time`（44） | 0 | 0 | 0 | **影響なし**（純関数・DB 非依存） |

### S6-2. 画面（`shifts` を読む／status を条件にする箇所・実測）

| ファイル | status 依存 | 見立て |
|---|---|---|
| `app/(manage)/shift/shift-board.tsx` | **11箇所**（:271 confirm 送信・:341 CSV・:375/:435 充足集計・:520/:638/:707 ピル・:726 ボタン出し分け・:772 マイ判定・:908 select・:967 調整モーダル） | **最大**。3値以上になると「予定/確定」の2分岐が全部 3分岐以上になる |
| `app/(manage)/dashboard/dashboard-board.tsx:123` | `confirmedToday` | 小（confirmed の定義が変わらなければ不変） |
| `app/(manage)/casts/casts-board.tsx:577` | 次回シフトの「確定/予定」表示 | 小 |
| `app/mine/page.tsx:236` | 同上（cast 面） | 小。★**#25「キャスト確認」を入れると cast 面に操作が生える**＝ここが増える |
| `lib/nox/payroll/collect.ts:246` | **`.eq("status","confirmed")`** | **★money 隣接**。中間状態の扱いを決めないと給与の分母が変わりうる |
| `lib/nox/labor-forecast.ts:35` | **依存しない**（コメントで明記） | 影響なし |
| `app/(manage)/audit/audit-board.tsx` | action 名のみ | 小（新 action 名が増える＝表示語彙の追加） |

### S6-3. golden への影響（見立て）

**現時点の見立て＝ golden への影響は無い**。根拠:

- **`labor-forecast` golden 55233** — `forecastDay()` は `status` を受け取らない
  （`labor-forecast.ts:35` に「status（planned/confirmed）は金額に影響しない＝両方含める（§2）ため受けない」と明記）。
  status を増やしても**入力の形が変わらない**。
- **payOf 系 golden（wage 5931 / withholding 125802）** — `pay.ts` は `DailyRecord` を受ける純関数で
  `shifts.status` を知らない。
- **`receipt 52` / `rate-back 64` / `billing 51`** — シフトと無関係。
- ★**ただし `payroll` 系は「金額」ではなく「集計の分母」に効きうる** — `collect.ts:246` が
  `confirmed` だけを拾うため、**中間状態の勤務を給与の出勤日数に数えるか**で `wDays` 相当が動く可能性がある。
  **golden ではないが、実データの結果は変わりうる**＝**要裁定**（「給与に乗るのは confirmed のみ」を明文化するのが最小）。

### S6-4. 規約上の追随（新テーブル／新 RPC を作る場合）

- **新テーブル**: `create table` → index → `enable row level security` → SELECT ポリシー →
  **`revoke all ... from public, anon, authenticated` → 必要 grant のみ**（＝TRUNCATE 穴の封鎖・0003 の標準型）。
- **新 RPC**: 冒頭 null guard → `revoke execute from public, anon` ＋ `grant to authenticated` →
  ロール判定は `auth_role()` ハードコード → **お金が動くなら**サーバ再計算＋冪等キー →
  **本体処理後に必ず `audit_log_write`**。cast セルフ RPC（#25）は **`auth_cast_id()` 本人チェック**（規約5）。
- **`billing_writable_of` ゲート**: 書込 RPC は全て通す（現在 **94本**の名簿に加わる）。

---

## 要裁定事項（本サーベイで浮かんだもの）

1. **★`wish_id` 対比表示の扱い**（冒頭の申告）— DP3-③ は誤った前提の裁定だった。
   (a) シフト深部で拾う／(b) DP3 の追補として先に入れる（**b 相当・小**）／(c) DP3-③ を維持。
2. **position 次元（キャスト／黒服）を入れるか** — 入れるなら `staffing_needs` の UNIQUE 再設計に加えて、
   **`shifts.cast_id` が `casts` FK ＝黒服のシフトを持てない**という構造問題に踏み込む（**最大の設計判断**）。
3. **中間状態と給与の関係** — `collect.ts:246` の `confirmed` 限定を維持するか（**要明文化**）。
4. **`shift_wishes.pref`（希望の強さ）を入れるか** — 配置ルールの「強い希望 → 勤務可」は pref が無いと成立しない。
5. **貪欲法の縮退時のソート鍵③（目標金額）** — NOX の対応概念（`comp_plans` の保証・ノルマ）と結ぶか、落とすか。
6. **一括操作の原子性** — 一括公開（#5）・auto 一括取消（#32）・必要人数の一括保存（#19）は
   **配列一括 RPC** にするか（`product_category_reorder` mig0077 の前例）。E8-5 の席#5 で
   「2連続呼びは非原子」を理由に見送った前例と同じ論点。

## 申告

- **S1/S2 は live DB からの逐語採取**（貼り先証明 orgs=3 を取得済み）。採取用の一時スクリプトは
  実行後に削除済みで、repo には残していません。
- **S3 の番号は指示と食い違っていました**（正しくは #6=承認4段・#7=自動配置・#8=下書き/公開・#9=マトリクス）。
  マトリクスの逐語に合わせて整理しています。
- **S5 は「原資なし」ではありませんでした**＝アルゴリズム仕様は流用マップ §7 に逐語記録済みで、
  裁定2 の本文にも「BANZEN の縮退翻訳で行う」と明記されています。ただし**翻訳着手時に
  BANZEN の実ファイルを開く前提**が流用マップ冒頭に書かれており、**細部（タイブレーク・
  「目標金額」の定義）は要旨だけでは足りません**。
