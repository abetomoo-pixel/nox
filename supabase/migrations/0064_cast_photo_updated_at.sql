-- mig0064_cast_photo_updated_at.sql
-- 段P: キャスト写真。URL は保存しない（パス規約 {org_id}/{cast_id}.jpg で導出）。
-- photo_updated_at = 「写真あり」判定 兼 キャッシュバスター。
-- Storage 側（バケット cast-photos + storage.objects ポリシー）は Dashboard で作成（別手順）。
-- 冪等: 再実行可

begin;

alter table public.casts
  add column if not exists photo_updated_at timestamptz;

comment on column public.casts.photo_updated_at is
  '段P: キャスト写真の最終更新時刻。null=写真なし。実体は Storage cast-photos/{org_id}/{cast_id}.jpg';

commit;
