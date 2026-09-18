# 裁定253 D レーン調査（R6／R8／R11／R16）— 2026-09-14・読取のみ・HEAD d717734・実装なし

出典＝相談役ブロック 2026-09-14。live 逐語の生データ＝`docs/tmp/d_lane_dump.txt`（users／memberships／check_lines／seats の列・制約・index・set_seat 本文・RPC 署名）。何も変更していない。

## R6 スタッフ編集の項目追加

### 2. 列定義と CHECK（live）

- **users**（8 列）: id／org_id／auth_user_id（UNIQUE）／**email text NOT NULL**（UNIQUE (org_id, email)）／name（null 可）／is_active／created_at／updated_at。CHECK なし。
- **memberships**（13 列）: id／user_id／store_id／**role**（CHECK owner／manager／staff／cast）／is_active／created_at／updated_at／can_register／can_crm／can_shift／can_view_backs／can_close／can_reopen。UNIQUE (user_id, store_id)・部分 UNIQUE `memberships_one_active_per_user_idx`（user_id where is_active）。
- **メール**＝users.email のみ（auth.users の email と同値で持つ・route が作る）。**電話**＝無し（tel は customers にのみ）。**LINE 相当**＝無し（列名に line／tel／phone／email を含む public 列は approvals.line_id＝check_lines の id・customers.tel・users.email の 3 つだけ）。
- スタッフ作成時のメール発行＝`app/api/staff/create/route.ts`（POST・案B 即時作成）: ① guardStaffCreate（401→400→403）② 同 org に実 email が既存なら auth を作らず既存 auth_user_id で `staff_create` ③ 実 email が無ければ**合成 email** `s-<idem8>@o-<org8>.nox.local`（送信不能の予約ドメイン）④ 初期 PW 16 字を CSPRNG で生成し一度だけ返す ⑤ `admin.auth.admin.createUser({ email_confirm: true })` ⑥ 呼び出しユーザーのセッションで `staff_create(p_auth_user_id, p_email, p_name, p_store_id, p_role)` ⑦ RPC 失敗時は deleteUser で補償。同型＝`app/api/cast/invite/route.ts`（createUser／updateUserById で PW 再発行）・`app/api/kiosk/provision/route.ts`。

### 3. メールアドレスの変更経路

- **既存の口は無い**。auth.users を更新するのは `updateUserById`（cast/invite の PW 再発行・kiosk/provision の ban）だけで、email を更新する route・RPC は存在しない。staff 系 RPC は staff_create／staff_update_profile（**p_name のみ**）／staff_change_role／staff_transfer_store／staff_deactivate／staff_reactivate。
- 無い場合に必要なもの＝**service role の route 1 本**（`app/api/staff/email/route.ts` 相当: guard（owner∨manager 自店・org 照合）→ `admin.auth.admin.updateUserById(auth_user_id, { email, email_confirm: true })` → users.email を更新する小 RPC `staff_update_email(p_membership_id, p_email)`（UNIQUE (org_id, email) 衝突は 'duplicate email'・audit）→ 失敗時は auth 側を元の email に戻す補償）。auth と public の 2 箇所を持つため route＋RPC の組で、RPC 単独では書けない（auth.users は RPC から更新しない流儀）。

### 4. LINE の器

- **無し**。列なし・env キーなし（.env.local に LINE を含むキー 0）・route なし。コードの言及は「LINE 連携は T3 後送り」（casts-board 514）・notices の「LINE 実送信のみ無効化・数値は —」（notices-board 64〜200）のコメントのみ＝器を作っていない。

### 5. /staff 編集モーダルに足せる項目（3 分類）

| 分類 | 項目 | 根拠 |
|---|---|---|
| client のみで可 | 名前（既存）／ログイン ID の**表示**（users.email＝合成なら「未設定（合成 ID）」と注記）／役職・在籍・権限 6 フラグ（既存 RPC）／異動（既存） | 列と RPC が揃っている |
| RPC 追加が要る（mig 小） | **メールアドレスの変更**（route＋`staff_update_email` RPC＝§3）／初期 PW 再発行（cast/invite の reset と同型の route＝staff 版が無い・RPC 不要で route のみ） | auth 更新は route、public 更新は RPC |
| mig が要る（列追加） | 電話番号（users.tel）／LINE ID（users.line_id・器のみ）／表示名・ふりがな（users.kana）／メモ | users に列が無い。追加時は列＋staff_update_profile の引数追加（原則7＝null→現値保持の明示）＋audit before/after |

判定＝**R6 は「メール変更」を核にすると route＋RPC（mig 1 本・小）。電話／LINE を足すなら同じ mig に列追加を同梱**。client のみで先行できるのはログイン ID の表示だけ。

## R8 ボトルキープの検索付きモーダル

### 6. 現行実装

- 実装＝`app/(manage)/register/bottle-keep-panel.tsx`（100 行・会計タブ内 section）。顧客 select＝**customers の直 SELECT**（`from("customers").select("id, name").order("name")`・RLS＝owner/manager＋staff∧can_crm・**上限なし＝全件**）。ボトル select＝props の `products` を `type === "bottle"` で絞る（page が渡す products＝店の全商品・上限なし）。登録＝`bottle_keep_register(p_store_id, p_customer_id, p_product_id, p_note, p_remaining_pct, p_expires_on, p_shelf_no)`（panel は前 4 引数のみ渡す）。一覧＝bottle_keeps（status='active'・最新 30 件）。
- 顧客側の編集＝customers-board 732〜770 の `bottle_keep_update`（Modal 済み・5 値素通し）。

### 7. 流用できる検索付き選択

- **`components/nox/cast-picker.tsx`**（CastPicker・23〜48 行の props＝casts／photoUrls／selectedIds／onPick／chips／dense…・50 行目 `q` で名前検索・68 行目 placeholder「キャストを検索」）。使用箇所＝register-board／reservation-panel／shift-board／shift-add-form／stock-board。**キャスト専用の型（PickerCast・バッジ群）なので顧客にはそのまま使えない**が、「検索欄＋絞込チップ＋カードグリッド＋onPick」の骨格は同じ。
- 顧客側の検索＝customers-board 390〜 の `q`（名前で検索）＋担当チップ（client のみ・list_summary RPC の全件を絞る）。商品側＝products-board の検索（`nox-ptable` の絞込）。
- 推奨＝汎用 `PickerModal<T>`（Modal 部品＋検索 input＋候補リスト＋onPick・型引数で顧客／商品）を components/ui に 1 本起こし、bottle-keep-panel の 2 つの select を「選択ボタン→モーダル」に置換。データ源は現行どおり（customers 直 SELECT・products props）で件数上限を設けない代わりに検索で絞る（RLS 越しの全件は現状と同じ）。

判定＝**client のみで可**（RPC・mig 不要）。汎用ピッカー部品 1 本＋panel 1 本の置換＝client 1 本。

## R11 キャッチ紹介料

### 8. check_lines の列と CHECK（live・20 列）

- kind CHECK＝set／time／charge／drink／champ／bottle／custom／discount。fee_kind CHECK＝set／extension／dohan／hon_shimei／jonai_shimei／ext_shimei／vip_charge（null 可）。
- 金額列＝`unit_price_snapshot`（≥0）／`qty`（>0）／`line_total`（≥0）。**メモ列は無い**（name_snapshot が明細名・80 字まで）。cast_id（FK casts・null 可・dohan は必須）・product_id・pay_group・back_snapshot（jsonb）・tax_category・time_auto／block_no・idem_key。
- 紹介者を記録する列の候補＝(a) **`referrer_cast_id uuid null references casts(id)`＋`referrer_user_id uuid null references users(id)`＋`referrer_name text null`**（自店＝キャスト／黒服のどちらか 1 つ・外部＝自由入力の 3 列・CHECK「kind='referral' のときは 3 つのうち 1 つ以上」）、(b) `referrer jsonb`（{kind:'cast'|'staff'|'external', id, name}）1 列＝集計が jsonb 演算になる。**推奨 (a)**（集計・FK・index が素直）。kind に `'referral'` を足す（CHECK 更新＝教訓50 の 3 点セット確認: check_lines の kind CHECK・fee_kind 白名単は無関係・pricing_resolve_core は不関与）。

### 9. 明細を追加する RPC

- `check_add_line(p_check_id, p_product_id, p_qty, p_kind, p_pay_group, p_name, p_unit_price) → uuid`。product_id null のとき **p_kind は set／time／charge／custom のみ**（50 行目）・p_name 1..80 必須・p_unit_price ≥0・line_total＝price×qty・back_snapshot null（56 行目）。register-board 913〜925 `addCustomLine` が `p_kind: cKind`（charge／time／custom）で呼ぶ＝カスタム明細の経路。
- 紹介料を「金額×人数」で入れるなら **qty＝人数・unit_price＝単価** で既存の line_total 式に乗る。ただし kind を 'referral' にするには check_add_line の白名単追加＋紹介者 3 引数の追加（署名変更＝prosrc 全走査の教訓・既存呼び出し 4 箇所は既定値で後方互換）か、**専用 RPC `check_add_referral(p_check_id, p_pay_group, p_unit_price, p_qty, p_referrer_cast_id, p_referrer_user_id, p_referrer_name)`** を新設する方が既存経路を汚さない（推奨）。

### 10. 明細から casts／memberships を参照する既存列・外部自由入力の前例

- **cast_id**（check_lines.cast_id・FK casts・dohan 行は必須・指名系 fee_kind の按分に使用）が唯一。memberships／users を明細から参照する列は無い。
- 外部の自由入力を持つ列の前例＝**無し**（name_snapshot は明細名であり人物ではない・customers.name／memo は顧客側）。紹介者の外部自由入力は referrer_name text が初例になる。

### 11. 分析の板

- analytics-board が呼ぶ RPC＝customer_list_summary／get_cast_customer_ranking／get_cast_ranking／get_cast_sales／get_store_nom_counts／store_category_aggregate（p_store_id, p_from, p_to）／store_cohort_aggregate／store_hourly_aggregate／store_sales_target_set。**紹介料を集計する RPC は無い**。store_category_aggregate は kind 別（drink／champ／bottle／time／set…）の Σ＝kind 'referral' を足せば「紹介料の合計」だけは既存 RPC の改修で拾える。
- 「紹介者別（誰が何人・いくら）」は check_lines の直 SELECT（RLS＝owner 全店／manager 自店・cast は自分の cast_id 行のみ）で client 集計が可能だが、月次で行数が増える表の無制限 select は教訓35 に当たる。**新 RPC `store_referral_aggregate(p_store_id, p_from, p_to) → (referrer_kind, referrer_id, referrer_name, heads, amount)`** を推奨（B6-1 の「新しい集計の定義は作らない」は B6 の範囲＝R11 は新機能なので別裁定で定義する）。

判定＝**mig 1 本（check_lines に 3 列＋kind 'referral'＋専用 RPC check_add_referral＋集計 RPC）＋client 2 本（register の紹介料入力・analytics の節）**。裁定（列の形・集計の出口・cast への可視範囲）を先に。

## R16 席の並べ替え

### 12. set_seat（live 逐語）と seats

- 署名 `set_seat(p_id uuid, p_store_id uuid, p_name text, p_kind text, p_sort_order integer, p_is_active boolean) → uuid`。本文＝auth_org_id null→forbidden／billing_writable_of／name 1..40／kind CHECK 3 種／**sort_order null または <0 は 'bad sort'**／org 照合／owner ∨ manager 自店／p_id null→insert・非 null→update（before を to_jsonb で控え audit）。全文は d_lane_dump.txt。
- seats（9 列）: sort_order integer NOT NULL default 0・**CHECK なし・UNIQUE なし**（index は seats_store_idx (store_id, sort_order)＝非 unique）。同値の sort_order は許される＝B レーンの「同値なら隣∓1」も制約に当たらない。kind CHECK＝卓／カウンター／VIP。

### 13. reorder RPC の最小形（素案）

```sql
-- seat_swap_order(p_a uuid, p_b uuid): 同店 2 席の sort_order を 1 トランザクションで交換（同値なら b を a+1 に）
create or replace function public.seat_swap_order(p_a uuid, p_b uuid) returns void
 language plpgsql security definer set search_path to 'public' as $$
declare v_a public.seats; v_b public.seats; v_org uuid := public.auth_org_id();
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  select * into v_a from public.seats where id = p_a and org_id = v_org for update;
  select * into v_b from public.seats where id = p_b and org_id = v_org for update;
  if v_a.id is null or v_b.id is null or v_a.store_id <> v_b.store_id then raise exception 'not found'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_a.store_id = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if v_a.sort_order = v_b.sort_order then
    update public.seats set sort_order = v_a.sort_order + 1 where id = p_b;   -- 同値は b を後ろへ
  else
    update public.seats set sort_order = v_b.sort_order where id = p_a;
    update public.seats set sort_order = v_a.sort_order where id = p_b;
  end if;
  perform public.audit_log_write('seat_swap_order', 'seats:' || p_a::text,
    jsonb_build_object('a', v_a.sort_order, 'b', v_b.sort_order),
    (select jsonb_build_object('a', a.sort_order, 'b', b.sort_order) from public.seats a, public.seats b where a.id = p_a and b.id = p_b),
    v_a.store_id);
end $$;
revoke execute on function public.seat_swap_order(uuid, uuid) from public, anon;
grant execute on function public.seat_swap_order(uuid, uuid) to authenticated;
```

- 既存の reorder 契約（product_category_reorder 等＝全件 id 配列を 1..N に再採番）へ寄せるなら `seat_reorder(p_store_id uuid, p_ids uuid[])` 1 本の方が lib/nox/ui/reorder.ts（swapAdjacent／reorderErrJa）と同じ流儀で client を書ける＝**こちらを本命**（B レーンの client は swapAdjacent＋seat_reorder に差し替えるだけ）。課金ゲート（billing_writable_of）と正本 A6／A8 への登録・anon-guard probe・f0 pin 波及（billing 4 pin＋1）を同梱。
- 判定＝**mig 1 本（seat_reorder＋正本登録）＋client 1 本（seats-board の moveSeat を seat_reorder へ）**。

## 判定と着手順

| 課題 | 判定 | 規模 |
|---|---|---|
| R8 ボトルキープ検索モーダル | **client のみ** | 汎用ピッカー部品 1＋panel 置換＝client 1 本 |
| R16 席 reorder | **mig 1（seat_reorder）＋client 1** | 小。正本 A 登録＋anon-guard probe＋billing pin |
| R6 スタッフ編集項目 | **route＋RPC（mig 小）**。列追加（電話／LINE）は同梱可 | メール変更＝route＋staff_update_email。ログイン ID 表示だけなら client のみ |
| R11 紹介料 | **裁定 → mig 1（列 3＋kind＋RPC 2）＋client 2** | 最大。列の形・集計の出口・cast 可視範囲を先に裁定 |

推奨順＝**R8（client のみ・実機の不便が大きい）→ R16（小 mig・B レーンの非原子を解消）→ R6（route＋RPC・メール変更の設計 1 点）→ R11（裁定が要る）**。
