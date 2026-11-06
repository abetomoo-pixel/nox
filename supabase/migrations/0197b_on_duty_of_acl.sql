-- 0197b_on_duty_of_acl.sql（0197 追補＝on_duty_of の ACL を 0190 の内部専用に戻す・2026-11-06）
-- 翻訳元: 0190_duty_gate_device_bind.sql の revoke 行（4 ロール明示 revoke）。検証クエリ: docs/demo/handpaste_0197b.md
begin;
revoke execute on function public.on_duty_of(text, uuid, uuid, date) from public, anon, authenticated, service_role;
commit;
