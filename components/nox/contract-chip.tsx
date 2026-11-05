"use client";

// ★便 D M-99（2026-11-05・相談役）: 契約チップ（「正社員・月給 ¥300,000」「基本プラン」）＝役割チップ（rolePillMini のスタッフ）と同じトークン＝
//   文字は本文色（var(--ink)）・輪郭だけ（var(--line2)）・地は透明。旧 .nox-stpill の color var(--v2-muted) はコントラスト不足（Agoora 実機）。
//   使う場所＝/staff 一覧（押すと働き方の編集）・給与 › 勤怠（スタッフ）の契約列・キャスト管理のプラン名。
import type { CSSProperties, MouseEvent } from "react";

export const CONTRACT_CHIP_STYLE: CSSProperties = {
  display: "inline-block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.2, borderRadius: 999, padding: "2px 8px",
  color: "var(--ink)", background: "transparent", border: "1px solid var(--line2)", whiteSpace: "nowrap", lineHeight: 1.5,
};

export default function ContractChip({ text, onClick, title, style, dataSet, dataKey = "data-contract-chip" }: {
  text: string; onClick?: (e: MouseEvent<HTMLButtonElement>) => void; title?: string; style?: CSSProperties;
  /** data-contract-chip の値（例 "set"／"none"） */ dataSet?: string; dataKey?: string;
}) {
  const data = { [dataKey]: dataSet ?? "1" } as Record<string, string>;
  if (onClick) return <button type="button" className="nox-contract-chip" {...data} title={title} style={{ ...CONTRACT_CHIP_STYLE, cursor: "pointer", ...style }} onClick={onClick}>{text}</button>;
  return <span className="nox-contract-chip" {...data} title={title} style={{ ...CONTRACT_CHIP_STYLE, ...style }}>{text}</span>;
}
