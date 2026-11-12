// ★■K-2a（2026-11-12 相談役）: /auth/set-password の流れごとの文言（純関数・DB を知らない）。
//   メールのリンク＝{{ .SiteURL }}/auth/set-password?token_hash=…&type=recovery|invite|email|magiclink（cross_device_links.md）。
//   画面を開いただけでは合言葉（token_hash）を使わない＝本人が「続ける」を押したときに verifyOtp（メールの安全確認が先に開いても使われない）。
//   英語のエラーは画面に出さない（setPasswordErrJa で和文に置き換える）。
export type SetPasswordFlow = "invite" | "recovery" | "email" | "magiclink";
export type OtpType = "invite" | "recovery" | "email" | "magiclink";

/** URL の type（query か hash）→ 流れ。signup は旧名＝確認（email）と同じ。不明は招待 */
export function setPasswordFlowOf(type: string | null | undefined): SetPasswordFlow {
  if (type === "recovery") return "recovery";
  if (type === "email" || type === "signup") return "email";
  if (type === "magiclink") return "magiclink";
  return "invite";
}
/** verifyOtp に渡す type（signup は email で受ける） */
export const otpTypeOf = (flow: SetPasswordFlow): OtpType => flow;

type Copy = { title: string; confirm: string; confirmBtn: string; loading: string; ready: string; submit: string; fail: string };
export const SET_PASSWORD_COPY: Record<SetPasswordFlow, Copy> = {
  invite: {
    title: "NOX へようこそ",
    confirm: "お店への招待を受けて、ログイン用のパスワードを決めます。",
    confirmBtn: "続ける",
    loading: "招待を確かめています…",
    ready: "ログイン用のパスワードを決めてください。決めたら、お店の初期設定に進みます。",
    submit: "パスワードを決めて始める",
    fail: "この招待のリンクは使えません（期限切れか、すでに使われています）。運営に再発行を依頼してください。",
  },
  recovery: {
    title: "パスワードの再設定",
    confirm: "新しいパスワードを設定します。",
    confirmBtn: "続ける",
    loading: "リンクを確かめています…",
    ready: "新しいパスワードを決めてください。",
    submit: "新しいパスワードを設定する",
    fail: "この再設定のリンクは使えません（期限切れか、すでに使われています）。ログイン画面の「パスワードをお忘れの方」から、もう一度お手続きください。",
  },
  email: {
    title: "メールアドレスの確認",
    confirm: "メールアドレスを確認して、ログイン用のパスワードを決めます。",
    confirmBtn: "続ける",
    loading: "リンクを確かめています…",
    ready: "メールアドレスを確認しました。ログイン用のパスワードを決めてください。",
    submit: "パスワードを決めて始める",
    fail: "この確認のリンクは使えません（期限切れか、すでに使われています）。お店か運営にお問い合わせください。",
  },
  magiclink: {
    title: "ログイン",
    confirm: "NOX にログインします。",
    confirmBtn: "ログインする",
    loading: "リンクを確かめています…",
    ready: "ログインしました。移動します…",
    submit: "",
    fail: "このログイン用のリンクは使えません（期限切れか、すでに使われています）。ログイン画面からもう一度お試しください。",
  },
};

/** パスワード保存の失敗（route の返り）→ 和文。英語の文言は画面に出さない */
export function setPasswordErrJa(status: number, error: string | null | undefined): string {
  const e = error ?? "";
  if (/[ぁ-んァ-ヶ一-龠]/.test(e)) return e; // invitePasswordErrorOf などの和文はそのまま
  if (status === 401) return "ログインの有効期限が切れました。メールのリンクから、もう一度お手続きください。";
  if (status === 403) return "このアカウントではパスワードを変えられません。";
  if (/weak|short|characters/i.test(e)) return "このパスワードは使えません。別のパスワードにしてください。";
  if (/same|different from the old/i.test(e)) return "今のパスワードと同じです。別のパスワードにしてください。";
  return `設定できませんでした（${status}）。時間をおいて、もう一度お試しください。`;
}
