// ★便 SU（M-37 殻だけ・2026-10-30）: 初期設定の関所（純関数・DB を知らない）。
//   (3) setup_done=false の店がある org は、owner／manager／staff とも他画面へ行けない＝/setup へ戻す。cast（/mine）とデモ org は除外。
//   /setup 自身（と配下）は通す。role null（未ログイン）は layout が /login に飛ばす＝ここは null。
export function setupGateRedirectOf(a: { role: string | null; isDemo: boolean; needsSetup: boolean; pathname: string }): string | null {
  if (!a.role || a.role === "cast" || a.isDemo || !a.needsSetup) return null;
  if (a.pathname === "/setup" || a.pathname.startsWith("/setup/")) return null;
  return "/setup";
}
/** /setup は専用の殻（左ナビ・上部バーの外）＝layout が children だけを描く */
export const isSetupPath = (pathname: string): boolean => pathname === "/setup" || pathname.startsWith("/setup/");
