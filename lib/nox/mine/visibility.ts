// ★裁定491・492（2026-11-12 Agoora）: キャストの画面（/mine）の出し分け＝純関数（DB を知らない）。
//   491＝使わない設定の機能は枠・行・注記ごと出さない（出勤ボーナス＝sys_bonus・ノルマの出勤日数＝sys_norms・売掛の注記＝ar_enabled・送り＝okuri_mode）。
//   492＝payslip_visibility 'off'（給与明細を表示しない）の店は報酬の額を画面にもデータにも載せない（勤怠の金額の列と表の下の行・保証時給・出勤ボーナスの額）。
//   本人が負担する額（今日の控除・送り）は Agoora の答え待ち＝今のまま（ここでは扱わない）。
import { isSystemOn, type StoreSettings } from "@/lib/nox/store-systems";

export type MineVisibility = {
  payHidden: boolean;     // 492: 報酬の額を出さない（送らない）
  bonusCard: boolean;     // 491: 出勤ボーナスの枠
  normDays: boolean;      // 491: ノルマの出勤日数の行（出勤予定・契約の要約・勤怠の注記）
  arNote: boolean;        // 491: 明細の注記の「売掛」
  okuriNote: boolean;     // 491: 明細の注記の「送り」
};

export function mineVisibilityOf(settings: StoreSettings | Record<string, unknown> | null | undefined, payslipVisibility: string | null | undefined): MineVisibility {
  const s = (settings ?? {}) as Record<string, unknown>;
  return {
    payHidden: (payslipVisibility ?? "off") === "off",
    bonusCard: isSystemOn(s as StoreSettings, "sys_bonus"),
    normDays: isSystemOn(s as StoreSettings, "sys_norms"),
    arNote: s.ar_enabled === true,
    okuriNote: typeof s.okuri_mode === "string" ? s.okuri_mode !== "none" : true,
  };
}

/** 明細の下の注記（'detail'）＝使う制度の名前だけを並べる（前借りは常に） */
export function slipFootNoteOf(v: Pick<MineVisibility, "arNote" | "okuriNote">): string {
  const items = [v.arNote ? "売掛" : null, "前借り", v.okuriNote ? "送り" : null].filter(Boolean) as string[];
  return `※確定後の明細です。${items.join("・")}の未収残は店にご確認ください。`;
}

/** 492: 勤怠の行から金額を外す（サーバーで外してから client 部品へ渡す＝通信に載せない） */
export function stripKintaiPay<T extends { pay?: unknown }>(rows: readonly T[]): T[] {
  return rows.map((r) => { const { pay: _pay, ...rest } = r; void _pay; return rest as T; });
}
