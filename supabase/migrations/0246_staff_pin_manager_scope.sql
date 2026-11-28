-- 0246_staff_pin_manager_scope（相談役 11/27 11:15・決め a＝Agoora に確認中・相談役の推し・起草と試走まで・適用はしない）
--   当たり：set_staff_pin（最新 supabase/migrations/0201g_pin_device.sql:65）は相手の役割が owner・admin・manager・staff・（レジを許した）cast のどれでも通し、店長については自店かどうかだけを見る。
--     ＝店長が同じ店のほかの店長・管理者・オーナーの PIN を決められる。kiosk_login（0201r_kiosk_cast_pin_lock5.sql:51）は owner・admin の所属も PIN で通す＝店長がその人として店の端末に入る道があり得る
--     （staff_pin_unlock は owner の行を断る＝非対称）。docs/manual/起草の読み.md の頭の表 6・0226 の節 1。
--   決め a：店長が PIN を決められるのは自店のスタッフとキャストだけ（ほかの店長・管理者・オーナーは不可）。オーナーと管理者（auth_role()='owner'）は前と同じ。
--   中身（作り直し 1 本・同じ署名・CREATE OR REPLACE・ACL は今と同じ文で言い直す）：
--     set_staff_pin：権限の段の直後に `if public.auth_role() = 'manager' and v_mem.role not in ('staff', 'cast') then raise exception 'forbidden'; end if;` を足す。
--     ほかの段（'bad pin'・'not found'・'inactive membership'・'bad target'・自店でない店長の 'forbidden'・'pin weak'・'pin taken'・失敗回数とロックの戻し・監査）はそのまま。
--     店長が自分の行に set_staff_pin を呼ぶと forbidden になる（自分の PIN は本人の PIN の変更＝staff_pin_self_set）。
--   変えないもの：表・列・索引・ほかの関数（数を変えない＝当てる位置の関数 528・表 133 のまま・0231 の後）。staff_pin_unlock・set_cast_pin・kiosk_login は触らない。
--   翻訳元：本番の定義 set_staff_pin（md5(prosrc) 4566d20bb84f3cd40cbc2b07a47dbdfe・CR を除いて 3db0235b7405217a688e6df6a7c8be46・0201g と同じ本文＝docs/tmp/staff_pin_scope_1127/live/）。
--   当てた後の md5（CR を除いて）：70750adac0834e8e528024a7e15cf55c。本番の今の定義との差分：docs/tmp/staff_pin_scope_1127/diff_live.txt。
--   事前確認：docs/tmp/staff_pin_scope_1127/0246_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）。
--   検証クエリ（当てた後・先頭に貼り先証明 select 'nox-project-proof', count(*) from public.orgs）：docs/tmp/staff_pin_scope_1127/0246_verify.sql。
begin;
set local lock_timeout = '10s';

-- ═══ set_staff_pin（作り直し・同じ署名） ═══
CREATE OR REPLACE FUNCTION public.set_staff_pin(p_membership_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_org uuid := public.auth_org_id();
  v_mem record;
begin
  if v_org is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$'   /* ★0191（便 OB-2 ⑤）: PIN 4〜6 桁 */ then raise exception 'bad pin'; end if;
  -- memberships は org 列を持たない＝store 経由で org 照合（他 org は not found＝存在オラクル封じ）
  select m.id, m.store_id, m.role, m.is_active, m.can_register into v_mem
    from public.memberships m join public.stores s on s.id = m.store_id
   where m.id = p_membership_id and s.org_id = v_org;
  if v_mem.id is null then raise exception 'not found'; end if;
  if not v_mem.is_active then raise exception 'inactive membership'; end if;
  if not (v_mem.role in ('owner','admin','manager') or v_mem.role = 'staff' or (v_mem.role = 'cast' and v_mem.can_register)) then   -- ★3 0173（389 追補1）: ON のキャストにレジ端末の PIN・staff は can_register に関わらず（0174 の打刻端末 staff_punch＝PIN 照合・レジ候補は kiosk_login 側で can_register を見る）
    raise exception 'bad target';
  end if;
  if not (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_mem.store_id = public.auth_store_id())) then
    raise exception 'forbidden';
  end if;
  -- ★0246（決め a・相談役 11/27 の推し）: 店長が PIN を決められるのは自店のスタッフとキャスト（レジを許したキャスト）だけ＝ほかの店長・管理者・オーナーの PIN と店長自身の PIN はオーナーと管理者（auth_role()='owner'）だけ。
  --   店長が自分の PIN を変えるのは本人の PIN の変更（staff_pin_self_set＝24 時間に 5 回まで・失敗を数える）。前は相手の役割を見ず、店長がほかの店長・管理者の PIN を決めて店の端末でその人として入る道があった（kiosk_login は owner／admin の所属も PIN で通す）。
  if public.auth_role() = 'manager' and v_mem.role not in ('staff', 'cast') then raise exception 'forbidden'; end if;

  -- ★0201g（M-156・2026-11-11 Agoora 確定）: 推測されやすい PIN と同じ店の他の人の PIN は拒否（誰の PIN かは返さない）
  if public.pin_guessable(p_pin) then raise exception 'pin weak'; end if;
  if public.pin_taken_in_store(v_mem.store_id, p_pin, p_membership_id, null) then raise exception 'pin taken'; end if;

  insert into public.staff_pin (membership_id, org_id, store_id, pin_hash)
  values (p_membership_id, v_org, v_mem.store_id, crypt(p_pin, gen_salt('bf')))
  on conflict (membership_id) do update
    set pin_hash = excluded.pin_hash,
        store_id = excluded.store_id,
        fail_count = 0,
        locked_until = null,
        updated_at = now();

  perform public.audit_log_write('set_staff_pin', 'staff_pin:' || p_membership_id::text,
    null, jsonb_build_object('membership_id', p_membership_id, 'reset', true), v_mem.store_id);
end $function$;
revoke execute on function public.set_staff_pin(uuid, text) from public, anon;
grant execute on function public.set_staff_pin(uuid, text) to authenticated;

commit;
