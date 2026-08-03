import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/nox/auth";
import MasterSubnav from "./master-subnav";

// マスタ配下の共通レイアウト（マスタIA再編 レーン①）。
//
// ── A. 入口の権限ガード ────────────────────────────────────────────────
// 従来 /master にはページレベルの role ガードが無く、staff が直打ちで到達できていた
// （見えるのは読取のみで書込は RPC が拒否＝実害は無いが、入口が開いている状態だった）。
// ここで manager 以上に閉じる。★真の防御は従来どおり RLS / RPC（DB 物理保証）で、
// これは利便のためのリダイレクト＝ (manage)/layout.tsx の cast ゲートと同じ流儀。
//
// role の解決は既存 getSessionRole()（React cache() 済み）。(manage)/layout.tsx が
// 同一リクエストで既に呼んでいるため auth_role() rpc は「1回/リクエスト」のまま増えない。
//
// cast は上位 (manage)/layout.tsx が /mine へ返すが、layout の実行順に依存しないよう
// ここでも明示的に /mine へ返す（/dashboard 経由の余計な1ホップを作らない）。
//
// ★ page.tsx 側の出し分け（isManagerUp / role === "owner"）は1つも削除していない＝二重で残す。
//   この layout は入口を閉じるだけで、パネル単位の owner 限定などは従来のまま page.tsx が持つ。
export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getSessionRole();
  if (!role) redirect("/login");
  if (role === "cast") redirect("/mine");
  if (!(role === "owner" || role === "manager")) redirect("/dashboard");

  return (
    <>
      <MasterSubnav />
      {children}
    </>
  );
}
