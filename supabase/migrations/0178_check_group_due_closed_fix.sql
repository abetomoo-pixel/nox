-- 0178_check_group_due_closed_fix.sql — 便 ON-1（2026-10-26 起草・適用は Agoora 手貼り）: 0175 v2 ★29（裁定424 候補）の欠陥修正＝check_group_due が closed の伝票で丸め設定を NULL にしていた
-- 翻訳元: live（nox 本番 ref hiqbfagmkrdpmlqhkmsu・2026-10-26 読取＝pg_get_functiondef・md5 ea7754a9＝0175 v2 適用後の値）に★差分 1 か所（手打ちなし・生成＝docs/tmp/gen_0178.cjs 相当の node 置換）。
--   ★1 check_group_due: ★29 の「開いている伝票は stores の丸めを読む」の select … into は、closed（該当行なし）だと v_unit／v_mode を NULL で上書きしていた
--      → check_round_amount(…, NULL, NULL) が NULL → cast_sales_aggregate の g.due > 0 で確定済み伝票の売上が 0（キャスト売上・ノルマ・歩合・スライドが全部 0）・demo 6 店の closed 5,176 件で due NULL を実測（2026-10-26 11:3x JST）。
--      直し＝作業変数 v_unit2／v_mode2 に受け、if found のときだけ v_unit／v_mode を上書き（open＝店の現在値・closed＝凍結値＝★29 の意図どおり）。他は 1 バイトも変えない。
--   触らないもの: ACL（内部専用＝postgres のみ・CREATE OR REPLACE は proacl を保つ＋念のため 4 ロール revoke）・引数・STABLE SECURITY DEFINER・search_path。
-- 検証（Success の後・別実行・select だけ）: 末尾 ===== verify =====。期待＝md5 dc4163e6・demo の closed で due NULL 0 件・verify_0175_0176.sql の md5 pin は check_group_due だけ dc4163e6 に張替え（docs/demo/verify_0175_0176.sql 同梱）。
begin;
select 'nox-project-proof', count(*) from public.orgs;   -- 貼り先証明（nox 本番＝9 行）

-- ═══ ★1 check_group_due（ea7754a9 → dc4163e6） ═══
CREATE OR REPLACE FUNCTION public.check_group_due(p_check_id uuid, p_pay_group text, p_exclude_pay_fee boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rate int; v_unit int; v_mode text; v_bx int; v_disc int; v_net int;
  v_unit2 int; v_mode2 text;  -- ★0178: open のときだけ上書きする作業変数
  v_bts text; v_pd text; v_trnd text;  -- ★mig0113: 凍結税設定
  v_bx10 int; v_bx8 int; v_sv int; v_base10 int; v_tax int;  -- ★mig0113: 外税分岐
  v_ref int := 0;  -- ★12 0152（裁定298-9）: burden='customer' の紹介料（pay_group 'A'・taxable_10 の母数に加算）
  v_pf int := 0;   -- ★6 0173（裁定393）: 手数料行の合計（サ料の母数から除く・税の母数には乗る＝内税対象）
begin
  select service_rate, round_unit, round_mode,
         business_tax_status, price_display, tax_rounding  -- ★mig0113
    into v_rate, v_unit, v_mode, v_bts, v_pd, v_trnd
    from public.checks where id = p_check_id;
  if not found then raise exception 'not found'; end if;
  -- ★29 0175 v2（裁定424 候補・便 SH-UI-c2 C2-16）: 端数調整（丸め単位・丸め方）は凍結しない＝開いている伝票は店設定の現在値を読む（税率・サ料・外税／内税は凍結値のまま）。確定済み（closed）は凍結値＝確定時の額のまま
  -- ★0178（便 ON-1・2026-10-26）: 0175 ★29 の欠陥＝closed（該当行なし）のとき select … into が v_unit／v_mode を NULL にし、確定済み伝票の due が NULL（cast_sales_aggregate の g.due > 0 で売上 0・demo 6 店 5,176 件で実測）→ 行があるときだけ上書き
  select s.round_unit, s.round_mode into v_unit2, v_mode2
    from public.checks c join public.stores s on s.id = c.store_id
   where c.id = p_check_id and c.status = 'open';
  if found then v_unit := v_unit2; v_mode := v_mode2; end if;
  -- 通常小計（割引前・discount line を除外）
  select coalesce(sum(line_total), 0)::int into v_bx
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount'
     and (not p_exclude_pay_fee or fee_kind is distinct from 'pay_fee');   -- ★12 0152（裁定298-8）: 0148 ★10 の referral 除外を削除（kind 'referral' は CHECK から撤去）・★6 0173: 除外指定
  if not p_exclude_pay_fee then
    select coalesce(sum(line_total), 0)::int into v_pf
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and fee_kind = 'pay_fee';   -- ★6 0173
  end if;
  -- ★12 0152（裁定298-9）: burden='customer' の紹介料は pay_group 'A' の小計（サ料・税の母数）に加算（burden='store' は乗らない）
  if p_pay_group = 'A' then
    select coalesce(sum(amount), 0)::int into v_ref
      from public.check_referrals
     where check_id = p_check_id and burden = 'customer';
    v_bx := v_bx + v_ref;
  end if;
  -- 割引合計（正の値で格納された discount line の合計）
  select coalesce(sum(line_total), 0)::int into v_disc
    from public.check_lines
   where check_id = p_check_id and pay_group = p_pay_group and kind = 'discount';
  v_net := greatest(0, v_bx - v_disc);   -- 過剰割引でも負にしない（0 clamp）
  if v_net = 0 then return 0; end if;     -- 旧 v_bx=0 と等価（discount 無しなら v_net=v_bx）
  -- ★mig0113: 外税（tax_excluded × taxable のみ）。内税/exempt は下の従来行＝1バイト不変。
  --   規則（設計書 v1 §3 細則）: 税率別に check_tax_round を1回ずつ（伝票×税率×1回＝T5）。
  --   discount は taxable_10 基底へ適用（clamp・8% への按分は F5）。サ料は taxable_10 基底（T6）。
  --   exempt/out_of_scope 行は税 0。TS 鏡像: receipt.ts / check-calc.ts（三面鏡・同時改修）。
  if v_pd = 'tax_excluded' and v_bts = 'taxable' then
    select coalesce(sum(line_total) filter (where tax_category = 'taxable_10'), 0)::int,
           coalesce(sum(line_total) filter (where tax_category = 'taxable_8'),  0)::int
      into v_bx10, v_bx8
      from public.check_lines
     where check_id = p_check_id and pay_group = p_pay_group and kind <> 'discount'
       and (not p_exclude_pay_fee or fee_kind is distinct from 'pay_fee');   -- ★12 0152（裁定298-8）: 同上・★6 0173: 除外指定
    v_bx10 := v_bx10 + v_ref;                                              -- ★12 0152（裁定298-9）: taxable_10 の母数にも加算
    v_sv     := round((v_net - v_pf) * v_rate / 100.0)::int;              -- サ料（従来と同式・★6 0173: 手数料行はサ料の母数から除く＝pay_fee 無しなら同値）
    v_base10 := greatest(0, v_bx10 - v_disc) + v_sv;
    v_tax    := public.check_tax_round(v_base10 * 10 / 100.0, v_trnd)
              + public.check_tax_round(v_bx8   *  8 / 100.0, v_trnd);
    return public.check_round_amount(v_net + v_sv + v_tax, v_unit, v_mode);
  end if;
  return public.check_round_amount(v_net + round((v_net - v_pf) * v_rate / 100.0), v_unit, v_mode);   -- ★6 0173: 同上
end $function$;

-- 内部専用（check_pay／check_close／cast_sales_aggregate 等から呼ぶ・直呼び経路なし）＝4 ロール revoke・grant なし（0175 と同じ）
revoke all on function public.check_group_due(uuid, text, boolean) from public, anon, authenticated, service_role;

commit;

-- ===== verify =====（Success の後に別実行・select だけ）
-- (1) 貼り先証明
-- select 'nox-project-proof', count(*) from public.orgs;
-- (2) md5（dc4163e6）と ★0178 の語・proacl（postgres のみ）
-- select proname, left(md5(replace(prosrc, E'\r', '')), 8) md5, prosrc like '%★0178%' has_star, proacl from pg_proc where pronamespace='public'::regnamespace and proname='check_group_due';
-- (3) demo 6 店の closed で due NULL＝0 件（適用前は 5,176）・open の件数と NULL 0
-- select c.status, count(*) n, sum(case when public.check_group_due(c.id,'A') is null then 1 else 0 end) null_due from public.checks c join public.orgs o on o.id=c.org_id where o.is_demo group by 1 order by 1;
-- (4) closed の due＝凍結値（checks.total と同額の件数が大半＝丸めなしの店）
-- select count(*) filter (where public.check_group_due(c.id,'A') = c.total) same_as_total, count(*) n from public.checks c join public.orgs o on o.id=c.org_id where o.is_demo and c.status='closed';
