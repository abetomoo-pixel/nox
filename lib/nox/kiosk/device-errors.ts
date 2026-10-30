// ★便 M3 M-29 ③（2026-10-29）: キオスク端末 API の英語の生文を日本語に（W-10 の型）。上限は 0190（kiosk_provision＝店舗×用途 3 台・無効は数えない）の前は 1 台。
export const KIOSK_DEVICE_LIMIT = 1;
/** route／RPC の生文 → 日本語（status と用途名を添える） */
export function kioskErrJa(status: number, raw: string | undefined, purposeLabel: string): string {
  const m = raw ?? "";
  if (/already provisioned/.test(m)) return `この店舗の「${purposeLabel}」端末は上限（${KIOSK_DEVICE_LIMIT} 台）に達しています。不要な端末を無効化するか、認証情報を再発行してください`;
  if (/already processed/.test(m)) return "同じ発行がすでに処理されています（画面を再読込してください）";
  if (/bad target/.test(m)) return "この利用者は端末アカウントにできません（人のアカウントは端末にしない）";
  if (/bad purpose/.test(m)) return "用途は「打刻」か「レジ」です";
  if (/not found/.test(m)) return "端末が見つかりません（画面を再読込してください）";
  if (/device inactive/.test(m)) return "無効化した端末です（再発行して有効化は 0190 の後）";
  if (/forbidden|unauthenticated/.test(m) || status === 401 || status === 403) return "権限がありません（オーナーのみ）";
  if (/billing locked/.test(m)) return "ご契約の状態により書込ができません";
  if (/auth create failed|auth update failed/.test(m)) return `認証情報の作成に失敗しました（${m.replace(/^auth (create|update) failed: /, "")}）`;
  return `エラー(${status}): ${m || "不明"}`;
}
