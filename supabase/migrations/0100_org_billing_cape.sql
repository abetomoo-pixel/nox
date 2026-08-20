-- ═══════════════════════════════════════════════════════════════════════════
-- mig0100: 課金 app レーン — org_billing.cancel_at_period_end（自己検証版）
--   根拠 = 課金 app 設計書 v1 §2-3（donor BillingFields との形合わせ・期間末解約予定の表示）
-- ─────────────────────────────────────────────────────────────────────────────
-- ★非冪等（本番手貼り1回・再実行厳禁）: add column
-- ★notify pgrst はファイル外・手貼り後に単発
-- ★RPC 変更なし＝billing/grants pin 不変（billing_writable_of は本列を参照しない＝判定不変）
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.org_billing
  add column cancel_at_period_end boolean not null default false;

commit;
