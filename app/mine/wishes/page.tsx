import { createClient } from "@/lib/supabase/server";
import { fmtWin } from "@/lib/nox/shift-time";
import * as t from "@/lib/nox/ui/theme";
import WishForm from "./wish-form";
import WithdrawButton from "./withdraw-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "審査中", accepted: "採用", rejected: "見送り", withdrawn: "取下げ",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "var(--champ)", accepted: "var(--ok)", rejected: "var(--sub)", withdrawn: "var(--sub)",
};

// 希望シフト（shift_wishes＝パターン1・自分の行のみ）。取下げは pending のみ（RPC 側でも enforce）。
export default async function WishesPage() {
  const supabase = await createClient();
  const { data: wishes } = await supabase
    .from("shift_wishes")
    .select("id, date, start_hm, end_hm, status")
    .order("date", { ascending: false })
    .limit(20);

  const title: React.CSSProperties = t.cardTitle;

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>希望シフト</h1>
        <p style={t.pheadP}>希望を提出・審査状況を確認</p>
      </div>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>希望を提出</h2>
        <WishForm />
      </section>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>提出済み</h2>
        {(wishes ?? []).length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>提出なし</p>}
        <ul style={{ listStyle: "none", padding: 0, fontSize: 13, margin: 0 }}>
          {(wishes ?? []).map((w) => (
            <li
              key={w.id as string}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line)" }}
            >
              <span style={t.num}>{w.date}</span>
              <span style={t.num}>{fmtWin(w.start_hm as string, w.end_hm as string)}</span>
              <span style={{ color: STATUS_COLOR[w.status as string] ?? "var(--sub)", fontWeight: 700, fontSize: 12 }}>
                {STATUS_LABEL[w.status as string] ?? w.status}
              </span>
              {w.status === "pending" && <WithdrawButton wishId={w.id as string} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
