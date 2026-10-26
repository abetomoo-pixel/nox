// ★QR 便（2026-10-26・裁定423 変更＝Agoora 確定 10/26 ⑫・0185 起草）: キオスクの QR をスマホで読む入口。MIG_0185_APPLIED=false の間は 404（0185 の RPC が無い）。
import { notFound } from "next/navigation";
import { mig0185On } from "@/lib/nox/rules-0175/flag";
import KqClient from "./kq-client";

export const dynamic = "force-dynamic";

export default function KioskQrClaimPage() {
  if (!mig0185On()) notFound();
  return <KqClient />;
}
