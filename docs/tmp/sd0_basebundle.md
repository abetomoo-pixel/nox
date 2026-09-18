# SD0 底本バンドル（相談役の migration 起草用・読み取り専用・2026-08-21）

**SD 設計裁定確定**（3値＋`shift_periods`・position 見送り・2鍵縮退・`source` 列・SD-1〜4）を受けた**底本採取**。
**実装・commit・DB 変更なし**。S1/S2 は **live DB から逐語採取**（記憶からの復元をしていない）。

**貼り先証明**: `select 'nox-project-proof', count(*) from public.orgs` → `[{"p":"nox-project-proof","orgs":3}]`

---

## 1) prosrc 全文（live 逐語）

### 1-1. `shift_set`

```
署名: shift_set(p_id uuid, p_cast_id uuid, p_date date, p_start_hm text, p_end_hm text, p_status text)
戻り: uuid ／ security definer=true ／ volatile ／ config: search_path=public
EXECUTE grant: authenticated, postgres, service_role
```

```plpgsql
declare
  v_cast record; v_actor uuid; v_id uuid; v_before jsonb;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_date is null then raise exception 'bad date'; end if;
  if p_start_hm is null or p_start_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_end_hm   is null or p_end_hm   !~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$' then raise exception 'bad time'; end if;
  if p_status is null or p_status not in ('planned','confirmed') then raise exception 'bad status'; end if;
  select * into v_cast from public.casts where id = p_cast_id;
  if v_cast.id is null or v_cast.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not v_cast.is_active then raise exception 'inactive cast'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_cast.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★B-5②: 定休日ハード拒否（create/update 共通・ロール照合の後=他店曜日の probing 防止）
  if public.shift_is_closed_day(v_cast.store_id, p_date) then
    raise exception 'closed day';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  if p_id is null then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, created_by)
    values (v_cast.org_id, v_cast.store_id, p_cast_id, p_date, p_start_hm, p_end_hm, p_status, v_actor)
    returning id into v_id;
    v_before := null;
  else
    select to_jsonb(s) into v_before from public.shifts s
      where s.id = p_id and s.org_id = public.auth_org_id() and s.cast_id = p_cast_id;
    if v_before is null then raise exception 'not found'; end if;
    update public.shifts
       set date = p_date, start_hm = p_start_hm, end_hm = p_end_hm, status = p_status
     where id = p_id and org_id = public.auth_org_id();
    v_id := p_id;
  end if;
  perform public.audit_log_write('shift_set', 'shifts:' || v_id::text, v_before,
    (select to_jsonb(s) from public.shifts s where s.id = v_id), v_cast.store_id);
  return v_id;
end
```

### 1-2. `shift_wish_decide`

```
署名: shift_wish_decide(p_wish_id uuid, p_accept boolean)
戻り: uuid ／ security definer=true ／ volatile ／ config: search_path=public
EXECUTE grant: authenticated, postgres, service_role
```

```plpgsql
declare
  v_wish record; v_actor uuid; v_shift uuid;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_accept is null then raise exception 'bad accept'; end if;
  select * into v_wish from public.shift_wishes where id = p_wish_id;
  if v_wish.id is null or v_wish.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_wish.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  if v_wish.status <> 'pending' then raise exception 'already decided'; end if;
  -- ★B-5②: accept のみ定休日ハード拒否（提出後に定休日設定された競合の防波堤・reject は定休日でも可・wish は pending のまま）
  if p_accept and public.shift_is_closed_day(v_wish.store_id, v_wish.date) then
    raise exception 'closed day';
  end if;
  select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;
  update public.shift_wishes
     set status = case when p_accept then 'accepted' else 'rejected' end,
         decided_by = v_actor, decided_at = now()
   where id = p_wish_id;
  -- 【0008 決定2】accept はシフト案（planned）へ自動取り込み。二重生成は部分ユニークで物理防止。
  if p_accept then
    insert into public.shifts (org_id, store_id, cast_id, date, start_hm, end_hm, status, wish_id, created_by)
    values (v_wish.org_id, v_wish.store_id, v_wish.cast_id, v_wish.date, v_wish.start_hm, v_wish.end_hm,
            'planned', p_wish_id, v_actor)
    returning id into v_shift;
  end if;
  perform public.audit_log_write('shift_wish_decide', 'shift_wishes:' || p_wish_id::text,
    to_jsonb(v_wish),
    jsonb_build_object(
      'wish', (select to_jsonb(w) from public.shift_wishes w where w.id = p_wish_id),
      'generated_shift_id', v_shift),
    v_wish.store_id);
  return v_shift; -- reject 時は null
end
```

### 1-3. 参考: `shift_is_closed_day`（両 RPC が呼ぶヘルパー）

```
署名: shift_is_closed_day(p_store_id uuid, p_date date)
```
```plpgsql
declare
  v_closed boolean;
begin
  select bh.is_closed into v_closed
  from public.store_business_hours bh
  where bh.store_id = p_store_id and bh.dow = extract(dow from p_date)::int;
  return coalesce(v_closed, false);
end
```

---

## 2) テーブル3表の全定義（live 逐語）

### 2-1. `public.shifts`

**列**

```
id         | uuid                     | null=NO  | default gen_random_uuid()
org_id     | uuid                     | null=NO  | -
store_id   | uuid                     | null=NO  | -
cast_id    | uuid                     | null=NO  | -
date       | date                     | null=NO  | -
start_hm   | text                     | null=NO  | -
end_hm     | text                     | null=NO  | -
status     | text                     | null=NO  | default 'planned'::text
wish_id    | uuid                     | null=YES | -
created_by | uuid                     | null=NO  | -
created_at | timestamp with time zone | null=NO  | default now()
updated_at | timestamp with time zone | null=NO  | default now()
```

**CHECK**

```
shifts_end_hm_check   CHECK ((end_hm   ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'::text))
shifts_start_hm_check CHECK ((start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text))
shifts_status_check   CHECK ((status = ANY (ARRAY['planned'::text, 'confirmed'::text])))
```

**FK / PK**

```
shifts_cast_id_fkey    FOREIGN KEY (cast_id)    REFERENCES casts(id)
shifts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)
shifts_org_id_fkey     FOREIGN KEY (org_id)     REFERENCES orgs(id)
shifts_store_id_fkey   FOREIGN KEY (store_id)   REFERENCES stores(id)
shifts_wish_id_fkey    FOREIGN KEY (wish_id)    REFERENCES shift_wishes(id)
shifts_pkey            PRIMARY KEY (id)
```

**index**

```
CREATE INDEX        shifts_cast_date_idx  ON public.shifts USING btree (cast_id, date)
CREATE INDEX        shifts_org_idx        ON public.shifts USING btree (org_id)
CREATE UNIQUE INDEX shifts_pkey           ON public.shifts USING btree (id)
CREATE INDEX        shifts_store_date_idx ON public.shifts USING btree (store_id, date)
CREATE UNIQUE INDEX shifts_wish_id_uidx   ON public.shifts USING btree (wish_id) WHERE (wish_id IS NOT NULL)
```

**RLS**: `relrowsecurity=true` / `relforcerowsecurity=false`

```
POLICY shifts_select  cmd=r(SELECT)  roles=authenticated
USING (((org_id = auth_org_id())
        AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id()))
        AND ((auth_role() <> 'cast'::text) OR (cast_id = auth_cast_id()))))
WITH CHECK (-)
```

**grants（現状）**

```
authenticated : SELECT                                              ← ★書込 grant なし
postgres      : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
service_role  : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
anon          : （行なし＝grant ゼロ）
public        : （行なし＝grant ゼロ）
```

**trigger**

```
CREATE TRIGGER shifts_touch_updated_at BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at()
```

### 2-2. `public.shift_wishes`

**列**

```
id         | uuid                     | null=NO  | default gen_random_uuid()
org_id     | uuid                     | null=NO  | -
store_id   | uuid                     | null=NO  | -
cast_id    | uuid                     | null=NO  | -
date       | date                     | null=NO  | -
start_hm   | text                     | null=NO  | -
end_hm     | text                     | null=NO  | -
status     | text                     | null=NO  | default 'pending'::text
decided_by | uuid                     | null=YES | -
decided_at | timestamp with time zone | null=YES | -
created_at | timestamp with time zone | null=NO  | default now()
updated_at | timestamp with time zone | null=NO  | default now()
```

**CHECK / FK / PK**

```
shift_wishes_end_hm_check   CHECK ((end_hm   ~ '^([0-3][0-9]|4[0-7]):[0-5][0-9]$'::text))
shift_wishes_start_hm_check CHECK ((start_hm ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text))
shift_wishes_status_check   CHECK ((status = ANY (ARRAY['pending'::text,'accepted'::text,'rejected'::text,'withdrawn'::text])))
shift_wishes_cast_id_fkey    FOREIGN KEY (cast_id)    REFERENCES casts(id)
shift_wishes_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES users(id)
shift_wishes_org_id_fkey     FOREIGN KEY (org_id)     REFERENCES orgs(id)
shift_wishes_store_id_fkey   FOREIGN KEY (store_id)   REFERENCES stores(id)
shift_wishes_pkey            PRIMARY KEY (id)
```

**index**

```
CREATE INDEX        shift_wishes_cast_date_idx  ON public.shift_wishes USING btree (cast_id, date)
CREATE INDEX        shift_wishes_org_idx        ON public.shift_wishes USING btree (org_id)
CREATE UNIQUE INDEX shift_wishes_pkey           ON public.shift_wishes USING btree (id)
CREATE INDEX        shift_wishes_store_date_idx ON public.shift_wishes USING btree (store_id, date)
```

**RLS**: `relrowsecurity=true` / `relforcerowsecurity=false`

```
POLICY shift_wishes_select  cmd=r  roles=authenticated
USING (((org_id = auth_org_id())
        AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id()))
        AND ((auth_role() <> 'cast'::text) OR (cast_id = auth_cast_id()))))
WITH CHECK (-)
```

**grants**: `authenticated: SELECT` のみ／postgres・service_role フル／**anon・public は grant ゼロ**

**trigger**: `shift_wishes_touch_updated_at BEFORE UPDATE ... EXECUTE FUNCTION touch_updated_at()`

### 2-3. `public.staffing_needs`

**列**

```
id         | uuid                     | null=NO  | default gen_random_uuid()
org_id     | uuid                     | null=NO  | -
store_id   | uuid                     | null=NO  | -
dow        | smallint                 | null=NO  | -
required   | integer                  | null=NO  | default 0
created_at | timestamp with time zone | null=NO  | default now()
updated_at | timestamp with time zone | null=NO  | default now()
from_min   | integer                  | null=NO  | default 0
to_min     | integer                  | null=NO  | default 1440
```

**CHECK / FK / PK / UNIQUE**

```
staffing_needs_band_chk           CHECK (((from_min >= 0) AND (from_min < to_min) AND (to_min <= 1440)))
staffing_needs_dow_check          CHECK (((dow >= 0) AND (dow <= 6)))
staffing_needs_required_check     CHECK ((required >= 0))
staffing_needs_org_id_fkey        FOREIGN KEY (org_id)   REFERENCES orgs(id)
staffing_needs_store_id_fkey      FOREIGN KEY (store_id) REFERENCES stores(id)
staffing_needs_pkey               PRIMARY KEY (id)
staffing_needs_store_dow_from_key UNIQUE (store_id, dow, from_min)
```

**index**

```
CREATE INDEX        staffing_needs_org_idx            ON public.staffing_needs USING btree (org_id)
CREATE UNIQUE INDEX staffing_needs_pkey               ON public.staffing_needs USING btree (id)
CREATE UNIQUE INDEX staffing_needs_store_dow_from_key ON public.staffing_needs USING btree (store_id, dow, from_min)
```

**RLS**: `relrowsecurity=true` / `relforcerowsecurity=false`

```
POLICY staffing_needs_select  cmd=r  roles=authenticated
USING (((org_id = auth_org_id())
        AND ((auth_role() = 'owner'::text) OR (store_id = auth_store_id()))
        AND (auth_role() <> 'cast'::text)))          ← ★cast は0行（他2表と違い自分の行も見えない）
WITH CHECK (-)
```

**grants**: `authenticated: SELECT` のみ／postgres・service_role フル／**anon・public は grant ゼロ**

**trigger**: `staffing_needs_touch_updated_at BEFORE UPDATE ... EXECUTE FUNCTION touch_updated_at()`

---

## 3) `shift_periods` の不存在確認（`to_regclass`）

```sql
select to_regclass('public.shift_periods') as shift_periods,
       to_regclass('public.shift_rules')   as shift_rules,
       to_regclass('public.shift_assignments') as shift_assignments;
```
```json
[{"shift_periods":null,"shift_rules":null,"shift_assignments":null}]
```

→ **3つとも `null` ＝ live に存在しない**（`shift_periods` の新設は衝突なし）。

---

## 4) 既存 mig の shifts 系 非冪等・依存注意

**shifts 系を触る mig（全数）**: `0008` / `0009` / `0017` / `0032` / `0033` / `0036` / `0088` / `0095`

| mig | 内容 | 非冪等・依存の注意 |
|---|---|---|
| **0008** `f1d_shift_schema` | `shifts` / `shift_wishes` / `staffing_needs` / `attendance` / `punches` の create ＋ RLS | **冪等寄り**（`create table if not exists`・`create index if not exists`・`drop policy if exists` → `create policy`）。★`shifts.wish_id` はここで定義＝コメント逐語「`wish_id uuid references public.shift_wishes(id), -- 希望→確定の来歴（decide(accept) 自動生成時）`」。**部分ユニーク** `shifts_wish_id_uidx ... where wish_id is not null` も同ファイル（**【決定2】accept の二重生成防止＝1つの wish から shifts は1行だけ**） |
| **0009** `f1d_shift_rpc` | `shift_wish_*` / `shift_set` の初版 | `create or replace function` ＝再実行可。**ただし署名を変えると旧署名が残る**（後段の mig で `drop function` が必要になる型） |
| 0017 | `attendance` / `incentives` | shifts 直接は触らない |
| 0032 / 0033 | `store_business_hours` ＋ `shift_is_closed_day` | **`shift_set` / `shift_wish_decide` がこのヘルパーに依存**（定休日ハード拒否）。ヘルパーを触ると両 RPC の挙動が変わる |
| 0036 | approvals | shifts 直接は触らない |
| **0088** `billing_gate` | 全書込 RPC へ `billing_writable_of` ゲートを注入 | **`shift_set` / `shift_wish_decide` はゲート済み**。★**新規の書込 RPC を足すたびにゲート名簿（現在 94本）に加わる**＝`verify:nox-billing` の pin を更新する必要がある |
| **0095** `shift_bands_incentive_target` | `staffing_needs` 時間帯化＋`attendance_incentives` 拡張 | **★非冪等（本番手貼り1回・再実行厳禁）**と冒頭に明記。内訳＝**`add column`**（`from_min`/`to_min`）／**UNIQUE の drop・張り替え**（`staffing_needs_store_id_dow_key` を drop → `staffing_needs_store_dow_from_key` を add）／**旧署名 drop**。★`staffing_need_remove` は**新設＝ゲート対象 +1**（0089〜0091 型の波及が織り込み済み） |

**mig0095 冒頭の裁定（逐語・SD の前提として重要）**

```
E8-4-1 案A 行分割・from_min/to_min default 0/1440＝既存行は自動で終日バンド・backfill 不要
E8-4-2 ポジション軸は今回入れない（純増候補パーク）        ← ★SD の「position 見送り」と整合
E8-4-3 reason（≤200）＋target_cast_ids uuid[]（null=全員=現行互換）・明細テーブルなし
E8-4-4 0083 非対称流儀踏襲・バンド重複は RPC ガード 'overlap'（exclusion constraint なし）
```

**共通の運用注意**

- **`notify pgrst, 'reload schema';` はファイル外・手貼り後に単発**（0095 冒頭に明記）。
  **新テーブル・新関数・アリティ変更**を入れたら必須（PostgREST のキャッシュ更新）。
- 新規テーブルは **0003 の標準型**：`create table` → index → `enable row level security` → SELECT ポリシー →
  **`revoke all ... from public, anon, authenticated` → 必要 grant のみ**（TRUNCATE は RLS が効かないため grant 面でも締める）。
- 新規 RPC は **二重防御**：冒頭 `auth_org_id() is null → forbidden` ／
  `revoke execute from public, anon` ＋ `grant execute to authenticated` ／
  ロール判定は `auth_role()` ハードコード ／ **本体処理後に必ず `audit_log_write`**。
- **マイグレーションは単一トランザクション**（`begin;` 〜 `commit;`）・冒頭コメントに名称/翻訳元/検証クエリ・
  **検証クエリの先頭に貼り先証明** `select 'nox-project-proof', count(*) from public.orgs;`。

---

## 5) donor 読取要約（SD-3・BANZEN ローカル読取のみ）

**読んだ実ファイル**: `C:\Users\abet\Dropbox\cloude\makanai-shift\lib\shift-autoassign.ts`（**837行**）
＋ `app/api/shift/auto-assign/route.ts`（10,897 bytes）＋ `app/(app)/shift/shift-planner.tsx` の該当箇所。

★**BANZEN 側は1文字も変更していません**。★**NOX repo にコードはコピーしていません**（要約のみ）。

### 5-1. ソート鍵の完全な定義と順序（タイブレークの最終鍵まで）

`autoAssign` 内の比較関数 `cmp(a, b)` は **5段**でした（流用マップ §7 の要約「①②③」より**2段多い**）。

| 段 | 鍵 | 定義（要約） |
|---|---|---|
| **最上位** | **モードB の優先度** | `input.priority?.[id] ?? Infinity` の昇順（小＝高優先）。**未指定は最後尾**。店長が D&D で並べた順が最優先キーになる |
| **⓪** | **社員の最低出勤日数 未達** | `isShain(s) && s.minDays != null && daysWorked(id) < s.minDays` が真の人を先に。**社員の契約充足を先に埋める** |
| **①** | **最低月間時間 未達** | `(minMonthMin ?? 0) > 0 && projMin(id) < minMonthMin` が真の人を先に |
| **②** | **公平（割当が少ない）** | `projMin(a.id) - projMin(b.id)` の昇順（＝その時点の見込み総分） |
| **③（最終）** | **目標金額に近づく** | `(hourlyWage ?? 0) * (projMin(id)/60)` の**昇順**＝**現在の概算稼ぎが少ない人を優先** |

**★③がタイブレークの最終鍵**で、それ以上の鍵はありません（同値なら `sort` の安定性に委ねられる）。

**2段構えの候補プール（tier1 / tier2）**も重要でした:

- **tier1「クリーン候補」** ＝ soft 制約を**すべて**満たす人（`!overMonth && !overConsec && !overWeek && !overRestFloor`）を
  `cmp` でソートして先頭を採る。
- **tier2（tier1 が空のとき）** ＝ **monthly（社員）のみ** soft 違反を許容して配置。
  **hourly は hard-block を維持＝不足のまま残す**。tier2 のソートは
  **`softCount`（soft 配置回数）の昇順を最上位キー**にしてから `cmp` ＝**違反を1人に集中させない分散**。

### 5-2. 「目標金額」鍵の実装（NOX では落とすが、落とす対象の正確な理解のため）

```
③ 目標金額に近づく（現在の概算稼ぎが少ない人を優先）
return (a.hourlyWage ?? 0) * (projMin(a.id) / 60)
     - (b.hourlyWage ?? 0) * (projMin(b.id) / 60);
```

- 入力は `StaffInput.targetYen`（目標金額）と `StaffInput.hourlyWage`（円/時）。
- **★実装は `targetYen` を参照していません**。比較しているのは
  **「時給 × 見込み総時間」＝現在の概算稼ぎ**の**昇順**だけです。
  つまり「目標に近づける」ではなく「**稼ぎの少ない人から埋める**」＝**②公平性の金額版**。
- 型に `targetYen?: number` はあるものの、`cmp` では未使用＝**宣言はあるが実参照がない**
  （NOX の教訓「宣言 ≠ 実参照」と同型）。
- **NOX で落とす対象＝この③1本**。落とすと「②公平（時間ベース）」で決着し、
  **時給差を配置に反映しなくなる**＝時給の高い人も低い人も同じ扱いになります。
  ★**2鍵縮退（裁定）＝ ①最低月間時間未達 → ②公平** で整合します。
  ただし **NOX には `minMonthMin`（最低月間時間）に相当する概念があるかは未確認**＝
  `comp_plans` の保証時給・ノルマとの写像は**相談役の設計書で決める必要**があります。

### 5-3. 割当ループの走査順・停止条件・不足枠の出力形式

**走査順（外側から）**

```
for date of eachDate(startDate, endDate)          -- ① 日付
  if closed.has(weekdayOf(date)) continue         --    定休日はスキップ
  for band0 of baseBands                          -- ② 基本帯（tier='base'）
    band = resolveBand(band0, wd); if (!band) continue   -- 曜日別時刻の解決・その曜日営業なしはスキップ
    peak = 同 meal の tier='peak' を同 dow で解決
    positions = reqConfig から この band/peak に登場する position 集合
    for pos of positions                          -- ③ ポジション
      need = max(baseReq, peakReq)                --    必要数＝基本帯とピーク帯の大きい方
      need -= already                             --    既存割当（手修正・既提案）を差し引く
      if (need <= 0) continue
      while (need > 0) { …1人ずつ選んで配置… }
```

**停止条件（`while (need > 0)` を抜ける条件）**

1. `need--` が 0 に達する（充足）
2. **tier1 が空**かつ **tier2 の候補も空** → `if (softCands.length === 0) break;`
3. `pick` が取れない → `if (!pick) break;`

→ 抜けた後に `if (need > 0) shortages.push({ date, band_key, position, short: need });`

**出力形式（`AutoAssignResult`）**

```ts
{
  assignments: AssignmentDraft[]   // source='auto' の新規提案のみ
  shortages:   Shortage[]          // { date, band_key, position, short }
  unassignedWishes: { staff_id, date }[]   // 希望を出したのにどこにも入らなかった人（希望過多枠）
  warnings:    AssignWarning[]     // { staff_id, date|null, type, detail }
}
```

- **`shortages`** は **(日付 × 帯 × ポジション)** 単位で「あと何人足りないか」を持つ。
  ★NOX は position を見送るので **(日付 × 帯)** 単位に縮退します。
- **`unassignedWishes`** は `input.requests` を走査し、`pref === 'unavailable'` と定休日を除いて
  「その日 `usedPerDay` に入っていない人」を拾う＝**希望過多の可視化**。
- **`warnings`** は7種（`over_consec` / `over_month_h` / `over_week_days` / `over_rest_floor` /
  `under_min_days` / `under_min_month_h` / `over_max_off`）。文言テンプレは `WARN_DETAIL` に**単一ソース化**され、
  配置時と確定前チェックの**両方が同じ式を通る＝文言がドリフトしない**設計でした（NOX の定数化流儀と同型）。
- **段階配置 `autoAssignStaged`**（2パス＝pass1 正社員／pass2 アルバイト）も別 export で存在。
  pass1 の結果を `existing` に積んで pass2 を回す＝**正社員が先に埋まる**。
  ★NOX は雇用区分の2パスを持たない想定なら**この関数は移植対象外**。

### 5-4. `undoAuto` 相当（auto 取消）の実装有無と方式

**実装あり。方式は「`source='auto'` の行だけ物理削除」**でした。

**(a) UI から明示的に取り消す**（`shift-planner.tsx:446 undoAutoAssign`）

```
confirm("この期間の自動配置による割当をすべて削除します。手動で調整した分は残ります。よろしいですか？")
→ supabase.from("shift_assignments").delete({ count: "exact" })
     .eq("period_id", period.id).eq("source", "auto")
→ flash(`自動配置を取り消しました（${count}件削除・手動分は保持）`)
```

**(b) 再実行時に自動で入れ替える**（`app/api/shift/auto-assign/route.ts:163`）

```
// auto を削除 → 再挿入（manual は保持）。
// ★削除スコープ＝生成プール：pool=null＝全 auto／pool=集合＝その staff の auto のみ。
//   pool が空集合（0人選択）＝生成 0 件なので削除もしない＝完全 no-op
if (pool === null || pool.size > 0) {
  const delQ = ...delete().eq("period_id", periodId).eq("source", "auto");
  const del = await (pool === null ? delQ : delQ.in("staff_id", [...pool]));
}
… その後 result.assignments を insert
```

**★NOX 移植での含意**

1. **`source` 列は必須**（裁定どおり）。これが無いと「auto だけ消す」が書けない。
2. **削除スコープが `period_id` に紐づく**＝**`shift_periods` が前提**（裁定どおり）。
   NOX で period を持たないと「どの範囲の auto を消すか」を日付範囲で表現することになる。
3. **`delete → insert` は2文＝原子性が要る**。NOX の規約では
   **「お金が動く操作はトランザクション」**であり、シフトは金銭ではないものの
   **途中失敗で auto が消えたまま insert されない**状態を作りうる。
   → **1本の RPC 内で `delete` → `insert` を行う**（PostgreSQL の関数は単一トランザクション）のが
   NOX 流儀として自然です。E8-5 が席#5 の並べ替えを「2連続呼びは非原子」で見送った前例と同じ論点。
4. **モードA（プール限定）の no-op 保証**＝`pool` が空集合なら**削除もしない**。
   PostgREST の `.in("staff_id", [])` の挙動に依存しない書き方をしていました（NOX でも同じ配慮が要る）。
5. **`confirm` の文言**が「**手動で調整した分は残ります**」と明示＝
   モックの `.hint`「手動で調整した配置は、再度自動配置しても保持されます。」と一致。

### 5-5. ★移植時の申し送り（donor 読取で判明した差分）

| # | 論点 | donor の実装 | NOX の状況 |
|---|---|---|---|
| 1 | **希望の強さ（pref）** | `pref: "preferred" \| "available" \| "unavailable"`。候補は `pref ∈ {preferred, available}` | **`shift_wishes` に pref が無い**（提出＝出たい日のみ）。`unavailable`（×の日）も表現できない |
| 2 | **必要数の算出** | `need = max(基本帯 req, 対応ピーク帯 req) − 既存割当` | NOX は `staffing_needs` が **(store, dow, from_min, to_min) → required` の**単層**＝base/peak の対応関係が無い。**「帯ごとの required をそのまま need」**に縮退できる |
| 3 | **時間窓の決定** | `clampToBand(effWin(staff, date), band)`＝希望窓 ∧ 帯窓。希望に時刻が無ければ `avail`（曜日別勤務可能時間）→ 社員は `stdFrom/stdTo` を優先 | NOX の希望は **`start_hm`/`end_hm` が必須**（CHECK あり）＝**窓フォールバックは不要**。`avail` / `stdFrom` に相当する列も無い |
| 4 | **1日1枠** | `usedPerDay` で同日二重割当を禁止 | NOX も `shifts` に同日複数行を防ぐ制約は**無い**＝**アプリ側かRPC側で担保が要る**（部分ユニークの候補） |
| 5 | **`break_min`** | `defaultBreak(spanMin)` で既定値・**「上書き可能な既定値。法定休憩は専門家確認のうえ店長が調整」**と冒頭に明記 | NOX の `shifts` に **`break_min` 列は無い**。入れるかは裁定（労務は社労士ゲート＝docx 照会済み領域） |
| 6 | **連勤・月間上限** | `maxConsec` / `maxMonthMin` / `globalMaxConsec` / `globalMaxMonthMin`（**厳しい方**を採用） | NOX は配置ルールの保持先が無い＝**新列/新テーブル**（裁定の `shift_rules` 相当） |
| 7 | **公休生成（maxOff / preferOffDows）** | 塊2 で「先に休みを作ってから配置」するフェーズあり | NOX に該当概念なし＝**移植対象外**（縮退の範囲外） |

---

## 申告

- **live 採取用の一時スクリプトは実行後に削除済み**で、repo には残していません（`scripts/_sd0_*` は不存在を確認）。
- **BANZEN 側は読み取りのみ**（1文字も変更していません）。**NOX repo へのコードのコピーもしていません**。
- **流用マップ §7 の要約と実装の差**を2点見つけました:
  ①**ソート鍵は5段**（要約は3段）＝モードB 優先度と「社員の最低出勤日数未達」が上位に居る。
  ②**「目標金額」鍵は `targetYen` を参照していない**＝実体は「時給 × 見込み時間」の昇順＝
  **②公平性の金額版**でした。NOX で落とす対象の正確な理解として重要です。
