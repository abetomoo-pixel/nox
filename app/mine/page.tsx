import { createClient } from "@/lib/supabase/server";
import { bizDateOf } from "@/lib/nox/biz-date";
import { fmtWin } from "@/lib/nox/shift-time";
import { loadCastSimData } from "@/lib/nox/payroll/sim-data";
import SimulatorPanel from "@/components/simulator-panel";
import * as t from "@/lib/nox/ui/theme";
import PunchActions from "./punch-actions";
import AttendanceForm from "./attendance-form";
import NormCard from "./norm-card";
import DrinkClaimForm from "./drink-claim-form";

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

  // 最終打刻(自分の行のみ)
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
  // breakdown_json の ar/adv/okuri（各要素は {action:'deducted'|'carried', amount}）から今期天引き合計（deducted 分）を出す。
  type DeductEntry = { action?: string; amount?: number };
  const deductTotal = (bj: unknown, key: "ar" | "adv" | "okuri"): number => {
    const arr = (bj as Record<string, DeductEntry[]> | null)?.[key] ?? [];
    return arr.reduce((s, e) => s + (e.action === "deducted" ? e.amount ?? 0 : 0), 0);
  };
  // breakdown_json の器 = { pay: PayResult, extras: Extra[] } ＋ finalize が足す ar/adv/okuri（上の deductTotal）。
  // full slip は pay の実フィールドのみ落とす（欠損は行を出さない＝捏造しない）。cast は自分の payslips 行のみ（RLS パターン1）。
  type SlipPay = {
    wage?: number; wHours?: number; timePay?: number;
    honBack?: number; jonaiBack?: number; dohanBack?: number;
    drinkBack?: number; champBack?: number; bottleBack?: number; salesBack?: number; customTotal?: number;
    gross?: number; fixedDed?: number; fine?: number; withholding?: number; normPenalty?: number;
  };
  type SlipExtra = { kind: string; amount: number; label?: string };
  const payOf = (bj: unknown): SlipPay => (bj as { pay?: SlipPay } | null)?.pay ?? {};
  const extrasOf = (bj: unknown): SlipExtra[] => (bj as { extras?: SlipExtra[] } | null)?.extras ?? [];

  // 自分指名の予約（F3a-3・read-only）。RLS が cast_id=auth_cast_id() の行のみ返す＝可視性の物理保証（段19-11）。
  // 表示は今営業日（06:00 起点）以降の booked のみ＝cast は予約に行動できないため過去/確定状態は出さない。
  // 客名は customers embed（cast は担当客のみ可視＝customers RLS）→不可視/フリー予約は guest_name フォールバック。
  const { data: rsv } = await supabase
    .from("reservations")
    .select("id, reserved_at, guest_name, party_size, nom_type, memo, customers(name)")
    .eq("status", "booked")
    .gte("reserved_at", `${bizToday}T06:00:00+09:00`)
    .order("reserved_at", { ascending: true });
  type RsvCustomer = { name: string } | { name: string }[] | null;
  // 名前が取れたら「◯◯ 様」・取れない（担当外客=RLS 不可視かつ guest_name なし）は敬称を重ねず「お客様」。
  const rsvName = (customers: RsvCustomer, guest: string | null): string => {
    const c = Array.isArray(customers) ? customers[0] : customers;
    const name = c?.name ?? guest;
    return name ? `${name} 様` : "お客様";
  };
  const rsvWhen = (iso: string): string =>
    new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };

  // F2f 報酬シミュレーター用データ（自分のプラン＋店マスタ＋open 前借り/送り残・RLS 読取・売掛は読まない）。
  const sim = await loadCastSimData(supabase);

  const title: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };
  const noneP: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
  const noteP: React.CSSProperties = { fontSize: 12, color: "var(--sub)", margin: 0 };

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>マイページ</h1>
        <p style={t.pheadP}>ノルマと今月の収支</p>
      </div>

      {/* ノルマ進捗（mig0042・表示のみ）: 採用軸かつ目標>0 の軸だけ・全非表示ならカード自体出ない */}
      <NormCard />

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>確定給与明細</h2>
        {(slips ?? []).length === 0 && <p style={noneP}>確定分なし</p>}
        {(slips ?? []).map((s, i) => {
          const pay = payOf(s.breakdown_json);
          const extras = extrasOf(s.breakdown_json);
          const ar = deductTotal(s.breakdown_json, "ar");
          const adv = deductTotal(s.breakdown_json, "adv");
          const okuri = deductTotal(s.breakdown_json, "okuri");
          const nominBack = (pay.honBack ?? 0) + (pay.jonaiBack ?? 0) + (pay.dohanBack ?? 0);
          const prodBack = (pay.drinkBack ?? 0) + (pay.champBack ?? 0) + (pay.bottleBack ?? 0) + (pay.salesBack ?? 0) + (pay.customTotal ?? 0);
          const hasDed = (pay.fixedDed ?? 0) > 0 || (pay.fine ?? 0) > 0 || (pay.withholding ?? 0) > 0 || (pay.normPenalty ?? 0) > 0 || ar > 0 || adv > 0 || okuri > 0;
          // 支給行（＞0 のみ）／控除行（＞0 のみ・bad 減算）。gross = 上の支給の和・net = gross − 控除 ＋ extras（＝s.net）。
          const earn = (label: string, v: number) => (
            <div style={t.slipRow}><span>{label}</span><span style={t.num}>{yen(v)}</span></div>
          );
          const ded = (label: string, v: number) =>
            v > 0 ? <div style={t.slipRow}><span>{label}</span><span style={{ ...t.num, color: "var(--bad)" }}>−{yen(v)}</span></div> : null;
          return (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={t.slipHd}>{s.period}</div>

              <div style={t.slipSec}>支給</div>
              {(pay.timePay ?? 0) > 0 && earn(`時給 ${yen(pay.wage ?? 0)}/h × ${pay.wHours ?? 0}h`, pay.timePay ?? 0)}
              {nominBack > 0 && earn("指名バック（本/場内/同伴）", nominBack)}
              {prodBack > 0 && earn("商品・売上・自由バック", prodBack)}
              {(pay.gross ?? 0) > 0 && (
                <div style={t.slipRowB}><span>総支給（gross）</span><span style={t.num}>{yen(pay.gross ?? 0)}</span></div>
              )}

              {hasDed && <div style={t.slipSec}>控除</div>}
              {ded("固定控除", pay.fixedDed ?? 0)}
              {ded("罰金", pay.fine ?? 0)}
              {ded("源泉", pay.withholding ?? 0)}
              {ded("ノルマ未達", pay.normPenalty ?? 0)}
              {ded("売掛", ar)}
              {ded("前借り", adv)}
              {ded("送り", okuri)}

              {extras.length > 0 && <div style={t.slipSec}>加算</div>}
              {extras.map((e, j) => (
                <div key={j} style={t.slipRow}>
                  <span>{e.label ?? (e.kind === "attendance_bonus" ? "出勤ボーナス" : e.kind)}</span>
                  <span style={t.num}>{yen(e.amount)}</span>
                </div>
              ))}

              <div style={t.slipFoot}><span>手取り</span><b style={t.slipFootVal}>{yen(s.net as number)}</b></div>
            </div>
          );
        })}
        <p style={{ ...noteP, marginTop: 6 }}>※確定後の明細です。売掛・前借り・送りの未収残は店にご確認ください。</p>
      </section>

      <SimulatorPanel
        mode="cast"
        plans={sim.plans}
        masters={sim.masters}
        openAdv={sim.openAdv}
        openOkuri={sim.openOkuri}
        override={sim.override}
        defaultTaxMode="委託"
        variant="dark"
      />

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>今月のバック（{month}）</h2>
        <div style={{ ...t.num, fontSize: 28, fontWeight: 700, color: "var(--champ)" }}>{yen(total)}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--sub)", marginTop: 8, flexWrap: "wrap" }}>
          <span>ドリンク <span style={{ ...t.num, color: "var(--ink)" }}>{yen(sum.drink)}</span></span>
          <span>シャンパン <span style={{ ...t.num, color: "var(--ink)" }}>{yen(sum.champ)}</span></span>
          <span>ボトル <span style={{ ...t.num, color: "var(--ink)" }}>{yen(sum.bottle)}</span></span>
          <span>本指名商品 <span style={{ ...t.num, color: "var(--ink)" }}>{sum.pt}</span>pt</span>
        </div>
      </section>

      {/* F3f 自己申告ドリンク（独立枠＝上の「今月のバック」には出ない・承認後に給与明細へ合算） */}
      <DrinkClaimForm month={month} />

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>今月の出勤ボーナス（{month}）</h2>
        {(incentives ?? []).length === 0 && <p style={noneP}>発行なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
          {(incentives ?? []).map((r, i) => (
            <li key={i} style={{ padding: "3px 0" }}>
              {r.biz_date}{" "}
              {r.amount_mode === "per_head"
                ? <>定額 <span style={t.num}>{yen(r.amount as number)}</span></>
                : <>プール <span style={t.num}>{yen(r.amount as number)}</span>（受給者数により変動・暫定）</>}
            </li>
          ))}
        </ul>
        <p style={{ ...noteP, marginTop: 6 }}>
          ※受給は当日の確定シフト出勤が条件・確定額は給与確定時に算出。
        </p>
      </section>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>打刻</h2>
        <p style={{ fontSize: 13, color: "var(--sub)", marginTop: 0 }}>
          最終打刻:{" "}
          {last
            ? `${last.type === "in" ? "出勤" : "退勤"}（${new Date(last.punched_at as string).toLocaleString("ja-JP")}）`
            : "なし"}
        </p>
        <PunchActions />
      </section>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>遅刻・当欠の連絡</h2>
        <AttendanceForm defaultDate={bizToday} />
      </section>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>直近のシフト</h2>
        {(shifts ?? []).length === 0 && <p style={noneP}>予定なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
          {(shifts ?? []).map((s, i) => (
            <li key={i} style={{ padding: "3px 0" }}>
              {s.date} {fmtWin(s.start_hm as string, s.end_hm as string)}{" "}
              <span style={{ color: "var(--sub)" }}>（{s.status === "confirmed" ? "確定" : "予定"}）</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>指名予約（今日以降）</h2>
        {(rsv ?? []).length === 0 && <p style={noneP}>予約なし</p>}
        {(rsv ?? []).map((r) => (
          <div key={r.id as string} style={{ padding: "7px 0", borderBottom: "1px solid var(--line2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ ...t.num, fontWeight: 700 }}>{rsvWhen(r.reserved_at as string)}</span>
              <span style={{ fontWeight: 700 }}>{rsvName(r.customers as RsvCustomer, r.guest_name as string | null)}</span>
              {r.party_size != null && <span style={{ color: "var(--sub)" }}>{r.party_size}名</span>}
              <span style={{
                fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
                color: "#C9A24A", background: "#23232B", border: "1px solid var(--line2)",
                whiteSpace: "nowrap", marginLeft: "auto",
              }}>予約</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 2 }}>
              {NOM_LABEL[r.nom_type as string] ?? "指名種別は来店時に決定"}
              {r.memo ? `・${r.memo}` : ""}
            </div>
          </div>
        ))}
        <p style={{ ...noteP, marginTop: 6 }}>※予約の変更・取消は店舗にご連絡ください。</p>
      </section>

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>今月の勤怠</h2>
        {(att ?? []).length === 0 && <p style={noneP}>記録なし</p>}
        <ul style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
          {(att ?? []).map((a, i) => (
            <li key={i} style={{ padding: "3px 0" }}>
              {a.date} {ATT_LABEL[a.status as string] ?? a.status}
              {a.eta ? `（出勤見込み ${a.eta}）` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
