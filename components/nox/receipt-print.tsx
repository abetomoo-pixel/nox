"use client";

// ★便 GV-C C-13（GV-59）: 正式領収書の印字実体（画面非表示・印刷時のみ＝.nox-print-only）。レジの会計完了モーダルと
//   /receipts の台帳（行ごとの印刷）で共用。1 枚＝1 ページ・R-番号・発行日＋取引日・登録番号・公開 URL の QR。
import { renderSVG } from "uqr";
import BrandLogo from "@/components/ui/brand-logo"; // ★便 SH-UI-a A-2: ロゴ（Concept 2 改）

export type ReceiptPrintItem = {
  id: string; serial: number; amount: number; name: string; note: string;
  biz_date: string; token: string; store_name: string;
  /** 発行日（YYYY-MM-DD）。省略＝今日（レジの発行直後） */
  issued_on?: string;
};

const jaDate = (ymd?: string) => {
  const d = ymd ? new Date(`${ymd}T00:00:00+09:00`) : new Date();
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" });
};

export default function ReceiptPrintSheet({ items, storeName, invoiceRegNo }: { items: ReceiptPrintItem[]; storeName: string; invoiceRegNo: string }) {
  if (items.length === 0) return null;
  return (
    <div className="nox-print nox-print-only" data-receipt-print="1" style={{ background: "#fff", color: "#000" }}>
      {items.map((r, i) => (
        <div key={r.id} style={{
          padding: "24mm 18mm", fontSize: 14, lineHeight: 1.9,
          pageBreakAfter: i < items.length - 1 ? "always" : "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><BrandLogo height={34} variant="light" /></div>{/* ★便 SH-UI-a A-2: 領収書（白地＝light） */}
          <div style={{ textAlign: "center", fontSize: 22, fontWeight: 800, letterSpacing: 6, marginBottom: 6 }}>領　収　書</div>
          <div style={{ textAlign: "right", fontSize: 12 }}>No. R-{String(r.serial).padStart(6, "0")}</div>
          <div style={{ fontSize: 16, borderBottom: "1px solid #000", paddingBottom: 4, margin: "10px 0 14px" }}>
            {(r.name || "上") + " 様"}
          </div>
          <div style={{ textAlign: "center", fontSize: 26, fontWeight: 900, margin: "18px 0 6px" }}>
            ￥{r.amount.toLocaleString()}−
          </div>
          <div style={{ textAlign: "center", fontSize: 11 }}>
            {/* ★便 X13-G W-15 ③: 合計（税込）と 10% 対象（税抜）・消費税 */}
            （税込・10% 対象 ￥{(r.amount - Math.floor((r.amount * 10) / 110)).toLocaleString()}（税抜）・消費税 ￥{Math.floor((r.amount * 10) / 110).toLocaleString()}）
          </div>
          <div style={{ marginTop: 12 }}>但し {r.note || "ご飲食代として"}</div>
          <div>上記正に領収いたしました。</div>
          <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div>発行日 {jaDate(r.issued_on)}</div>
              <div style={{ fontSize: 12 }}>取引日 {r.biz_date}</div>
            </div>
            {/* 確認用 QR（公開 URL /r/{token}・掲載期限90日） */}
            <span style={{ width: "22mm", height: "22mm", display: "inline-block" }}
              dangerouslySetInnerHTML={{ __html: renderSVG(`${typeof window !== "undefined" ? window.location.origin : ""}/r/${r.token}`, { border: 0 }) }} />
          </div>
          <div style={{ marginTop: 8, textAlign: "right", fontWeight: 700 }}>{r.store_name || storeName}</div>
          {invoiceRegNo && <div style={{ textAlign: "right", fontSize: 12 }}>登録番号 {invoiceRegNo}</div>}
          <div style={{ fontSize: 10, color: "#555", marginTop: 4, textAlign: "right" }}>
            QR から内容を確認できます（掲載期限: 発行から90日）
          </div>
        </div>
      ))}
    </div>
  );
}
