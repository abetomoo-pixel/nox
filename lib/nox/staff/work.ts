// ★便 A M-80（2026-11-04）: 「働き方」の純関数＝/staff の編集モーダル（components/nox/staff-work-section.tsx）と verify（m65）で共有。DB を知らない。
//   給与の形は雇用形態で候補が変わる＝staff_contract_set（0176）の検査と同じ（委託＝daily／monthly_fixed・雇用＝hourly／monthly）。

export const CONTRACT_KIND_OPTS = [["contractor", "業務委託"], ["parttime", "アルバイト・パート"], ["employee", "正社員"]] as const;

/** 給与の形の候補（雇用形態ごと） */
export const payKindOptsOf = (contractKind: string): ReadonlyArray<readonly [string, string]> =>
  contractKind === "contractor" ? ([["daily", "日給"], ["monthly_fixed", "月額固定"]] as const) : ([["hourly", "時給"], ["monthly", "月給"]] as const);

/** 額の列名（monthly_fixed は monthly 列に入る） */
export const payAmountKeyOf = (payKind: string): "hourly" | "daily" | "monthly" => (payKind === "daily" ? "daily" : payKind === "hourly" ? "hourly" : "monthly");

/** 今月（YYYY-MM・端末のローカル） */
export const monthOfToday = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

/** 月の加減（YYYY-MM） */
export const monthShiftOf = (ym: string, n: number): string => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

/** 口座の種別（個人情報の bank_account_type＝ordinary／checking／savings）＝ボタン群の表示（M-80 追記③） */
export const BANK_ACCOUNT_TYPE_OPTS = [["ordinary", "普通"], ["checking", "当座"], ["savings", "貯蓄"]] as const;

/** ★M-90（2026-11-05・不具合）: 契約の実効の給与の形＝pay_kind が 'hourly'（列の既定）のままでも 時給 0・月額（monthly か旧データの fixed_allowance）>0 なら月給・日額>0 なら日給
 *  ＝staffContractLineOf（一覧の「月給 ¥300,000」）と同じ読み。編集欄を開いたときに現在の契約（雇用形態・給与の形・額）が入る */
export const effectivePayKindOf = (c: { pay_kind?: string | null; hourly: number; fixed_allowance: number; monthly?: number | null; daily?: number | null } | null | undefined): string => {
  if (!c) return "hourly";
  if (c.pay_kind && c.pay_kind !== "hourly") return c.pay_kind;
  if (c.hourly === 0 && (c.monthly ?? 0) > 0) return "monthly";
  if (c.hourly === 0 && (c.daily ?? 0) > 0) return "daily";
  if (c.hourly === 0 && c.fixed_allowance > 0) return "monthly";
  return "hourly";
};
