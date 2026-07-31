-- mig0071: set_product の旧14引数版を削除する
-- 前提: mig0069 / mig0070 適用済み
--
-- ★背景（起草ミスの是正）:
--   CREATE OR REPLACE FUNCTION は引数の「数」が変わると置換ではなく新しい
--   オーバーロードを作る。mig0069 で p_back_exempt_from_split を足した結果、
--   set_product が 14引数版と15引数版の2本になった。
--   この状態では 12 引数の呼び出し（verify-nox-rls.ts の5箇所）が両候補に一致し、
--   function is not unique で落ちる。旧版を明示的に削除して1本に戻す。
-- ★冪等: if exists で存在確認してから drop する。

begin;

do $do$
begin
  if exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'set_product'
       and pronargs = 14
  ) then
    drop function public.set_product(
      uuid, uuid, text, text, text, integer, integer, text,
      integer, jsonb, integer, boolean, integer, uuid
    );
  end if;
end
$do$;

-- 残ったのが15引数版1本であることを保証（想定外なら適用を失敗させる）
do $do$
declare v_n int; v_args int;
begin
  select count(*) into v_n from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'set_product';
  if v_n <> 1 then
    raise exception 'set_product overload count = %, expected 1', v_n;
  end if;
  select pronargs into v_args from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'set_product';
  if v_args <> 15 then
    raise exception 'set_product pronargs = %, expected 15', v_args;
  end if;
end
$do$;

commit;
