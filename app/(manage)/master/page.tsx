import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import MasterBoard from "./master-board";
import DeductionPanel from "./deduction-panel";

export const dynamic = "force-dynamic";

// マスタ管理（manager/owner。staff は nav 非表示・直打ちでも操作 UI 非表示＋RPC 拒否）。
export default async function MasterPage() {
  const supabase = await createClient();
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  const { data: stores } = await supabase.from("stores").select("id, name, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const storeId = store?.id ?? "";
  // okuri_mode は settings_json 相乗り（既定 'flat'）。owner のみトグル可（set_store_okuri_mode）。
  const okuriMode = (store?.settings_json as Record<string, unknown> | null)?.okuri_mode === "actual" ? "actual" : "flat";
  // 発行パネル用の cast 一覧（RLS で自店のみ・manager+ 可視）。
  const { data: casts } = await supabase.from("casts").select("id, name").eq("store_id", storeId).eq("is_active", true).order("name");
  return (
    <>
      <MasterBoard storeId={storeId} isManagerUp={isManagerUp} isOwner={role === "owner"} />
      {isManagerUp && (
        <DeductionPanel
          storeId={storeId}
          casts={(casts ?? []) as { id: string; name: string }[]}
          isOwner={role === "owner"}
          initialOkuriMode={okuriMode}
        />
      )}
    </>
  );
}
