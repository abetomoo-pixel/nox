// ★運営コンソール 版 1（夜便 2026-11-20 N5）: /ops の下は旗 MIG_0202A_APPLIED（0202a が本番に入るまで false）の後ろ＝false の間は全部 404。
//   店の画面（(manage)）の柵・ナビは通らない（運営者は店のユーザーではない＝users の行が無い）。
import { notFound } from "next/navigation";
import { mig0202aOn } from "@/lib/nox/rules-0175/flag";

export const dynamic = "force-dynamic";

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  if (!mig0202aOn()) notFound();
  return <>{children}</>;
}
