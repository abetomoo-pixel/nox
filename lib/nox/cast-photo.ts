import type { SupabaseClient } from "@supabase/supabase-js";

// 段P キャスト写真（UI刷新v2）。Storage 実体とアプリの間の唯一の接点＝パス規約・縮小・署名 URL をここに集約する。
//
// 設計の要点（mig0064/0065＋Storage ポリシー3本と対）:
//  - ★URL は DB に保存しない。実体パスは規約 `{org_id}/{cast_id}.jpg` から導出する（下の castPhotoPath）。
//    保存するのは casts.photo_updated_at（null=写真なし）だけ＝「写真の有無」と「キャッシュ世代」を1列で兼ねる。
//  - バケットは private。閲覧は毎回 署名 URL（既定1時間）。public バケットにすると URL を知る誰でも
//    キャスト写真を閲覧できてしまうため（個人情報）。
//  - 打刻（photo_updated_at 更新）は必ず RPC set_cast_photo_updated_at 経由。casts は authenticated に
//    SELECT しか grant されておらず UPDATE ポリシーも無い＝クライアント直 update は grant/RLS の二重で不可。
//  - Storage 側 authz（cast_photos_insert/update）と RPC 側 authz は同一式（owner ∨ manager∧自店 ∨ 本人）。
//    ファイルは置けたが打刻できない（またはその逆）という片肺状態を構造的に作らない。

export const CAST_PHOTO_BUCKET = "cast-photos";

/** 保存先パス。バケット内は org で1階層掘る（Storage ポリシーが foldername[1] で org 境界を見る）。 */
export function castPhotoPath(orgId: string, castId: string): string {
  return `${orgId}/${castId}.jpg`;
}

// 縮小パラメータ。バケット側の上限は 2MiB / image/jpeg 固定なので、クライアントは必ずこの形に揃えて送る。
const MAX_PX = 512; // 長辺。表示は最大 38px なので Retina 4倍でも十分
const QUALITY = 0.85;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * 画像ファイルを長辺 512px の JPEG(q0.85) に縮小する。アスペクト比は保持（丸表示は CSS の object-fit: cover が担う）。
 * EXIF 回転は createImageBitmap の imageOrientation:"from-image" で吸収する（iPhone の横倒し写真対策）。
 * 非対応環境では <img> 経由にフォールバック（モダンブラウザは <img> 描画時に EXIF を適用する）。
 */
export async function downscaleToJpeg(file: File): Promise<Blob> {
  const src = await decodeImage(file);
  const scale = Math.min(1, MAX_PX / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を処理できませんでした");
  ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
  if ("close" in src && typeof src.close === "function") src.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("画像を処理できませんでした");
  // 512px/q0.85 なら通常数十 KB。上限超えは異常なので送る前に落とす（バケット上限に頼らない）。
  if (blob.size > MAX_BYTES) throw new Error("画像が大きすぎます");
  return blob;
}

type Decoded = { width: number; height: number; close?: () => void };

async function decodeImage(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      return (await createImageBitmap(file, { imageOrientation: "from-image" })) as unknown as Decoded;
    } catch {
      // HEIC 等 デコード不能／オプション非対応 → <img> 経路で再試行
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<Decoded>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img as unknown as Decoded);
      img.onerror = () => reject(new Error("この画像形式は読み込めません（JPEG/PNG をお使いください）"));
      img.src = url;
    });
  } finally {
    // onload 後に revoke しても描画済みの ImageElement は有効
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * 写真をアップロードして photo_updated_at を打刻する。戻り値は新しい photo_updated_at（ISO）。
 * upsert:true＝1キャスト1ファイル（履歴を持たない＝削除経路も持たない。差し替えは上書き）。
 */
export async function uploadCastPhoto(
  supabase: SupabaseClient,
  orgId: string,
  castId: string,
  file: File,
): Promise<string> {
  const blob = await downscaleToJpeg(file);
  const { error: upErr } = await supabase.storage
    .from(CAST_PHOTO_BUCKET)
    .upload(castPhotoPath(orgId, castId), blob, { upsert: true, contentType: "image/jpeg" });
  if (upErr) throw new Error(upErr.message);

  // ★Storage 成功後に打刻。逆順にすると「打刻はされたが実体が無い」＝壊れ画像を出す状態が残る。
  const { data, error } = await supabase.rpc("set_cast_photo_updated_at", { p_cast_id: castId });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * 複数キャストの署名 URL をまとめて発行する（一覧用＝1リクエスト）。
 * photo_updated_at が null の行は写真なし＝発行対象から外す（存在しないパスを引かない）。
 * 戻り値は cast_id → URL の Map。発行に失敗した分は単に欠落し、呼び手は頭文字にフォールバックする。
 */
export async function signCastPhotos(
  supabase: SupabaseClient,
  orgId: string,
  casts: { id: string; photo_updated_at: string | null }[],
  expiresIn = 3600,
): Promise<Map<string, string>> {
  const targets = casts.filter((c) => c.photo_updated_at);
  const out = new Map<string, string>();
  if (targets.length === 0) return out;

  const { data, error } = await supabase.storage
    .from(CAST_PHOTO_BUCKET)
    .createSignedUrls(targets.map((c) => castPhotoPath(orgId, c.id)), expiresIn);
  if (error || !data) return out;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const cast = targets[i];
    if (!row?.signedUrl || row.error || !cast) continue;
    out.set(cast.id, withVersion(row.signedUrl, cast.photo_updated_at));
  }
  return out;
}

/** 単体版（マイページなど1人分）。写真なしは null。 */
export async function signCastPhoto(
  supabase: SupabaseClient,
  orgId: string,
  castId: string,
  photoUpdatedAt: string | null,
  expiresIn = 3600,
): Promise<string | null> {
  const m = await signCastPhotos(supabase, orgId, [{ id: castId, photo_updated_at: photoUpdatedAt }], expiresIn);
  return m.get(castId) ?? null;
}

/**
 * キャッシュバスター。パスが固定（上書き運用）なので、photo_updated_at を URL に混ぜないと
 * 差し替え後もブラウザ/CDN が旧画像を出し続ける。
 */
function withVersion(url: string, photoUpdatedAt: string | null): string {
  if (!photoUpdatedAt) return url;
  const v = Date.parse(photoUpdatedAt);
  if (Number.isNaN(v)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${v}`;
}

// org_id はクライアントに配られていないので RPC で1回だけ引いて使い回す（auth_org_id は authenticated 実行可）。
// ログアウト→別ユーザーでの再ログインはページ全体が再読込されるためモジュールキャッシュも破棄される。
let orgIdCache: Promise<string | null> | null = null;

export function resolveOrgId(supabase: SupabaseClient): Promise<string | null> {
  if (!orgIdCache) {
    orgIdCache = (async () => {
      try {
        const { data } = await supabase.rpc("auth_org_id");
        return (data as string | null) ?? null;
      } catch {
        return null;
      }
    })();
  }
  return orgIdCache;
}
