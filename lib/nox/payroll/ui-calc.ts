// U-1（裁定99）給与画面の表示層 純関数。DB を知らず preview 行／凍結値の数値を合算・導出するだけ＝
// money-core（payOf / computePayrollDraft の計算）は不触。export＝verify が DB 非依存で係留する（裁定99-⑨・
// allocateCategory / sanctionWarningsOf と同じ建付け）。
// 欠落キーは 0 円扱い（2026-07-28 既定＝payroll-board の確定期 sum4 と同一の既定・率計算も整合補正もしない）。

export type DraftKpiRow = {
  net: number;
  breakdown?: {
    pay: {
      gross?: number; fixedDed?: number; fine?: number; withholding?: number;
      arDeduct?: number; advanceDeduct?: number; okuriDeduct?: number; normPenalty?: number;
    };
    extras?: { amount?: number }[];
  };
};

export type Kpi4 = { gross: number; ded: number; wh: number; net: number; n: number };

// 裁定99-③: draft 期の KPI 4種＝プレビュー rows から表示層で合算（確定期の sum4 と逐語同一の定義＝
//   総支給 = gross + Σextras／控除計 = 7項目の和（源泉含む）／うち源泉 = withholding／差引 = row.net）。
export function kpiOfDraftRows(rows: DraftKpiRow[]): Kpi4 {
  const z = (v: number | undefined) => v ?? 0;
  let gross = 0, ded = 0, wh = 0, net = 0;
  for (const r of rows) {
    const pay = r.breakdown?.pay ?? {};
    const extras = (r.breakdown?.extras ?? []).reduce((a, e) => a + (e.amount ?? 0), 0);
    gross += z(pay.gross) + extras;
    ded += z(pay.fixedDed) + z(pay.fine) + z(pay.withholding) + z(pay.arDeduct)
      + z(pay.advanceDeduct) + z(pay.okuriDeduct) + z(pay.normPenalty);
    wh += z(pay.withholding);
    net += r.net;
  }
  return { gross, ded, wh, net, n: rows.length };
}

// 裁定99-④: 要対応の整形＝blockers（確定を止める）＋ warnings（裁定98・止めない）を1本のリストへ。
//   0件のときの「要対応なし」表示は呼び元の責務。
export type DraftIssue = { castName: string; label: string; detail: string; kind: "blocker" | "warning" };

export const ISSUE_BLOCKER_JA: Record<string, string> = {
  no_tax: "税区分未登録", no_plan: "プラン未設定", no_employment: "雇用/委託未設定",
};
export const ISSUE_WARNING_JA: Record<string, string> = {
  sanction_capped: "制裁控除を法定上限で制限", sanction_contractor: "委託への制裁控除",
  avg_wage_provisional: "平均賃金が暫定式",
};

export function issuesOfDraft(
  blockers: { castName: string; reason: string }[],
  warnings: { castName: string; kind: string; detail: string }[],
): DraftIssue[] {
  return [
    ...blockers.map((b) => ({
      castName: b.castName, label: ISSUE_BLOCKER_JA[b.reason] ?? b.reason,
      detail: "確定できません（登録を解消してください）", kind: "blocker" as const,
    })),
    ...warnings.map((w) => ({
      castName: w.castName, label: ISSUE_WARNING_JA[w.kind] ?? w.kind,
      detail: w.detail, kind: "warning" as const,
    })),
  ];
}
