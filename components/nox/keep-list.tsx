"use client";

// ★連続便 3 追補 P-9（裁定419 候補・0175 v2 ★22）: 顧客管理の上段タブ「キープボトル」＝店の全キープの一覧
//   列＝タグ名｜顧客｜担当｜ボトル｜残量｜棚｜最終利用日｜状態。検索＝タグ名・顧客名・ボトル名の部分一致。並び＝棚→最終利用日。行を押すと顧客詳細のキープの節へ。
//   390px＝カード型（タグ名を大きく・棚と残量を 2 行目）。RULES_0175_APPLIED=false の間は mount されない（customers-board が rules0175On() で出し分け）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message } from "@/components/ui/toast"; // ★裁定281: メッセージ表示の共通部品
import { keepSearchOf, keepSortOf, keepStatusLabelOf, keepTagOf, type KeepListRow } from "@/lib/nox/rules-0175/keeps";

type Raw = { id: string; customer_id: string | null; product_id: string; bottle_name: string | null; tag_label: string | null; remaining_pct: number | null; shelf_no: string | null; last_used_at: string | null; status: string; store_id: string };

export default function KeepList({ storeId, casts }: { storeId: string | null; casts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<KeepListRow[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    let kq = supabase.from("bottle_keeps").select("id, customer_id, product_id, bottle_name, tag_label, remaining_pct, shelf_no, last_used_at, status, store_id").in("status", ["active", "pending", "empty"]);
    if (storeId) kq = kq.eq("store_id", storeId);
    const { data: ks, error } = await kq;
    if (error) { setErr(`キープの読み込みに失敗: ${error.message}`); setRows([]); return; }
    const raw = (ks ?? []) as Raw[];
    const cids = [...new Set(raw.map((k) => k.customer_id).filter((x): x is string => !!x))];
    const pids = [...new Set(raw.map((k) => k.product_id))];
    const [{ data: cs }, { data: ps }] = await Promise.all([
      cids.length ? supabase.from("customers").select("id, name, cast_id").in("id", cids) : Promise.resolve({ data: [] as { id: string; name: string; cast_id: string | null }[] }),
      pids.length ? supabase.from("products").select("id, name").in("id", pids) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const cName = new Map(((cs ?? []) as { id: string; name: string; cast_id: string | null }[]).map((c) => [c.id, c]));
    const pName = new Map(((ps ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
    setRows(raw.map((k) => {
      const c = k.customer_id ? cName.get(k.customer_id) : undefined;
      const bottle = k.bottle_name ?? pName.get(k.product_id) ?? "（ボトル）";
      return { id: k.id, tag: keepTagOf(k, c?.name, bottle), customer: c?.name ?? "—", cast: (c?.cast_id && casts.find((x) => x.id === c.cast_id)?.name) || "フリー", bottle, remaining_pct: k.remaining_pct, shelf_no: k.shelf_no, last_used_at: k.last_used_at, status: k.status, customer_id: k.customer_id };
    }));
  }, [storeId, casts]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => keepSortOf(keepSearchOf(rows ?? [], q)), [rows, q]);
  const go = (r: KeepListRow) => { if (r.customer_id) router.push(`/customers/${r.customer_id}#keeps`); };
  const fmt = (iso: string | null) => (iso ? iso.slice(0, 10).replace(/^\d{4}-/, "").replace("-", "/") : "—");

  return (
    <section className="nox-cardtop" style={t.card} data-keep-list="1">
      <div className="nox-ctoolbar" style={{ marginBottom: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="タグ名・顧客名・ボトル名で検索" aria-label="キープの検索" style={{ ...t.input, width: 260 }} />
        <span style={{ fontSize: 12, color: "var(--sub)" }}>{rows === null ? "読み込み中…" : `${shown.length} 本`}</span>
      </div>
      {err && <Message kind="error">{err}</Message>}
      {rows !== null && shown.length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: 0 }}>キープはありません</p>}
      {shown.length > 0 && (
        <div className="nox-tablewrap">
          <table className="nox-table cardrows" style={{ width: "100%", fontSize: 13 }}>
            <thead><tr><th>タグ名</th><th>顧客</th><th>担当</th><th>ボトル</th><th>残量</th><th>棚</th><th>最終利用日</th><th>状態</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} data-keep-row={r.id} onClick={() => go(r)} style={{ cursor: r.customer_id ? "pointer" : "default" }}>
                  <td data-label="タグ名" style={{ fontWeight: 800 }}>{r.tag}</td>
                  <td data-label="顧客">{r.customer}</td>
                  <td data-label="担当">{r.cast}</td>
                  <td data-label="ボトル">{r.bottle}</td>
                  <td data-label="残量" className="num">{r.remaining_pct != null ? `${r.remaining_pct}%` : "—"}</td>
                  <td data-label="棚">{r.shelf_no ?? "—"}</td>
                  <td data-label="最終利用日" className="num">{fmt(r.last_used_at)}</td>
                  <td data-label="状態">{keepStatusLabelOf(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
