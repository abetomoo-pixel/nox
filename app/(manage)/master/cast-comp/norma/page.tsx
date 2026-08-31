import { redirect } from "next/navigation";

// U-2（裁定101 §4）: ノルマは待遇オールインワン（/master/cast-comp/plan）へ統合＝旧タブはリダイレクト。
//   NormaBoard 本体は ../norma/norma-board.tsx のまま plan ページが搭載（RPC・権限出し分け不変）。
export default function CastCompNormaPage() {
  redirect("/master/cast-comp/plan#norma");
}
