// 課金失効バナー（設計書 v1 §6）。シェル（(manage)/layout.tsx）が全ページの本文頭に描く。
//   ★出現条件は auth_org_billing_writable() の否定＝RPC ゲート（対象94本）と同じ述語1本に乗る
//     （lib/billing/banner.ts に同値の純関数と根拠を記載）。
//   ★nav は隠さない＝押せるが弾かれる＋ここで告知（§6）。owner にだけ復帰導線（ご契約）を出す。
//   ★見た目は既存の .nox-alert（gold 系1色）を流用＝新色・新クラスを作らない。
import Link from "next/link";
import { BILLING_BANNER_MSG } from "@/lib/billing/banner";

export default function BillingBanner({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="nox-alert" role="status">
      {BILLING_BANNER_MSG}
      {isOwner && (
        <>
          {" "}
          <Link href="/billing" style={{ color: "var(--gold2)", textDecoration: "underline", fontWeight: 700 }}>
            ご契約の手続きへ
          </Link>
        </>
      )}
    </div>
  );
}
