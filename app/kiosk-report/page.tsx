// ★裁定469（M-128・2026-11-09）: キオスクの簡易画面（直近の日報）は廃止＝端末のホーム（/kiosk）へ。
//   レジ／シフト／在庫／日報は、ホームのタイル → PIN → 本人セッション（kiosk_person_claim）で本店の同じページ（/register・/shift・/master/stock・/report）を開く。
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/kiosk");
}
