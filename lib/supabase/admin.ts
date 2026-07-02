import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// サーバ専用の admin（サービスキー）クライアント。RLS をバイパスするため、
// 給与確定（サーバ再計算→凍結）など「ポリシー不在の操作」専用に限定して使う。
//
// 重要:
//  - SUPABASE_SECRET_KEY はサーバ環境変数のみ（NEXT_PUBLIC_ ではない）。クライアントへ渡さない。
//  - 万一クライアントバンドルへ混入したら window ガードで即時に落として事故を可視化する。
export function createAdminClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("admin client はサーバ専用です（クライアントから呼ばないこと）");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("admin client: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY が未設定です");
  }
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
