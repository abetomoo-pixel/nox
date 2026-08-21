"use client";

// ご契約（課金 app 設計書 v1 §6・owner 限定）。
//   現契約の表示（状態/周期/店舗数/期末/期間末解約予定/お支払い方法/金額）＋
//   未契約時は checkout・契約中は portal・周期切替・銀行振込→カード切替。
//   ★プラン選択 UI は出さない（裁定7）。周期トグルのみ。
//   ★Stripe 未接続（env 4本のいずれか欠落）のときは操作ボタンを出さず「Stripe 未接続」を表示＝
//     画面自体は必ず開く（フェイルソフト）。
//   ★戻り値の反映は webhook（org_billing への唯一の書込経路）＝操作後は router.refresh() で読み直す。
import { useState } from "react";
import PageHead from "@/components/ui/page-head";
import { useRouter, useSearchParams } from "next/navigation";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";

export type BillingView = {
  status: string | null;
  interval: "month" | "year" | null;
  quantity: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  collectionMethod: string | null;
  trialEndsAt: string | null;
  hasSubscription: boolean;
  amountLabel: string;
  stripeConfigured: boolean;
};

const STATUS_JA: Record<string, string> = {
  trialing: "お試し期間中",
  active: "ご利用中",
  past_due: "お支払い確認中",
  canceled: "解約済み",
  inactive: "停止中",
};
const INTERVAL_JA: Record<string, string> = { month: "月払い", year: "年払い" };
const METHOD_JA: Record<string, string> = { charge_automatically: "カード自動引き落とし", send_invoice: "銀行振込" };

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(new Date(iso)) : "—";

export default function BillingBoard({ view }: { view: BillingView }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  // Stripe からの戻り（checkout の status / switch-to-card の switch）を1行で告知する。
  const [msg, setMsg] = useState<string | null>(
    params.get("status") === "success" ? "お手続きが完了しました。反映まで少しお待ちください。"
      : params.get("status") === "cancel" ? "お手続きを中断しました。"
      : params.get("switch") === "done" ? "カード払いへの切り替えが完了しました。"
      : params.get("switch") === "cancel" ? "カード切替を中断しました。"
      : params.get("switch") === "error" ? "カード切替に失敗しました。時間をおいてお試しください。"
      : null,
  );

  // 課金 route は成功時 {url} を返す（Stripe へ遷移）か {ok:true}（その場更新）を返す。
  async function call(path: string, body: Record<string, unknown>, label: string) {
    if (busy) return;
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; unchanged?: boolean };
      if (!res.ok) {
        setMsg(json.error ?? "お手続きに失敗しました");
        setBusy(null);
        return;
      }
      if (json.url) { window.location.href = json.url; return; } // Stripe へ（busy のまま遷移）
      setMsg(json.unchanged ? "変更はありません（すでにこの内容でご契約中です）" : "変更を受け付けました。反映まで少しお待ちください。");
      setBusy(null);
      router.refresh();
    } catch {
      setMsg("通信に失敗しました");
      setBusy(null);
    }
  }

  const st = view.status ?? "";
  const alive = st === "trialing" || st === "active" || st === "past_due";
  const isBt = view.collectionMethod === "send_invoice";
  const other: "monthly" | "yearly" = view.interval === "month" ? "yearly" : "monthly";

  return (
    <div className="nox-mv1 nox-mv1-m">
      <PageHead eyebrow="BILLING & PLAN" title="ご契約"
        desc="ご利用プランと支払方法、請求の状況を確認します。" />
      <Toast msg={msg} />

      {!view.stripeConfigured && (
        <div className="nox-alert">
          Stripe 未接続です（決済の設定が済んでいません）。ご契約内容の表示のみ行えます。
        </div>
      )}

      <section className="nox-panel" style={{ marginBottom: 14 }}>
        <h2 style={{ ...t.cardTitle, margin: "0 0 12px" }}>現在のご契約</h2>
        <div style={t.bdRow}><span style={t.bdKey}>状態</span>
          <span style={t.bdVal}>{view.status ? (STATUS_JA[view.status] ?? view.status) : "未契約"}</span></div>
        <div style={t.bdRow}><span style={t.bdKey}>お支払い周期</span>
          <span style={t.bdVal}>{view.interval ? INTERVAL_JA[view.interval] : "—"}</span></div>
        <div style={t.bdRow}><span style={t.bdKey}>ご請求金額</span>
          <span style={t.bdVal}>{view.amountLabel}</span></div>
        <div style={t.bdRow}><span style={t.bdKey}>店舗数</span>
          <span style={t.bdVal}>{view.quantity != null ? `${view.quantity}店舗` : "—"}</span></div>
        <div style={t.bdRow}><span style={t.bdKey}>お支払い方法</span>
          <span style={t.bdVal}>{view.collectionMethod ? (METHOD_JA[view.collectionMethod] ?? view.collectionMethod) : "—"}</span></div>
        <div style={t.bdRow}><span style={t.bdKey}>{st === "trialing" ? "お試し期間の終了" : "今期の終了"}</span>
          <span style={t.bdVal}>{fmtDate(st === "trialing" && !view.hasSubscription ? view.trialEndsAt : view.currentPeriodEnd)}</span></div>
        {view.cancelAtPeriodEnd && (
          <div style={t.bdRow}><span style={t.bdKey}>解約予定</span>
            <span style={{ ...t.bdVal, color: "var(--bad)" }}>今期の終了日をもって解約されます</span></div>
        )}
        <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "12px 0 0", lineHeight: 1.7 }}>
          ご請求は店舗数に応じた金額です（店舗を追加すると次回請求から反映されます）。
          解約・お支払い方法の変更・領収書のダウンロードは「お支払い管理」から行えます。
        </p>
      </section>

      {view.stripeConfigured && (
        <section className="nox-panel">
          <h2 style={{ ...t.cardTitle, margin: "0 0 12px" }}>お手続き</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!view.hasSubscription && (
              <>
                <button style={{ ...t.btnGold, fontWeight: 800 }} disabled={!!busy}
                  onClick={() => void call("/api/billing/checkout", { cycle: "monthly" }, "checkout-m")}>
                  {busy === "checkout-m" ? "処理中…" : "月払いで契約する"}
                </button>
                <button style={t.btnGhost} disabled={!!busy}
                  onClick={() => void call("/api/billing/checkout", { cycle: "yearly" }, "checkout-y")}>
                  {busy === "checkout-y" ? "処理中…" : "年払いで契約する"}
                </button>
              </>
            )}
            {view.hasSubscription && (
              <>
                <button style={{ ...t.btnGold, fontWeight: 800 }} disabled={!!busy}
                  onClick={() => void call("/api/billing/portal", {}, "portal")}>
                  {busy === "portal" ? "処理中…" : "お支払い管理を開く"}
                </button>
                {alive && !isBt && (
                  <button style={t.btnGhost} disabled={!!busy}
                    onClick={() => void call("/api/billing/interval", { cycle: other }, "interval")}>
                    {busy === "interval" ? "処理中…" : other === "yearly" ? "年払いに変更" : "月払いに変更"}
                  </button>
                )}
                {alive && isBt && (
                  <button style={t.btnGhost} disabled={!!busy}
                    onClick={() => void call("/api/billing/switch-to-card", {}, "switch")}>
                    {busy === "switch" ? "処理中…" : "カード払いに切り替える"}
                  </button>
                )}
              </>
            )}
          </div>
          {view.hasSubscription && alive && isBt && (
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "10px 0 0", lineHeight: 1.7 }}>
              銀行振込でご契約中です。お支払い周期の変更はお問い合わせください（運営者が承ります）。
            </p>
          )}
        </section>
      )}
    </div>
  );
}
