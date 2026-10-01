import type { SupabaseClient } from "@supabase/supabase-js";
import { CAST_PHOTO_BUCKET, downscaleToJpeg } from "./cast-photo";

// ★0162（裁定329／329 追補1・便 M5-1・2026-10-01）: スタッフ写真＝キャスト写真（cast-photo.ts）と同じ bucket・同じ縮小・同じ署名 URL。
//   違いはパス規約だけ＝`{org_id}/u_{user_id}.jpg`（u_ 接頭・storage policy の users 腕＝owner ∨ manager 自店 ∨ 本人（owner／manager／staff）・cast は u_ 不可）。
//   打刻は set_user_photo_updated_at（users.photo_updated_at）。削除＝storage.remove（delete policy）→ clear_user_photo／clear_cast_photo（null 戻し）＝M5-1 の順。
//   実体が消えて RPC が失敗しても photo_updated_at が残るだけ（CastAvatar は onError で頭文字へ落ちる）。RPC が通って実体が残っても署名 URL は発行しない（null）。

export function userPhotoPath(orgId: string, userId: string): string {
  return `${orgId}/u_${userId}.jpg`;
}

/** キャッシュバスター（cast-photo.ts と同じ式＝photo_updated_at の epoch を v= に） */
export function photoVersionOf(url: string, photoUpdatedAt: string | null): string {
  if (!photoUpdatedAt) return url;
  const v = Date.parse(photoUpdatedAt);
  if (Number.isNaN(v)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${v}`;
}

/** スタッフ写真をアップロードして photo_updated_at を打刻する。戻り値は新しい photo_updated_at（ISO）。 */
export async function uploadUserPhoto(supabase: SupabaseClient, orgId: string, userId: string, file: File): Promise<string> {
  const blob = await downscaleToJpeg(file);
  const { error: upErr } = await supabase.storage.from(CAST_PHOTO_BUCKET).upload(userPhotoPath(orgId, userId), blob, { upsert: true, contentType: "image/jpeg" });
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await supabase.rpc("set_user_photo_updated_at", { p_user_id: userId });
  if (error) throw new Error(error.message);
  return data as string;
}

/** 複数スタッフの署名 URL（photo_updated_at が null の行は対象外）。戻り値は user_id → URL。 */
export async function signUserPhotos(
  supabase: SupabaseClient,
  orgId: string,
  users: { id: string; photo_updated_at: string | null }[],
  expiresIn = 3600,
): Promise<Map<string, string>> {
  const targets = users.filter((u) => u.photo_updated_at);
  const out = new Map<string, string>();
  if (targets.length === 0) return out;
  const { data, error } = await supabase.storage.from(CAST_PHOTO_BUCKET).createSignedUrls(targets.map((u) => userPhotoPath(orgId, u.id)), expiresIn);
  if (error || !data) return out;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const u = targets[i];
    if (!row?.signedUrl || row.error || !u) continue;
    out.set(u.id, photoVersionOf(row.signedUrl, u.photo_updated_at));
  }
  return out;
}

export async function signUserPhoto(supabase: SupabaseClient, orgId: string, userId: string, photoUpdatedAt: string | null, expiresIn = 3600): Promise<string | null> {
  const m = await signUserPhotos(supabase, orgId, [{ id: userId, photo_updated_at: photoUpdatedAt }], expiresIn);
  return m.get(userId) ?? null;
}

/** 削除＝Storage の実体を消し（delete policy）→ photo_updated_at を null に戻す（clear_user_photo）。 */
export async function removeUserPhoto(supabase: SupabaseClient, orgId: string, userId: string): Promise<void> {
  const { error: rmErr } = await supabase.storage.from(CAST_PHOTO_BUCKET).remove([userPhotoPath(orgId, userId)]);
  if (rmErr) throw new Error(rmErr.message);
  const { error } = await supabase.rpc("clear_user_photo", { p_user_id: userId });
  if (error) throw new Error(error.message);
}

/** キャスト写真の削除（329: /casts 詳細に揃える）＝実体 → clear_cast_photo。 */
export async function removeCastPhoto(supabase: SupabaseClient, orgId: string, castId: string): Promise<void> {
  const { error: rmErr } = await supabase.storage.from(CAST_PHOTO_BUCKET).remove([`${orgId}/${castId}.jpg`]);
  if (rmErr) throw new Error(rmErr.message);
  const { error } = await supabase.rpc("clear_cast_photo", { p_cast_id: castId });
  if (error) throw new Error(error.message);
}

/** 写真の操作ができる役割（storage の users 腕と同じ＝cast は u_ 不可・/mine の cast 腕で扱う） */
export const canEditUserPhoto = (role: string | null | undefined): boolean => role === "owner" || role === "manager" || role === "staff";

/** 写真の登録／変更ボタンの文言（既存 photo-card と同じ語） */
export const photoActionLabelOf = (hasPhoto: boolean, busy: boolean): string => (busy ? "保存中…" : hasPhoto ? "写真を変更" : "写真を登録");
