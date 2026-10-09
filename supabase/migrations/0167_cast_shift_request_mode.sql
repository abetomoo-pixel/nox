-- 0167_cast_shift_request_mode.sql
-- マイグレーション名: 0167_cast_shift_request_mode（裁定337＝シフト希望の方式をキャスト別に上書き可・便 X-13d-2a 起草・2026-10-09・適用は Agoora 手貼り）
-- 生成: 手書き（写経元＝0166 set_product_track_stock の規則A形と 0122 set_cast_profile の権限形・既存関数は不触）。検証クエリは末尾。
--
-- 器:
--   ★1 casts.shift_request_mode text null＝キャスト個別のシフト希望の方式。NULL＝店の既定（stores.settings_json.shift_request_mode・0160）に従う／
--        'shift'＝出たい日と時間を提出／'off_only'＝休み希望だけ提出（lib/nox/mine/wish-mode.ts の WishMode と同じ 2 値）。
--        CHECK は NULL を明示して許す（★教訓100: 正規表現／IN の CHECK は NULL を素通りする＝ここでは「NULL＝既定」が仕様なので is null を書いて意図を残す）。
--        既存行は NULL のまま＝挙動不変（/mine は「キャスト個別→店の既定」で解決＝裁定337・client は d-2b）。
--   ★2 新規 RPC set_cast_shift_request_mode(p_cast_id uuid, p_mode text) returns void＝課金ゲート内蔵（規則A形）・owner ∨ manager 自店・cast は forbidden・
--        p_mode は null（店の既定に戻す）／'shift'／'off_only' だけ（他は 'bad mode'）・変更なしは no-op（監査も書かない）・
--        変更時は casts.shift_request_mode を更新し audit_log_write('set_cast_shift_request_mode', 'casts:<id>', before, after, store_id)。
--        set_cast_profile／set_cast_plan は不触＝署名変更なし。
--   ★3 grants: public／anon revoke・authenticated grant（公開 RPC）。名簿 A（キャスト管理）+1＝304→305・'billing locked' 155→156。
--
-- demo 表への影響: casts に NULL 可の列が増える＝demo_org_reset の jsonb_populate_recordset は欠けた列を NULL にする＝そのまま「店の既定」。
--   裁定337 のデモ（3 方式が混ざる payload）は本 mig 適用後の d-2b で入れる（本便は payload 不触）。
--
-- 名簿・suite への影響（手貼り後の suite 便＝P167 で反映）: 関数 304 → 305（公開・ゲート内蔵＝名簿 A +1）。表 83 不変。
--   pin が変わる suite: billing（対象 155→156・全数 304→305・形 156・述語参照 157）／anon-guard（probe +1＝anon BLOCKED）／grants（G4d 新 RPC の ACL）／0158（関数数）／store-systems 不変。
--
-- 検証クエリ（Run 後・下の commit; の後ろ・貼り先証明を先頭に・値は形だけ返す）:
--   select 'nox-project-proof', count(*) from public.orgs;                                                                                         -- 9
--   select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='casts' and column_name='shift_request_mode';   -- text／YES／null
--   select pg_get_constraintdef(oid) from pg_constraint where conname='casts_shift_request_mode_check';                                              -- CHECK ((shift_request_mode IS NULL) OR (shift_request_mode = ANY (ARRAY['shift','off_only'])))
--   select count(*) filter (where shift_request_mode is null) as null_count, count(*) as total from public.casts;                                   -- null_count＝total（既存は全部 NULL）
--   select left(md5(replace(prosrc, E'\r', '')),8) from pg_proc where proname='set_cast_shift_request_mode';                                        -- 新設（md5 は手貼り案内の値）
--   select prosrc like '%billing locked%' from pg_proc where proname='set_cast_shift_request_mode';                                                 -- true
--   select (select count(*) from pg_proc where pronamespace='public'::regnamespace) functions, (select count(*) from pg_tables where schemaname='public') tables;   -- 305／83
begin;

-- ★1 casts.shift_request_mode（NULL＝店の既定に従う・CHECK は NULL を明示）
alter table public.casts add column if not exists shift_request_mode text null;
alter table public.casts drop constraint if exists casts_shift_request_mode_check;
alter table public.casts add constraint casts_shift_request_mode_check check (shift_request_mode is null or shift_request_mode in ('shift','off_only'));
comment on column public.casts.shift_request_mode is '0167（裁定337）: キャスト個別のシフト希望の方式。NULL＝店の既定（settings_json.shift_request_mode）に従う／shift＝出たい日と時間を提出／off_only＝休み希望だけ提出';

-- ★2 set_cast_shift_request_mode（公開 RPC・課金ゲート内蔵・owner ∨ manager 自店・監査）
create or replace function public.set_cast_shift_request_mode(p_cast_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid;
  v_store  uuid;
  v_before text;
begin
  if public.auth_org_id() is null then raise exception 'forbidden'; end if;
  if p_cast_id is null then raise exception 'bad args'; end if;
  if p_mode is not null and p_mode not in ('shift','off_only') then raise exception 'bad mode'; end if;
  select c.org_id, c.store_id, c.shift_request_mode into v_org, v_store, v_before from public.casts c where c.id = p_cast_id;
  if v_org is null or v_org <> public.auth_org_id() then raise exception 'forbidden'; end if;
  if not (public.auth_role() = 'owner' or (public.auth_role() = 'manager' and v_store = public.auth_store_id())) then raise exception 'forbidden'; end if;
  if not public.billing_writable_of(v_org) then raise exception 'billing locked'; end if;
  if v_before is not distinct from p_mode then return; end if;  -- 変更なし（NULL 同士を含む）＝no-op（監査も書かない）
  update public.casts set shift_request_mode = p_mode, updated_at = now() where id = p_cast_id;
  perform public.audit_log_write('set_cast_shift_request_mode', 'casts:' || p_cast_id::text,
    jsonb_build_object('shift_request_mode', v_before), jsonb_build_object('shift_request_mode', p_mode), v_store);
end $$;

-- ★3 grants（公開 RPC＝public／anon revoke・authenticated grant）
revoke all on function public.set_cast_shift_request_mode(uuid, text) from public, anon;
grant execute on function public.set_cast_shift_request_mode(uuid, text) to authenticated;

commit;
-- ===== end 0167 =====
