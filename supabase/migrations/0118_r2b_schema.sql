-- mig 0118 NOX: 裁定100-A R-2b 器（挙動ゼロ変更・RPC 不触）v2
--   check_nominations に nom_kind / is_dohan、親 checks.nom_type から backfill（1バイト同値）
--   stores.dohan_auto_hon（同伴時の本指名自動付与・裁定75）
--   ※v1 にあった check_lines の shimei unique / dohan cast CHECK は新規 INSERT に即時強制されるため
--     0119（RPC 改修）へ同梱（dev では v1 適用後に手動 drop 済み・2026-09-01）
--   ※(check_id, cast_id) unique は既存制約 check_nominations_check_id_cast_id_key が正本＝本 mig では作らない
-- 冪等: 可。backfill は 0119 適用前に1回のみ（0119 後は nom_type が派生サマリになるため再実行禁止）
-- 本番注意: 本番 DB は空から構築＝backfill は無効果。順序どおり 0119 の前に適用すること。
begin;

alter table public.check_nominations
  add column if not exists nom_kind text not null default 'free',
  add column if not exists is_dohan boolean not null default false;

alter table public.check_nominations drop constraint if exists check_nominations_nom_kind_check;
alter table public.check_nominations
  add constraint check_nominations_nom_kind_check check (nom_kind in ('hon','jonai','free'));

comment on column public.check_nominations.nom_kind is '裁定100: キャスト別指名種別 hon/jonai/free（同伴は is_dohan の別軸）';
comment on column public.check_nominations.is_dohan is '裁定100: 同伴フラグ（hon と同時成立可・裁定86-④）';

update public.check_nominations n
   set nom_kind = case c.nom_type when 'hon' then 'hon' when 'jonai' then 'jonai' else 'free' end,
       is_dohan = (c.nom_type = 'dohan')
  from public.checks c
 where c.id = n.check_id
   and n.nom_kind = 'free' and n.is_dohan = false
   and c.nom_type in ('hon','jonai','dohan');

-- v1 で作った冗長 uidx の整理（既存制約が正本）
drop index if exists public.check_nominations_check_cast_uidx;

alter table public.stores add column if not exists dohan_auto_hon boolean not null default false;
comment on column public.stores.dohan_auto_hon is '裁定100/75: 同伴時に指名種別 free を hon へ自動昇格（jonai 明示は昇格しない）';

notify pgrst, 'reload schema';
commit;
