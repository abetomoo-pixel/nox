-- =====================================================================
-- NOX mig0106  M-9 A1-a: 営業日切替時刻（settings_json.biz_cutoff_hm）の書込 RPC
--
-- 内容: set_store_biz_cutoff(p_store_id, p_hm) 新設。
--   - owner 限定（店ポリシー＝D3a・okuri_mode 等の settings_json RPC 5本と同格）
--   - 形式 'HH:MM'・範囲 03:00〜12:00（UI は 05/06/07/08 の4択・pages-2026-08 準拠）
--   - 帯ガード: pricing_rules の時間帯付き行（有効/無効とも）を set_pricing_rule と同じ式で
--     新 cutoff 下に再評価し、1行でも空帯/跨ぎになるなら 'band crosses cutoff' で拒否
--   - jsonb_set 方式・audit（旧値/新値）＝既存 settings_json RPC と同型
-- 仕様（明記）: 非凍結の集計（checks / payroll 窓 / punches / 予約可否）は新 cutoff で
--   再解釈される。daily_reports（cutoff ごと凍結）・receipt_issues は動かない。
--   dow_mask 付き帯は biz_dow が変わりうる（検証では捕まらない・注記で運用）。
-- 正本: docs/NOX_裁定台帳.md 裁定82（既定は現場運用・変更を禁じない）・起票#14
-- 不変: 既存関数・テーブル・ポリシーは不触。money 三面鏡不触
-- 冪等: create or replace（新規関数・overload なし）。ACL は revoke public/anon → grant authenticated
-- 単一トランザクション
-- =====================================================================
begin;

create or replace function public.set_store_biz_cutoff(p_store_id uuid, p_hm text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_store record;
  v_prev  text;
  v_cut   integer;
  v_bad   integer;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;
  if p_hm is null or p_hm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad cutoff'; end if;
  v_cut := split_part(p_hm, ':', 1)::int * 60 + split_part(p_hm, ':', 2)::int;
  if v_cut < 180 or v_cut > 720 then raise exception 'bad cutoff'; end if;   -- 03:00〜12:00
  select id, org_id, settings_json into v_store from public.stores where id = p_store_id;
  if v_store.org_id is null or v_store.org_id <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if public.auth_role() <> 'owner' then raise exception 'forbidden'; end if;  -- 店ポリシー＝owner 限定（D3a）

  -- 帯ガード（set_pricing_rule の検証式を新 cutoff で再評価・有効/無効とも対象＝保存済み行の不変条件を維持）
  select count(*) into v_bad
    from public.pricing_rules r
   where r.store_id = p_store_id
     and r.time_from_min is not null
     and (case when r.time_from_min <  v_cut then r.time_from_min + 1440 else r.time_from_min::int end)
      >= (case when r.time_to_min   <= v_cut then r.time_to_min   + 1440 else r.time_to_min::int   end);
  if v_bad > 0 then raise exception 'band crosses cutoff'; end if;

  v_prev := coalesce(nullif(trim(v_store.settings_json->>'biz_cutoff_hm'), ''), '06:00');
  update public.stores
     set settings_json = jsonb_set(coalesce(settings_json, '{}'::jsonb), '{biz_cutoff_hm}', to_jsonb(p_hm), true)
   where id = p_store_id;

  perform public.audit_log_write('set_store_biz_cutoff', 'stores:' || p_store_id::text,
    jsonb_build_object('biz_cutoff_hm', v_prev), jsonb_build_object('biz_cutoff_hm', p_hm), p_store_id);
end $function$;

revoke all on function public.set_store_biz_cutoff(uuid, text) from public, anon;
grant execute on function public.set_store_biz_cutoff(uuid, text) to authenticated;

commit;
-- ===== end mig0106 =====
