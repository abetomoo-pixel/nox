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

/** ★決め 3（2026-11-28 Agoora）: 月給・月額固定・日給の人には固定手当を足さない（月額・日額だけ）。
 *  その形で保存するときに外れる固定手当の額＝契約の 1 本（fixed_allowance）＋名称つきの行（staff_allowances）。時給で保存するとき・契約が無いときは 0（外さない）。
 *  契約の 1 本が月額・日額の置き場になっている旧データ（実効が月給・日給で、その列が空）は手当に数えない＝額の欄に入って月額・日額の列へ移るだけ（staffPayOf の monthly ?? fixed_allowance と同じ読み） */
export const staffAllowanceDropOf = (c: { pay_kind?: string | null; hourly: number; fixed_allowance: number; monthly?: number | null; daily?: number | null; allowances?: readonly { amount: number }[] | null } | null | undefined, nextPayKind: string): number => {
  if (!c || nextPayKind === "hourly") return 0;
  const pk = effectivePayKindOf(c);
  const asBase = pk !== "hourly" && (pk === "daily" ? c.daily == null : c.monthly == null);
  return (asBase ? 0 : Math.max(0, c.fixed_allowance)) + (c.allowances ?? []).reduce((a, x) => a + (x.amount > 0 ? x.amount : 0), 0);
};
/** 給与の形の名前（確かめの文に使う） */
export const PAY_KIND_JA: Record<string, string> = { hourly: "時給", monthly: "月給", monthly_fixed: "月額固定", daily: "日給" };
/** ★決め 3: 保存の前の確かめの文（額は円・桁区切り） */
export const staffAllowanceDropNoteOf = (drop: number, nextPayKind: string): string => `固定手当 ${drop.toLocaleString("ja-JP")}円は外れます（${PAY_KIND_JA[nextPayKind] ?? "月給・日給"}には固定手当を足しません）。保存しますか`;
