// ★便 M3 M-29 ③（2026-10-29）: キオスク端末 API の英語の生文を日本語に（W-10 の型）。上限は 0190（kiosk_provision＝店舗×用途 3 台・無効は数えない）の前は 1 台。
// ★0190（2026-10-30）: 上限は kioskDeviceLimit()（フラグ true＝3・false＝1）で読む。KIOSK_DEVICE_LIMIT は 0190 前の値の pin（verify-nox-m3 が 1 を見る）＝新しい呼び手は使わない。
//   相対 import＝scripts/verify-nox-m3.ts が tsx（node）からこのファイルを読むため（"@/…" は解けない）。
import { mig0190On } from "../rules-0175/flag";
/** @deprecated 0190 前の pin（1 台）。現在の上限は kioskDeviceLimit() */
export const KIOSK_DEVICE_LIMIT = 1;
/** ★0190: 店舗×用途ごとの有効端末の上限（kiosk_provision／kiosk_reactivate の 'device limit' と同じ数） */
export function kioskDeviceLimit(): number { return mig0190On() ? 3 : 1; }
/** route／RPC の生文 → 日本語（status と用途名を添える） */
export function kioskErrJa(status: number, raw: string | undefined, purposeLabel: string): string {
  const m = raw ?? "";
  if (/already provisioned/.test(m)) return `この店舗の「${purposeLabel}」端末は上限（${kioskDeviceLimit()} 台）に達しています。不要な端末を無効化するか、認証情報を再発行してください`;
  if (/device limit/.test(m)) return `この店舗の「${purposeLabel}」端末は上限（3 台）に達しています。使っていない端末を無効化して削除するか、既存の端末を再発行してください`; // ★0190
  if (/device bound/.test(m)) return "この端末アカウントは別の端末に固定されています（マスタ › システム › 端末の「固定を解除」で解除）"; // ★0190
  if (/already active/.test(m)) return "この端末はすでに有効です"; // ★0190
  if (/still active/.test(m)) return "有効な端末は削除できません（先に無効化してください）"; // ★0190
  if (/already processed/.test(m)) return "同じ発行がすでに処理されています（画面を再読込してください）";
  if (/bad target/.test(m)) return "この利用者は端末アカウントにできません（人のアカウントは端末にしない）";
  if (/bad purpose/.test(m)) return "用途は「打刻」か「レジ」です";
  if (/not found/.test(m)) return "端末が見つかりません（画面を再読込してください）";
  if (/device inactive/.test(m)) return "無効化した端末です（「再発行して有効化」を使ってください）";
  if (/forbidden|unauthenticated/.test(m) || status === 401 || status === 403) return "権限がありません（オーナーのみ）";
  if (/billing locked/.test(m)) return "ご契約の状態により書込ができません";
  if (/auth create failed|auth update failed/.test(m)) return `認証情報の作成に失敗しました（${m.replace(/^auth (create|update) failed: /, "")}）`;
  return `エラー(${status}): ${m || "不明"}`;
}
