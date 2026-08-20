// 領収書の匿名公開ページ（R2-c mig0099・裁定 R2-11/R2-12・正本B）。
//   認証不要ルート（(manage) 外＝layout の redirect を通らない）。データ取得は
//   nox_receipt_public（★NOX 初の anon 白名単 RPC）1本のみ＝publishable key の素クライアントで
//   server-side 実行（cookie セッション不使用＝JWT は role=anon）。
//   不在・期限切れ・void は RPC が空を返す＝すべて同一の「見つかりません」表示
//   （存在推測を与えない・正本B③）。PII なし（返却5項目のみ・正本B④）・noindex。
import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "領収書の確認",
  robots: { index: false, follow: false },
};

type PublicReceipt = {
  store_name: string; serial_no: string; amount: number; issued_on: string; biz_date: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PublicReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let row: PublicReceipt | null = null;
  if (UUID_RE.test(token)) {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data } = await anon.rpc("nox_receipt_public", { p_token: token });
    row = ((data ?? []) as PublicReceipt[])[0] ?? null;
  }

  // 白地黒字の帳票トーン（画面パレット対象外＝アプリ外の公開面）
  const wrap: React.CSSProperties = {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#f4f2ee", color: "#1a1a1a", padding: 20,
    fontFamily: "'Hiragino Sans', 'Yu Gothic', sans-serif",
  };
  const card: React.CSSProperties = {
    background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: "28px 26px",
    maxWidth: 420, width: "100%", boxShadow: "0 2px 12px rgba(0,0,0,.06)",
  };

  if (!row) {
    return (
      <div style={wrap}>
        <div style={{ ...card, textAlign: "center" }}>
          <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>領収書が見つかりません</p>
          <p style={{ fontSize: 12.5, color: "#666", margin: 0, lineHeight: 1.8 }}>
            URL をご確認ください。掲載期限（発行から90日）を過ぎた領収書や、
            発行元で取り消された領収書は表示されません。
          </p>
        </div>
      </div>
    );
  }

  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return `${y}年${m}月${d}日`;
  };
  return (
    <div style={wrap}>
      <div style={card}>
        <p style={{ textAlign: "center", fontSize: 18, fontWeight: 800, letterSpacing: 8, margin: "0 0 18px" }}>領　収　書</p>
        <div style={{ textAlign: "center", fontSize: 30, fontWeight: 900, margin: "6px 0 18px" }}>
          ￥{row.amount.toLocaleString()}−
        </div>
        <div style={{ fontSize: 13, lineHeight: 2, borderTop: "1px solid #eee", paddingTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#666" }}>発行番号</span><span style={{ fontWeight: 700 }}>{row.serial_no}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#666" }}>発行日</span><span>{fmt(row.issued_on)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#666" }}>取引日</span><span>{fmt(row.biz_date)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#666" }}>発行元</span><span style={{ fontWeight: 700 }}>{row.store_name}</span>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "#888", margin: "16px 0 0", lineHeight: 1.7, borderTop: "1px solid #eee", paddingTop: 10 }}>
          本ページは発行元が記録した領収内容の確認用です（掲載期限: 発行から90日）。
          宛名・但し書きは紙の領収書をご確認ください。
        </p>
      </div>
    </div>
  );
}
