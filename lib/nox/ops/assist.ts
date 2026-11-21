// ★導入の代行 版 2 の画面（2026-11-21 夜・枝 night1121-ops-v2・旗 MIG_0202B_APPLIED の後ろ）: 判定と表示の純関数（DB を知らない）。
//   書けるか＝会社が導入中か、オーナーのサポート許可（1／3／7 日）の間（0202b の onb_can_write と同じ・判定の正は DB＝ここは画面の案内）。
//   LINE 連携は 4 段（公開の値 → チャネルシークレット → アクセストークン → 友だち追加と連携の確かめ）。シークレットとトークンは入れた後に画面へ出さない（「入力済み」とだけ）。

export type AssistGate = { ok: boolean; reason: string | null };
/** 運営が代行で書けるか（画面の案内・理由は 1 行） */
export function assistGateOf(o: { onboarding_state: string; is_demo?: boolean; support_until: string | null }, now: Date): AssistGate {
  if (o.is_demo) return { ok: false, reason: "デモの会社には代行で書けません" };
  if (o.onboarding_state !== "done") return { ok: true, reason: null };
  if (o.support_until && new Date(o.support_until).getTime() > now.getTime()) return { ok: true, reason: null };
  return { ok: false, reason: "導入完了の後で、サポート許可がありません（オーナーに店の設定でサポート許可を出してもらってください）" };
}

/** LINE 連携の 4 段（line_config の鍵の有無だけを見る＝値は読まない・画面に出さない） */
export type LineStep = { key: "public" | "secret" | "token" | "verify"; name: string; done: boolean; note: string };
export function lineStepsOf(c: { login_channel_id?: boolean; liff_id?: boolean; bot_basic_id?: boolean; channel_secret_ref?: boolean; access_token_ref?: boolean; line_verified_at?: string | null }): LineStep[] {
  const pub = !!(c.login_channel_id && c.liff_id && c.bot_basic_id);
  return [
    { key: "public", name: "公開の値（ログインのチャネル ID・LIFF ID・ボットの ID）", done: pub, note: pub ? "入力済み" : "未入力" },
    { key: "secret", name: "チャネルシークレット", done: !!c.channel_secret_ref, note: c.channel_secret_ref ? "入力済み" : "未入力" },
    { key: "token", name: "アクセストークン", done: !!c.access_token_ref, note: c.access_token_ref ? "入力済み" : "未入力" },
    { key: "verify", name: "友だち追加と連携の確かめ", done: !!c.line_verified_at, note: c.line_verified_at ? "確かめ済み" : "未確認" },
  ];
}
/** 公開の値の形（画面で先に見る・DB も検査する） */
export function linePublicErrOf(v: { login_channel_id: string; liff_id: string; bot_basic_id: string }): string | null {
  if (!/^\d{6,20}$/.test(v.login_channel_id.trim())) return "ログインのチャネル ID は数字です";
  if (!/^\d{6,20}-[A-Za-z0-9]{4,20}$/.test(v.liff_id.trim())) return "LIFF ID の形が違います（例 1234567890-abcdefgh）";
  if (!/^@[A-Za-z0-9_.-]{2,30}$/.test(v.bot_basic_id.trim())) return "ボットの ID は @ から始まります";
  return null;
}

/** 代行の窓口の英語のエラー → 画面の文（英語を出さない） */
export function assistErrJa(msg: string | null | undefined): string {
  const m = msg ?? "";
  if (/stale/.test(m)) return "オーナーが先に保存しました。読み直してから入れてください";
  if (/forbidden \(demo\)/.test(m)) return "デモの会社には書けません";
  if (/forbidden/.test(m)) return "今は代行で書けません（導入完了の後はサポート許可の間だけ）";
  if (/setup done/.test(m)) return "初期設定は確定済みです。店の設定は店の画面で直します";
  if (/no link/.test(m)) return "LINE とつながった人がまだいません（友だち追加と連携をしてもらってから確かめます）";
  if (/bad key|bad value|bad patch/.test(m)) return "入力の形が違います";
  if (/bad secret|bad kind/.test(m)) return "値が空か長すぎます";
  if (/bad name/.test(m)) return "源氏名を入れてください（40 字まで）";
  if (/promoted/.test(m)) return "本登録の済んだ人は取り下げられません";
  if (/bad step/.test(m)) return "STEP の番号が違います";
  return "保存できませんでした。時間をおいてもう一度お試しください";
}

/** 下書きの札（確定の画面と運営の画面）＝assisted の STEP ごとの「運営が入力（日時）」 */
export type AssistedMark = { step: number; who: string; at: string };
export function assistedMarksOf(assisted: unknown): AssistedMark[] {
  if (!assisted || typeof assisted !== "object") return [];
  return Object.entries(assisted as Record<string, { who?: string; at?: string }>)
    .map(([k, v]) => ({ step: Number(k), who: String(v?.who ?? "運営"), at: String(v?.at ?? "") }))
    .filter((x) => Number.isInteger(x.step) && x.step >= 1 && x.step <= 9 && x.at)
    .sort((a, b) => a.step - b.step);
}

/** 仮の登録の本登録の入力（生年月日は必須・本名は任意） */
export function promoteErrOf(birthday: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return "生年月日を入れてください";
  return null;
}
