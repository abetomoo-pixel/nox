-- mig 0123 NOX: check_set_nominations で weight 0 を許可・名簿あり∧合計 0 は拒否（裁定110）
-- 前提: mig0121 適用済み（free 均等固定は撤去済み）
-- 底本: live pg_get_functiondef（docs/tmp/live_csn.sql sha256 481190a1…7b1711）＋0121 の差替え。本 mig の差替えは3箇所
--   (a) declare に v_sumw numeric := 0 を追加
--   (b) 検証 v_w < 1 → v_w < 0（0 を許可・小数は据え置き拒否）＋ loop 内で v_sumw 加算
--   (c) loop 後: v_pos > 0 and v_sumw = 0 → 'bad weight'（分母ゼロ防止。空配列＝名簿クリアは許可）
-- 署名 (uuid, jsonb) 不変 → create or replace は同一関数の置換＝ACL 保存
-- 冪等: 可
-- 裁定110: ％（weight）は金額按分の取り分。0 の行は按分を受けず、端数（+1）も受けない
--   （check_close／cast_sales_aggregate／sales-alloc.ts の最大剰余法は rem=0 に +1 が届かない＝不触）。
--   種別・同伴の本数計上は weight 非依存（裁定105）＝0% の場内・フリーも名簿行として本数・在席は立つ

begin;

CREATE OR REPLACE FUNCTION public.check_set_nominations(p_check_id uuid, p_nominations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chk record; v_before jsonb; v_after jsonb;
  v_elem jsonb; v_cast record; v_w numeric; v_pos int := 0; v_cast_id uuid;
  v_org uuid;  -- ★0057(2)
  v_kind text; v_dohan boolean; v_auto boolean; v_summary text;  -- ★0119 裁定100
  v_sumw numeric := 0;  -- ★0123 裁定110: 合計 0 ガード
begin
  -- ★0057(1)
  if public.auth_org_id() is null and public.auth_kiosk_register_store_id() is null then
    raise exception 'forbidden';
  end if;
  v_org := coalesce(public.auth_org_id(), public.auth_kiosk_org_id());  -- ★0057(2)
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if p_nominations is null or jsonb_typeof(p_nominations) <> 'array' then raise exception 'bad nominations'; end if;
  select * into v_chk from public.checks where id = p_check_id;
  if v_chk.id is null or v_chk.org_id <> v_org then raise exception 'forbidden'; end if;
  if (public.auth_role() = 'owner'
          or (public.auth_role() = 'manager' and v_chk.store_id = public.auth_store_id())
          or (public.auth_role() = 'staff' and v_chk.store_id = public.auth_store_id()
              and public.auth_staff_can_register())
          or (public.auth_role() = 'cast' and v_chk.store_id = public.auth_store_id()
              and public.auth_cast_can_register())
          -- ★0057(3): kiosk 腕
          or (v_chk.store_id = public.auth_kiosk_register_store_id()
              and public.auth_kiosk_operator() is not null)) is not true then
    raise exception 'forbidden';
  end if;
  if v_chk.status <> 'open' then raise exception 'not open'; end if;

  v_before := jsonb_build_object('nom_type', v_chk.nom_type, 'nominations',
    (select coalesce(jsonb_agg(jsonb_build_object('cast_id', cast_id, 'weight', ratio_weight, 'nom_kind', nom_kind, 'is_dohan', is_dohan) order by position), '[]'::jsonb)
       from public.check_nominations where check_id = p_check_id));

  select st.dohan_auto_hon into v_auto from public.stores st where st.id = v_chk.store_id;  -- ★0119
  delete from public.check_nominations where check_id = p_check_id;
  for v_elem in select * from jsonb_array_elements(p_nominations)
  loop
    if jsonb_typeof(v_elem) <> 'object' then raise exception 'bad nominations'; end if;
    if jsonb_typeof(v_elem -> 'weight') is distinct from 'number' then raise exception 'bad weight'; end if;
    v_w := (v_elem ->> 'weight')::numeric;
    if v_w < 0 or v_w <> trunc(v_w) then raise exception 'bad weight'; end if;  -- ★0123 裁定110: 0 を許可（小数は拒否）
    v_sumw := v_sumw + v_w;
    -- ★0119 裁定100: キャスト別種別（hon/jonai/free）と同伴（別軸）
    v_kind := coalesce(v_elem ->> 'nom_kind', 'free');
    if v_kind not in ('hon','jonai','free') then raise exception 'bad nom_kind'; end if;
    if (v_elem ? 'is_dohan') and jsonb_typeof(v_elem -> 'is_dohan') <> 'boolean' then raise exception 'bad is_dohan'; end if;
    v_dohan := coalesce((v_elem ->> 'is_dohan')::boolean, false);
    if coalesce(v_auto, false) and v_dohan and v_kind = 'free' then v_kind := 'hon'; end if; -- 同伴時の本指名自動付与（jonai 明示は昇格しない）
    -- ★0121 裁定107: 「free は均等（weight=1 固定）」検証を撤去。種別と weight（金額按分）は独立（裁定105）
    v_cast_id := (v_elem ->> 'cast_id')::uuid;
    select * into v_cast from public.casts where id = v_cast_id;
    if v_cast.id is null or v_cast.org_id <> v_org
       or v_cast.store_id <> v_chk.store_id or not v_cast.is_active then
      raise exception 'bad cast';
    end if;
    if exists (select 1 from public.check_nominations where check_id = p_check_id and cast_id = v_cast_id) then
      raise exception 'dup cast';  -- 名簿は 1伝票×1キャスト 1行（種別と同伴は行の属性）
    end if;
    insert into public.check_nominations (org_id, store_id, check_id, cast_id, ratio_weight, position, nom_kind, is_dohan)
    values (v_chk.org_id, v_chk.store_id, p_check_id, v_cast_id, v_w::int, v_pos, v_kind, v_dohan);
    v_pos := v_pos + 1;
  end loop;
  if v_pos > 0 and v_sumw = 0 then raise exception 'bad weight'; end if;  -- ★0123 裁定110: 名簿あり∧合計 0＝分母ゼロは拒否（空配列は許可）
  v_summary := public.nom_type_summary(p_check_id);  -- ★0119: checks.nom_type は派生サマリ（正本は名簿行）
  update public.checks set nom_type = v_summary where id = p_check_id;

  v_after := jsonb_build_object('nom_type', v_summary, 'nominations', p_nominations);
  perform public.audit_log_write('check_set_nominations', 'checks:' || p_check_id::text,
    v_before, v_after, v_chk.store_id);
end $function$;

comment on function public.check_set_nominations(uuid, jsonb) is
  'mig0123 裁定110: 名簿全置換。weight は 0 以上の整数（0＝按分なし・端数も受けない）・名簿あり∧合計 0 は拒否。種別・同伴は行属性';

commit;

-- ===== 検証バンドル（Ctrl+A → Run・1結果セット・7行すべて報告） =====
-- 期待: ord1=1／ord2=2／ord3=true／ord4=true／ord5=true／ord6=（0121 と同じ ACL）／ord7=true
with f as (
  select p.oid, p.pronargs, p.proacl, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'check_set_nominations'
)
select 1 as ord, 'overloads'        as item, count(*)::text as val, (count(*) = 1) as ok from f
union all
select 2, 'pronargs',         pronargs::text, pronargs = 2 from f
union all
select 3, 'zero_allowed',     (def like '%v_w < 0 or v_w <> trunc(v_w)%')::text, def like '%v_w < 0 or v_w <> trunc(v_w)%' from f
union all
select 4, 'old_check_absent', (def not like '%v_w < 1 or v_w <> trunc(v_w)%')::text, def not like '%v_w < 1 or v_w <> trunc(v_w)%' from f
union all
select 5, 'sum_guard',        (def like '%v_pos > 0 and v_sumw = 0 then raise%')::text, def like '%v_pos > 0 and v_sumw = 0 then raise%' from f
union all
select 6, 'proacl',           coalesce(proacl::text, '(null)'), true from f
union all
select 7, 'comment_0123',     (obj_description(oid, 'pg_proc') like '%0123%')::text, obj_description(oid, 'pg_proc') like '%0123%' from f
order by ord;
