// ★便 ON-3（2026-10-26・0176 ★1＝401 LIFF の入口）: <site>/liff/<storeId>（LINE Developers の LIFF エンドポイント URL・サイズ Full・Scope openid）。公開面＝(manage) 外・noindex。
//   店の liff_id（公開値）をサーバで引いて LiffBridge（client）へ。未設定＝案内だけ。?t=<token>&m=bind＝紐付け（招待リンク）・無し＝ログイン（line_links から）。
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE, lineStoreOf } from "@/lib/nox/line/subject";
import LiffBridge from "./liff-bridge";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "LINE でログイン", robots: { index: false, follow: false } };

export default async function LiffPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = UUID_RE.test(storeId) ? await lineStoreOf(createAdminClient(), storeId) : null;
  const liffId = store?.config.liff_id ?? null;
  const wrap: React.CSSProperties = { minHeight: "100vh", background: "#f5f5f7", color: "#1a1a1a", display: "grid", placeItems: "start center", padding: "32px 16px", fontFamily: "system-ui, -apple-system, 'Hiragino Sans', sans-serif" };
  const card: React.CSSProperties = { width: "100%", maxWidth: 440, background: "#fff", border: "1px solid #e3e3e8", borderRadius: 14, padding: "22px 20px" };
  return (
    <main style={wrap} data-liff-page="1">
      <div style={card}>
        <h1 style={{ fontSize: 18, margin: "0 0 6px" }}>{store ? `${store.name}：LINE でログイン` : "LINE でログイン"}</h1>
        {!store || !liffId
          ? <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#555" }} data-liff-state="not_configured">この店の LINE 連携はまだ設定されていません。お店にご確認ください。</p>
          : <LiffBridge storeId={storeId} liffId={liffId} />}
      </div>
    </main>
  );
}
