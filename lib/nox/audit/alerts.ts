// ★便 W-10 #2／#5／#7（2026-10-26）: 操作履歴の要確認・取消の承認者と理由・CSV 出力の純関数（DB を知らない）。
export type AuditLogLike = { id: string; action: string; target: string | null; actor_user_id: string | null; at: string; before_json: Record<string, unknown> | null; after_json: Record<string, unknown> | null; store_id?: string | null; reason?: string | null };

/** 高額の取消のしきい値（円・既定 50,000）と営業時間外（JST の時＝既定 6〜17 時台＝夜の店の営業外）。数字は器なし＝定数（台帳に記録） */
export const AUDIT_HIGH_VOID_YEN = 50_000;
export const AUDIT_OFF_HOURS: readonly [number, number] = [6, 18]; // [開始, 終了) の時
const SENSITIVE_ACTIONS = ["read_cast_sensitive", "read_cast_mynumber_masked", "cast_create_sensitive"];

const jstHourOf = (iso: string): number => (new Date(iso).getUTCHours() + 9) % 24;
const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : 0);

export type AuditAlert = { id: string; at: string; kind: "high_void" | "off_hours_sensitive"; label: string; target: string | null; actor_user_id: string | null };
/** 要確認＝①取消（check_void）の伝票額がしきい値以上 ②機微情報の閲覧が営業時間外（JST 6〜17 時台） */
export function auditAlertsOf(logs: readonly AuditLogLike[], opt: { highVoid?: number; offHours?: readonly [number, number] } = {}): AuditAlert[] {
  const hv = opt.highVoid ?? AUDIT_HIGH_VOID_YEN; const [h0, h1] = opt.offHours ?? AUDIT_OFF_HOURS;
  const out: AuditAlert[] = [];
  for (const l of logs) {
    if (l.action === "check_void") {
      const total = Math.max(num(l.before_json?.total), num(l.after_json?.total), num(l.before_json?.due), num(l.after_json?.due));
      if (total >= hv) out.push({ id: l.id, at: l.at, kind: "high_void", label: `高額の伝票の取消（¥${total.toLocaleString("en-US")}）`, target: l.target, actor_user_id: l.actor_user_id });
    } else if (SENSITIVE_ACTIONS.includes(l.action)) {
      const h = jstHourOf(l.at);
      if (h >= h0 && h < h1) out.push({ id: l.id, at: l.at, kind: "off_hours_sensitive", label: `営業時間外の機微情報の閲覧（${String(h).padStart(2, "0")} 時台）`, target: l.target, actor_user_id: l.actor_user_id });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** 取消の承認者と理由（伝票の取消＝after_json の voided_by／void_reason・それ以外は audit の reason）。無ければ null */
export function voidApproverReasonOf(l: AuditLogLike): { approverUserId: string | null; reason: string | null } {
  const a = l.after_json ?? {};
  const approver = typeof a.voided_by === "string" ? a.voided_by : null;
  const reason = typeof a.void_reason === "string" && a.void_reason.trim() ? a.void_reason.trim() : typeof a.note === "string" && a.note.trim() ? a.note.trim() : l.reason?.trim() || null;
  return { approverUserId: approver, reason };
}

/** 監査ログの CSV（BOM UTF-8・CRLF）＝日時（JST）／操作／対象／操作担当／店／理由／変更前／変更後 */
export function auditCsvOf(logs: readonly AuditLogLike[], nameOf: (uid: string | null) => string, storeOf: (sid: string | null | undefined) => string): string {
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const jst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
  const head = ["日時", "操作", "対象", "操作担当", "店", "理由", "変更前", "変更後"];
  const rows = logs.map((l) => [jst(l.at), l.action, l.target ?? "", nameOf(l.actor_user_id), storeOf(l.store_id), l.reason ?? "", l.before_json ? JSON.stringify(l.before_json) : "", l.after_json ? JSON.stringify(l.after_json) : ""]);
  return "﻿" + [head, ...rows].map((r) => r.map((c) => esc(String(c))).join(",")).join("\r\n");
}
/** 出力の入力の検査（RPC の鏡）＝期間の逆は不可・目的は必須（200 字） */
export function auditExportErrorOf(from: string, to: string, purpose: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return "期間を選んでください";
  if (to < from) return "期間の終わりは始まりより後にしてください";
  const p = purpose.trim(); if (!p) return "利用目的を入れてください"; if (p.length > 200) return "利用目的は 200 字までです";
  return null;
}
