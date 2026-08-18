import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import RegisterBoard from "./register-board";

export const dynamic = "force-dynamic";

// レジ（staff/manager/owner）。SELECT はパターン2（checks 系・seats）＋パターン3（products）＋casts。
// role は layout と React cache 共有＝auth_role() rpc は1回/リクエストを維持。
// F3a-3: 予約タブ（canonical の register 3タブ目）。表示は owner/manager/staff(can_crm)＝
// 表示制御は利便・真の防御は reservations RLS と予約 RPC ゲート。cast は layout で /mine へ。
export default async function RegisterPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  const { data: seats } = await supabase
    .from("seats")
    .select("id, name, kind, store_id")
    .eq("is_active", true)
    .order("sort_order");
  // 純増⑦（mig0063）: タイル見出しのカテゴリ化＝products に category_id を1列追加＋カテゴリ一覧（active のみ）。
  const { data: products } = await supabase
    .from("products")
    // 段R2: reorder_point＝タイルの低在庫「残N」判定に使う（在庫 v1 mig0061 の列・presentation）。
    // mig0081: sort_order＝カテゴリ内の並び順（groupProducts が sort_order→name で並べる）。
    //   ★従来は .order("type") のみでカテゴリ内が実質不定だった。並びの決定は client 側
    //     （groupProducts）に一本化する＝kiosk（0059/0063 の RPC 経由）と同じ並び規則になる。
    // E8-1 #8: back_exempt_from_split＝キャストドリンク対象のタップ時判定（mig0069 の列・表示判定のみ）。
    .select("id, name, type, price, category_id, reorder_point, sort_order, back_exempt_from_split")
    .eq("is_active", true)
    .order("type");
  const { data: categories } = await supabase
    .from("product_categories")
    .select("id, name, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  const { data: casts } = await supabase
    .from("casts")
    // 段P/R2: photo_updated_at＝指名チップと席タイルの着卓キャスト顔を写真にする（null=頭文字）。
    .select("id, name, photo_updated_at")
    .eq("is_active", true)
    .order("name");
  // 予約タブの可視判定（staff は can_crm・cast は予約不可＝会計のみ）と予約作成先の店（自分の membership の店）
  const { data: canCrm } = role === "staff" ? await supabase.rpc("auth_staff_can_crm") : { data: false };
  const { data: myStoreId } = await supabase.rpc("auth_store_id");
  return (
    <RegisterBoard
      seats={seats ?? []}
      products={products ?? []}
      categories={categories ?? []}
      casts={casts ?? []}
      isManagerUp={isManagerUp}
      showReserve={role !== "cast" && (isManagerUp || canCrm === true)}
      storeId={(myStoreId as string | null) ?? ""}
    />
  );
}
