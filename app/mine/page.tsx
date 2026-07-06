import { createClient } from "@/lib/supabase/server";
import { bizDateOf } from "@/lib/nox/biz-date";
import { fmtWin } from "@/lib/nox/shift-time";
import PunchActions from "./punch-actions";
import AttendanceForm from "./attendance-form";

export const dynamic = "force-dynamic";

const yen = (n: number) => "¥" + n.toLocaleString();
const ATT_LABEL: Record<string, string> = {
  shukkin: "出勤", dohan: "同伴", late: "遅刻連絡", off: "休み", absent: "当欠連絡",
};

// cast マイページ。SELECT はパターン1テーブルのみ（RLS が自分の行だけ返す＝可視性の物理保証）。
export default async function MinePage() {
  const supabase = await createClient();
  const bizToday = bizDateOf(new Date().toISOString(), "06:00");
  const month = bizToday.slice(0, 7);

  // 今月のバック（check_cast_backs＝パターン1）。月の帰属は行の created_at（≒close 時刻）を
  // 営業日に変換して判定（表示用の近似・給与の厳密集計は F2 のサーバ集計が正）。
  const { data: backs } = await supabase
    .from("check_cast_backs")
    .select("drink_back, champ_back, bottle_back, hon_pt_alloc, created_at");
  const inMonth = (backs ?? []).filter(
    (b) => bizDateOf(b.created_at as string, "06:00").slice(0, 7) === month,
  );
  const sum = inMonth.reduce(
    (a, b) => ({
      drink: a.drink + b.drink_back,
      champ: a.champ + b.champ_back,
      bottle: a.bottle + b.bottle_back,
      pt: a.pt + b.hon_pt_alloc,
    }),
    { drink: 0, champ: 0, bottle: 0, pt: 0 },
  );
  const total = sum.drink + sum.champ + sum.bottle;

  // 最終打刻（自分の行のみ）
  const { data: punches } = await supabase
    .from("punches")
    .select("type, punched_at")
    .order("punched_at", { ascending: false })
    .limit(1);
  const last = punches?.[0];

  // 直近の確定シフト
  const { data: shifts } = await supabase
    .from("shifts")
    .select("date, start_hm, end_hm, status")
    .gte("date", bizToday)
    .order("date")
    .limit(7);

  // 今月の勤怠
  const { data: att } = await supabase
    .from("attendance")
    .select("date, status, eta")
    .gte("date", `${month}-01`)
    .order("date", { ascending: false })
    .limit(10);

  // 今月の出勤ボーナス（attendance_incentives＝パターン3・店の published を可視）。
  // 受給は当日の確定シフト出勤（final∈{ok,late}）が条件・確定額は給与確定時。pooled は受給者数で変動＝暫定表示。
  const { data: incentives } = await supabase
    .from("attendance_incentives")
    .select("biz_date, amount_mode, amount")
    .eq("status", "published")
    .gte("biz_date", `${month}-01`)
    .order("biz_date", { ascending: false })
    .limit(20);

  // 確定済み給与明細（payslips＝金額系・cast 本人可視）。breakdown_json.ar の売掛天引き額を表示（F2e-1）。
  const { data: slips } = await supabase
    .from("payslips")
    .select("period, net, breakdown_json")
    .order("period", { ascending: false })
    .limit(6);
  type ArEntry = { action?: string; amount?: number };
  const arTotal = (bj: unknown): number => {
    const ar = (bj as { ar?: ArEntry[] } | null)?.ar ?? [];
    return ar.reduce((s, e) => s + (e.action === "deducted" ? e.amount ?? 0 : 0), 0);
  };

  const card: React.CSSProperties = {
    border: "1px solid #ebebeb", borderRadius: 8, padding: 16, background: "#fff", marginBottom: 16,
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 20 }}>マイページ</h1>

      <section style={card}>
        <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>確定給与明細</h2>
        {(slips ?? []).length === 0 && <p style={{ fontSize: 13, color: "#8f8f8f" }}>確定分なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13 }}>
          {(slips ?? []).map((s, i) => {
            const ar = arTotal(s.breakdown_json);
            return (
              <li key={i}>
                {s.period}: 手取り {yen(s.net as number)}
                {ar > 0 ? <span style={{ color: "#c0392b" }}>（売掛天引き −{yen(ar)}）</span> : null}
              </li>
            );
          })}
        </ul>
        <p style={{ fontSize: 12, color: "#8f8f8f", margin: 0 }}>※確定後の明細です。売掛の未収残は店にご確認ください。</p>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>今月のバック（{month}）</h2>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{yen(total)}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#404040", marginTop: 8 }}>
          <span>ドリンク {yen(sum.drink)}</span>
          <span>シャンパン {yen(sum.champ)}</span>
          <span>ボトル {yen(sum.bottle)}</span>
          <span>本指名商品 {sum.pt}pt</span>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>今月の出勤ボーナス（{month}）</h2>
        {(incentives ?? []).length === 0 && <p style={{ fontSize: 13, color: "#8f8f8f" }}>発行なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13 }}>
          {(incentives ?? []).map((r, i) => (
            <li key={i}>
              {r.biz_date}{" "}
              {r.amount_mode === "per_head"
                ? `定額 ${yen(r.amount as number)}`
                : `プール ${yen(r.amount as number)}（受給者数により変動・暫定）`}
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 12, color: "#8f8f8f", margin: 0 }}>
          ※受給は当日の確定シフト出勤が条件・確定額は給与確定時に算出。
        </p>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>打刻</h2>
        <p style={{ fontSize: 13, color: "#404040" }}>
          最終打刻:{" "}
          {last
            ? `${last.type === "in" ? "出勤" : "退勤"}（${new Date(last.punched_at as string).toLocaleString("ja-JP")}）`
            : "なし"}
        </p>
        <PunchActions />
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>遅刻・当欠の連絡</h2>
        <AttendanceForm defaultDate={bizToday} />
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>直近のシフト</h2>
        {(shifts ?? []).length === 0 && <p style={{ fontSize: 13, color: "#8f8f8f" }}>予定なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13 }}>
          {(shifts ?? []).map((s, i) => (
            <li key={i}>
              {s.date} {fmtWin(s.start_hm as string, s.end_hm as string)}{" "}
              <span style={{ color: "#8f8f8f" }}>（{s.status === "confirmed" ? "確定" : "予定"}）</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>今月の勤怠</h2>
        {(att ?? []).length === 0 && <p style={{ fontSize: 13, color: "#8f8f8f" }}>記録なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13 }}>
          {(att ?? []).map((a, i) => (
            <li key={i}>
              {a.date} {ATT_LABEL[a.status as string] ?? a.status}
              {a.eta ? `（出勤見込み ${a.eta}）` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
