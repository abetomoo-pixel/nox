# NOX F3a-3 予約機能 — 設計ロック確定版（mig0027 起草仕様）

> F3a 完結（origin/main d189d50）後の次フェーズ。register 3タブ目「予約」= customers 連動の本格予約。
> **全論点 lock 済み**（Agoora 確定 2026-07-10・CC 現物確認7項目反映）。この仕様で mig0027 を起草 → 相談役全文レビュー。
> dev DB mig0001〜0026 適用済み。この mig は **0027**。NOX 予約系はまるごと新規。
> **★実装状況（2026-07-10 追記）: mig0027 は dev 適用済み・verify 段19 全 pass・verify:f0 1172 全緑（§8 実装完了記録）。残タスク＝UI（§5）。**

作成 2026-07-10 / 全設計ロック完了 / mig0027 適用済み・段19 完了（§8 追記）/ 残＝UI（§5）

---

## 0. 確定要件（Agoora・全7問）

| 項目 | 確定 |
|---|---|
| 性質 | customers 連動の本格予約 |
| 押さえる単位 | 日時 + 担当キャスト指名（卓は押さえない） |
| 予約→来店 | 予約から伝票を開ける（客名・指名を check に引き継ぐ）＝案A |
| ステータス | booked / visited / no_show / cancelled の4値 |
| 指名種別(nom_type) | **予約時にも来店時にも決められる（両対応）**＝予約に nom_type 任意保持・来店時上書き可 |
| 客指定 | 既存客 select（customer_id 付与）+ フリー入力（customer_id=null）の併存 |
| 卓 | 予約は seat_id 持たない・卓希望は memo・卓は来店時 p_seat_id で確定 |

---

## 1. reservations テーブル（新設・mig0027）

```sql
create table public.reservations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id),
  store_id     uuid not null references public.stores(id),
  customer_id  uuid null references public.customers(id),   -- 既存客紐付け（フリー客=null）
  cast_id      uuid null references public.casts(id),        -- 指名キャスト（未指名=null）
  guest_name   text null,                                    -- フリー入力名（customer_id=null 時の表示名）
  reserved_at  timestamptz not null,                         -- 予約日時
  party_size   integer null,                                 -- 人数（任意）
  nom_type     text null,                                    -- 予約時の指名種別（任意・来店時上書き可）
                                                             --   null or hon/jonai/dohan/free
  status       text not null default 'booked',               -- booked/visited/no_show/cancelled
  memo         text null,                                    -- 備考（卓希望もここ）
  check_id     uuid null references public.checks(id),       -- 来店時に開いた伝票（visited の証跡）
  created_by   uuid null references public.users(id),        -- 受付スタッフ
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reservations_status_chk
    check (status in ('booked','visited','no_show','cancelled')),
  constraint reservations_nom_type_chk
    check (nom_type is null or nom_type in ('hon','jonai','dohan','free')),
  constraint reservations_party_chk
    check (party_size is null or party_size > 0)
);
create index reservations_store_time_idx on public.reservations (store_id, reserved_at);
create index reservations_cast_idx on public.reservations (cast_id) where cast_id is not null;
```

★CHECK 制約（status・nom_type）は **runtime のみ表面化**（BANZEN 0067 kiosk 教訓）＝verify で全 status・全 nom_type を実挿入して確認。party_size>0 は check_open の bad people と同型。

**列設計の要点:**
- **guest_name**: フリー入力名。customer_id ありなら customers から表示名を引く（guest_name は使わない/null）。customer_id=null なら guest_name が表示名（モックの「フリー」相当）。★両立：customer_id と guest_name は排他でなく「customer_id 優先・なければ guest_name」。
- **nom_type null 許容**: 予約時に未指定を許す（来店時に決める）。予約時に入れれば来店時の既定になる。
- **check_id**: visited になった時 reservation_to_check が埋める。visited ⇔ check_id NOT NULL を verify で保証。
- **updated_at**: ステータス変更・編集で更新（trigger or RPC 内で set）。

---

## 2. RLS（可視範囲・customers 同型）

```sql
alter table public.reservations enable row level security;

create policy reservations_select on public.reservations for select
using (
  org_id = public.auth_org_id()
  and (
    public.auth_role() = 'owner'                                              -- 全店
    or (public.auth_role() = 'manager' and store_id = public.auth_store_id()) -- 自店
    or (public.auth_role() = 'staff'   and store_id = public.auth_store_id()
        and public.auth_staff_can_crm())                                      -- can_crm で自店全予約
    or (public.auth_role() = 'cast'    and cast_id = public.auth_cast_id())   -- 自分指名予約のみ
  )
);
```

- owner: 全予約（店スコープ内）
- manager: 自店全予約
- staff: can_crm=true で自店全予約 / フラグなし=0行
- cast: cast_id=auth_cast_id() の予約のみ（未指名 cast_id=null は cast に見せない・退店 cast は auth_cast_id() が null で fail-closed）
- anon: 0行

★店スコープ必須（束2 customers の教訓＝当初設計は店スコープ欠落の他店漏洩バグ）。owner 以外は store_id=auth_store_id() を必ず併せる。
★INSERT/UPDATE/DELETE policy は作らない（customers 同型＝書込は SECURITY DEFINER RPC で検証）。

---

## 3. 予約 RPC 群（新設・すべて SECURITY DEFINER・owner セッション）

### 3-A. reservation_create（予約登録・can_crm）

```
引数: p_store_id, p_customer_id(null可), p_cast_id(null可), p_guest_name(null可),
      p_reserved_at, p_party_size(null可), p_nom_type(null可), p_memo(null可)
権限: owner / manager(自店) / staff(自店 ∧ can_crm) / cast 不可
ガード:
  - fail-closed（auth_org_id/role null）
  - store org 照合（stores 経由・invalid store）
  - 権限差（owner=org全店 / manager=自店 / staff=自店∧can_crm）
  - customer_id ありなら 同 org・同店 検証（check_open の invalid customer 同型）
  - cast_id ありなら 同 org・同店・is_active 検証（check_set_nominations の bad cast 同型）
  - nom_type ありなら hon/jonai/dohan/free（bad nom_type）
  - party_size ありなら >0（bad people）
  - reserved_at not null
  - customer_id と guest_name の両方 null は許容（名前なし予約＝運用上は稀だが弾かない）
    → ★lock: どちらか無くても作れる（後で編集で埋められる）。表示は customer名 or guest_name or "（名前未設定）"
insert reservations(... status='booked' ...) → audit → return reservation_id
```

### 3-B. reservation_update（変更・can_crm）

```
引数: p_reservation_id + 変更可能フィールド（reserved_at/cast_id/guest_name/customer_id/party_size/nom_type/memo）
権限: reservation_create と同型
ガード: 対象予約を org 照合（stores 経由 or org_id 直接＝reservations は org_id 列を持つので直接照合可）
  - status='booked' のみ変更可（visited/cancelled/no_show は変更不可＝'not editable'）
    → ★visited 後の変更は伝票側の責務・cancelled/no_show は確定状態
  - customer_id/cast_id 変更時は各々の org/店/is_active 再検証
update → updated_at=now() → audit（before/after）
```

### 3-C. reservation_set_status（ステータス変更＝キャンセル/no-show マーク・can_crm）

```
引数: p_reservation_id, p_status（'cancelled' | 'no_show' のみ受ける）
権限: reservation_create と同型
ガード:
  - 対象予約 org 照合
  - ★遷移制約: booked → cancelled / booked → no_show のみ許可
    （visited への遷移は reservation_to_check 専用＝手動で visited にはできない・
     visited⇔check_id 1:1 を守るため。cancelled/no_show からの復帰は 'bad transition'）
  - p_status not in ('cancelled','no_show') → 'bad status'
update status → updated_at → audit
```
> ★visited は reservation_to_check だけが設定する（手動 flip 不可）。これが visited⇔check_id 整合の要。

### 3-D. ★reservation_to_check（予約→伝票を開く・can_register・本命）

```sql
-- 案A: 予約 RPC が check_open + check_set_nominations を内部呼び（definer チェーン・項目4 で実証）
create or replace function public.reservation_to_check(
  p_reservation_id uuid,
  p_seat_id        uuid,
  p_nom_type       text default null   -- 来店時の指名種別（null なら予約の nom_type・両方 null なら free）
) returns uuid                         -- 開いた check の id
language plpgsql security definer set search_path = public
as $$
declare
  v_org       uuid := public.auth_org_id();
  v_role      text := public.auth_role();
  v_res       public.reservations;
  v_nom_type  text;
  v_check_id  uuid;
  v_cast_ok   boolean := false;
begin
  if v_org is null or v_role is null then raise exception 'forbidden'; end if;

  -- 対象予約（org 照合・reservations は org_id 列あり）
  select * into v_res from public.reservations
  where id = p_reservation_id and org_id = v_org;
  if not found then raise exception 'not found'; end if;

  -- status=booked のみ来店処理可（visited 再処理・cancelled/no_show は不可）
  if v_res.status <> 'booked' then raise exception 'not bookable'; end if;

  -- ★発見1対策: 対象卓に既存 open があれば拒否（使用中の卓に予約客を着けない）
  if exists (
    select 1 from public.checks
    where seat_id = p_seat_id and status = 'open' and org_id = v_org
  ) then
    raise exception 'seat occupied';
  end if;

  -- nom_type 決定: 引数 > 予約の nom_type > 'free'（両対応・来店時上書き可）
  v_nom_type := coalesce(p_nom_type, v_res.nom_type, 'free');
  if v_nom_type not in ('hon','jonai','dohan','free') then raise exception 'bad nom_type'; end if;

  -- ① check_open を内部呼び（customer_id 引き継ぎ・can_register は内側で強制＝項目4 実証）
  --    権限（can_register）・seat 検証・invalid customer は check_open が担う（二重に書かない）
  v_check_id := public.check_open(p_seat_id, v_res.party_size, v_nom_type, v_res.customer_id);

  -- ② 指名引き継ぎ（cast_id あり ∧ ★発見3: cast が is_active のときだけ）
  if v_res.cast_id is not null then
    select true into v_cast_ok from public.casts
    where id = v_res.cast_id and org_id = v_org and is_active
      and store_id = (select store_id from public.checks where id = v_check_id);
    if v_cast_ok then
      -- check_set_nominations を内部呼び（単一指名＝要素1の配列・weight=1）
      perform public.check_set_nominations(
        v_check_id, v_nom_type,
        jsonb_build_array(jsonb_build_object('cast_id', v_res.cast_id, 'weight', 1))
      );
    end if;
    -- ★cast inactive（v_cast_ok=false）なら指名スキップ・開店は成功（発見3 lock）
    --   UI が「指名キャスト不在で開店」を表示（戻り値だけでは判別不可＝§5 UI 参照）
  end if;

  -- 予約を visited に・check_id を埋める（visited⇔check_id 1:1）
  update public.reservations
     set status = 'visited', check_id = v_check_id, updated_at = now()
   where id = p_reservation_id;

  perform public.audit_log_write('reservation_to_check', 'reservations:' || p_reservation_id::text,
    to_jsonb(v_res),
    jsonb_build_object('status','visited','check_id',v_check_id,'seat_id',p_seat_id,'nom_type',v_nom_type),
    v_res.store_id);

  return v_check_id;
end $$;
```

**要点:**
- **権限は内側 check_open が can_register を強制**（項目4 negative で実証）。reservation_to_check 自体には can_register ゲートを書かず、check_open のチェーンに委ねる（二重に書かない・整合が崩れない）。ただし fail-closed 冒頭ガードは持つ。
- **発見1**: seat occupied 事前検証。
- **発見3**: cast inactive なら指名スキップして開店成功。
- **nom_type 両対応**: 引数 > 予約 nom_type > free の優先。
- **check_open の内部呼びで store_id が確定**するので、cast の店照合は開いた check の store_id を使う。
- **★【10】実装済み（CC 追加ガード・mig0027・相談役承認）**: to_check は `seat.store_id = reservation.store_id`
  を検証（'invalid store'）。無いと owner の org 全店権限で「A1 の予約を A2 の卓で開く」誤接続が
  customer_id=null（guest_name のみ）のフリー予約で素通りする（customer あり予約は内側 check_open の
  invalid customer が止めるが、フリー予約には関所が無い）。**段19-7 で実発火を assert 済み**。

> ★grant: reservation_to_check は authenticated に grant（can_register は内側で強制されるので、この RPC 自体は authenticated 全員に開けてよい＝呼んでも内側 check_open で forbidden になる）。revoke public, anon。

### 3-E. reservation_delete（行削除・can_crm）は作るか？

モックに「行削除アイコン」あり。ただし物理削除は customers/staff の流儀（is_active soft delete）と不整合。
→ **lock: 物理削除は作らない**。cancelled ステータスで代替（モックの削除アイコンは cancelled マークに読み替え）。監査証跡を残す（誤操作の復元可能性）。UI は cancelled を「取消」表示、リストから畳む（非表示フィルタ）。

---

## 4. grant/revoke

```sql
revoke execute on function public.reservation_create(...) from public, anon;
grant  execute on function public.reservation_create(...) to authenticated;
-- reservation_update / reservation_set_status / reservation_to_check も同型
```
5 RPC（create/update/set_status/to_check、delete は作らない）× revoke public,anon + grant authenticated。

★PostgREST スキーマリロード（項目4 副産物）: mig0027 手貼り後、新関数を PostgREST が認識するには `notify pgrst, 'reload schema';` が要る。検証手順に含める。

---

## 5. UI（register 予約タブ・§6 は別途 UI フェーズ）

モック（項目6）準拠＋確定要件の差分を吸収:
- **一覧**: 日時昇順フラットリスト。行＝時刻・表示名（customer名 or guest_name）・人数 / sub＝担当cast or 未定・卓(memo から)・備考 / status pill（booked=gold/visited=green/no_show/cancelled=gray）。
- **登録フォーム**: 日付・時刻（既定20:00）・**客指定（既存客 select + フリー入力トグル）**・人数（既定2）・担当cast select（未定=null）・**nom_type select（任意・未指定可）**・備考（卓希望含む）。
- **「来店済」ボタン**: reservation_to_check を呼ぶ（卓選択 UI＝p_seat_id + nom_type 確認/上書き）。★cast inactive で指名スキップ開店した場合の表示（「指名キャスト不在で開店しました」）。
- **「取消」ボタン**: reservation_set_status(cancelled)。
- **no_show**: 予約時刻を過ぎた booked に「no_show」ボタン（reservation_set_status(no_show)）。
- 可視: owner/manager/staff(can_crm) に予約タブ表示。cast は自分指名予約のみ（閲覧）。

★差分明示（モック→確定）: (a) customer 連動（select+フリー併存）(b) no_show 追加（4値）(c) 卓は memo (d) 来店済が伝票を開く。

---

## 6. verify（段19）

- **reservation_create 権限マトリクス**: owner/manager 自店/staff can_crm 成功・staff フラグなし forbidden・cast forbidden・anon BLOCKED・他店 forbidden
- **bad 系**: invalid store・invalid customer（他org/他店）・bad cast（他org/他店/inactive）・bad nom_type・bad people・reserved_at null
- **RLS 可視範囲**: owner 全・manager 自店・staff can_crm 自店全・staff フラグなし0行・cast 自分指名のみ・cast 未指名予約は見えない・他店0行
- **status CHECK 全値**: booked/visited/no_show/cancelled を実挿入（CHECK 通過）+ 不正値拒否
- **nom_type CHECK**: null + 4値 実挿入 + 不正値拒否
- **reservation_set_status 遷移**: booked→cancelled/no_show 成功・visited への手動遷移不可・cancelled/no_show からの復帰不可
- **★reservation_to_check（本命・結合）**:
  - 正常: booked 予約 → 空き卓 → check 開く・customer_id 引き継ぎ・指名1行・予約 status=visited・check_id 埋まる
  - seat occupied: 使用中卓 → 'seat occupied'
  - ★cast inactive: 指名 cast を退店させてから来店処理 → 指名スキップ・開店成功・check_nominations 0行・status=visited
  - nom_type 両対応: 予約 nom_type あり→引き継ぎ / 引数上書き / 両 null→free
  - 権限: can_register なし staff で reservation_to_check → 内側 check_open が forbidden
  - not bookable: visited 予約を再度 → 'not bookable' / cancelled 予約 → 'not bookable'
- **★visits 整合（束2 連動）**: visited 予約の check を close → 該当 customer の visits が +1（customer_summary RPC で確認）・no_show/cancelled は visits 不変
- **非干渉**: 生成 reservations/checks/nominations を try/finally 全消し・2連続全緑
- **grants G15**: 予約 RPC の ACL = authenticated・anon/public 不在・reservations policy=1（select のみ）

---

## 7. mig0027 起草指示（CC 向け）

1. **live 再確認**（軽微）: casts.is_active / checks の store_id 導出 / auth_cast_id() の casts+users join（項目5 で確認済みだが mig 直前再確認）。
2. **mig0027 起草**: reservations テーブル（CHECK 3本・index 2本）+ RLS select policy + 予約 RPC 5本（create/update/set_status/to_check、delete なし）+ grant/revoke。
   - ★reservation_to_check の definer チェーン（check_open + check_set_nominations 内部呼び）
   - ★発見1（seat occupied）・発見3（cast inactive 指名スキップ）を実装
   - ★status/nom_type CHECK・visited⇔check_id 整合
3. **相談役全文レビュー**（特に reservation_to_check のチェーン・seat occupied・cast inactive スキップ・可視範囲の店スコープ・遷移制約）。
4. Agoora 手貼り → 検証クエリ + prosrc + **notify pgrst reload schema**。
5. verify 段19（§6）→ 2連続。
6. UI（§5・register 予約タブ）→ 実機検証。
7. commit → push（phase-group）。

> launch は「全部整ってから」方針で急がない。

---

## 8. 実装完了記録（2026-07-10・CC 追記＝§7 手順1〜5 完了・残は手順6 UI と手順7 push）

### 8-A. mig0027 — dev 適用済み

- **構成**: reservations テーブル（CHECK 3本=status/nom_type/party_size・index 2本・touch_updated_at トリガ・
  標準型 grant=revoke all→select のみ）＋ RLS select policy 1本（reservations_select・§2 どおり）＋
  **RPC 4本**（reservation_create / reservation_update / reservation_set_status / reservation_to_check・
  delete は §3-E lock どおり不採用）＋ revoke public,anon + grant authenticated。
- 適用後検証 5項目 OK（orgs 着弾／4本シグネチャ一致／policy=1／anon exec=false／guards prosrc）＋
  `notify pgrst, 'reload schema'`（PostgREST キャッシュ・現物確認 項目4 副産物の手順化）。
- **確定版からの CC 追加/調整（mig0027 実装ノート【10】〜【15】・相談役承認）**:
  【10】to_check の seat.store_id=reservation.store_id 検証（フリー予約の他店卓誤接続封じ・§3-D 要点に追記）／
  【11】reservation_create の引数順（default 後置制約で必須2つを先頭へ・名前渡しで影響なし）／
  【12】guest_name は trim・空→null・80字上限／【13】updated_at はトリガ＋RPC 明示 set の併用／
  【14】audit 4本（create は before=null）／【15】reservation_update は全フィールド明示送信（規約7 の精神・null=クリア）。

### 8-B. verify 段19 — 13 assert 全 pass・verify:f0 1172 全緑（2連続一致）

| # | 実測結果 |
|---|---|
| 19-1 | to_check 正常＝definer チェーン実走・customer/people 引き継ぎ・指名1行・**visited⇔check_id 1:1** |
| 19-2 | 使用中卓 → 'seat occupied'（発見1） |
| 19-3 | **予約後に cast 退店 → 指名スキップで開店成功**・指名0行・visited（発見3＝営業を止めない） |
| 19-4 | nom_type 両対応＝引数 dohan＞予約 jonai／引数 null→予約値／両 null→free |
| 19-5 | visited からの再 to_check → 'not bookable' |
| 19-6 | can_register なし staff → 内側 check_open が**チェーン越しに forbidden** |
| 19-7 | **★【10】実発火**＝A1 フリー予約×A2 卓 → 'invalid store' |
| 19-8 | CHECK 全値実挿入 OK＋不正 status/nom_type/party_size=0 の拒否（runtime のみ表面化＝BANZEN 0067 対応） |
| 19-9 | 遷移制約＝booked→cancelled/no_show のみ・確定状態から bad transition・'visited'/'booked' 指定は bad status |
| 19-10 | **visits 整合**＝基準2（束2 ゴールデン一致）→予約→伝票→会計→close で **visits+1**・no_show は不変 |
| 19-11 | RLS＝owner org 3行／manager 自店2行／staff can_crm 2行／can_register のみ 0行／フラグなし 0行／**cast 自分指名の1行のみ（未指名不可視）**／他 org 0行 |
| 19-12 | **★wipe 順序**＝reservations.check_id が checks FK のため「check_id null 化→子→checks 削除」を wipe に組込・FK 違反なしを実証 |
| 19-13 | grants G15＝RPC 4本 ACL authenticated のみ・reservations policy=reservations_select 1本（G1/G2/G5 は TABLES 追加で自動回帰） |

- verify:f0 = **1172 全緑**（pay83/shift44/punch75/**anon391**/rls369/**grants104**/payroll106＝旧1117+55）を2連続で確認・カウント完全一致。
- **seed:f0 は不変**: 予約はステータス遷移で必ず変異するため常設 fixture にせず、段19 内で毎回 RPC/service 生成→
  try/finally 全消し（A2 卓・inactive 用ダミー cast も run 内生成→削除）。memberships 9行（org A 8＋org B 1）維持。

### 8-C. 残タスク

- §5 UI（register 予約タブ＝一覧・登録フォーム・来店済/取消/no_show ボタン・卓選択）→ 実機検証 → commit → **push（F3a-3 完結時にまとめて）**。
