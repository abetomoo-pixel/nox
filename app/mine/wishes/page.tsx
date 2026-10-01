import { createClient } from "@/lib/supabase/server";
import * as t from "@/lib/nox/ui/theme";
import WishForm from "./wish-form";
import WithdrawButton from "./withdraw-button";
import { mineSettingsOf } from "@/lib/nox/store/mine-settings"; // ★裁定326-7（便 M4-1）: 店設定 shift_request_mode（'shift'／'off_only'）
import { wishPageTextOf, wishRowLabelOf } from "@/lib/nox/mine/wish-mode";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "審査中", accepted: "採用", rejected: "見送り", withdrawn: "取下げ",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "var(--champ)", accepted: "var(--ok)", rejected: "var(--sub)", withdrawn: "var(--sub)",
};

// シフト希望（shift_wishes＝パターン1・自分の行のみ）。取下げは pending のみ（RPC 側でも enforce）。
// ★裁定326-7（便 M4-1）: 「シフト希望」に改名。店設定 'off_only' は「休み希望」モード（kind 'off'・時刻なし）＝文言と提出引数は wish-mode の純関数。
export default async function WishesPage() {
  const supabase = await createClient();
  const { data: storeRow } = await supabase.from("stores").select("settings_json").limit(1).maybeSingle(); // cast の RLS で自店 1 行（mig0106）
  const mode = mineSettingsOf(storeRow?.settings_json).shift_request_mode;
  const text = wishPageTextOf(mode);
  const { data: wishes } = await supabase
    .from("shift_wishes")
    .select("id, date, start_hm, end_hm, status, kind")
    .order("date", { ascending: false })
    .limit(20);

  const title: React.CSSProperties = t.cardTitle;

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>{text.title}</h1>
        <p style={t.pheadP}>{text.sub}</p>
      </div>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>{text.submitHeading}</h2>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>{text.note}</p>
        <WishForm mode={mode} />
      </section>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>提出済み</h2>
        {(wishes ?? []).length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>提出なし</p>}
        <ul style={{ listStyle: "none", padding: 0, fontSize: 13, margin: 0 }}>
          {(wishes ?? []).map((w) => (
            <li
              key={w.id as string}
              className="nox-listrow" style={{ gap: 12, padding: "8px 0" }}
            >
              <span style={t.num}>{w.date}</span>
              <span style={t.num}>{wishRowLabelOf({ kind: w.kind as string | null, start_hm: w.start_hm as string | null, end_hm: w.end_hm as string | null })}</span>
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
