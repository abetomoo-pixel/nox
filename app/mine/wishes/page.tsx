import { createClient } from "@/lib/supabase/server";
import { fmtWin } from "@/lib/nox/shift-time";
import WishForm from "./wish-form";
import WithdrawButton from "./withdraw-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "審査中", accepted: "採用", rejected: "見送り", withdrawn: "取下げ",
};

// 希望シフト（shift_wishes＝パターン1・自分の行のみ）。
export default async function WishesPage() {
  const supabase = await createClient();
  const { data: wishes } = await supabase
    .from("shift_wishes")
    .select("id, date, start_hm, end_hm, status")
    .order("date", { ascending: false })
    .limit(20);

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 20 }}>希望シフト</h1>

      <section style={{ border: "1px solid #ebebeb", borderRadius: 8, padding: 16, background: "#fff", marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>希望を提出</h2>
        <WishForm />
      </section>

      <section style={{ border: "1px solid #ebebeb", borderRadius: 8, padding: 16, background: "#fff" }}>
        <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>提出済み</h2>
        {(wishes ?? []).length === 0 && <p style={{ fontSize: 13, color: "#8f8f8f" }}>提出なし</p>}
        <ul style={{ listStyle: "none", padding: 0, fontSize: 13 }}>
          {(wishes ?? []).map((w) => (
            <li
              key={w.id as string}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", borderBottom: "1px solid #f4f4f5" }}
            >
              <span>{w.date}</span>
              <span>{fmtWin(w.start_hm as string, w.end_hm as string)}</span>
              <span style={{ color: "#6b6b6b" }}>{STATUS_LABEL[w.status as string] ?? w.status}</span>
              {w.status === "pending" && <WithdrawButton wishId={w.id as string} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
