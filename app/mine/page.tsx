import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { bizDateOf } from "@/lib/nox/biz-date";
import { fmtWin } from "@/lib/nox/shift-time";
import { loadCastSimData } from "@/lib/nox/payroll/sim-data";
import SimulatorPanel from "@/components/simulator-panel";
import PayslipSlip from "@/components/payslip-slip";
import * as t from "@/lib/nox/ui/theme";
import PunchActions from "./punch-actions";
import PhotoCard from "./photo-card";
import AttendanceForm from "./attendance-form";
import NormCard from "./norm-card";
import DrinkClaimForm from "./drink-claim-form";
import PrintPayslipButton from "./print-payslip-button";

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
  // breakdown_json の解釈と1件描画は共有 PayslipSlip へ移設（D2＝表示の移設のみ・数値ロジック非改変）。

  // 段M2: 所属店（ヘッダ表示用）。cast の可視 store は自店のみ（RLS）＝先頭行が自店（/mine/ranking と同型）。
  const { data: myStores } = await supabase.from("stores").select("id, name").limit(1);
  const myStore = myStores?.[0];

  // 段M2: 指名ランキングの★自分の行だけ（get_cast_ranking＝金額列を構造的に持たない既存 RPC・
  //   /mine/ranking が既に使っている経路と同一）。他キャストの数字は一切描画しない（順位と母数のみ）。
  const { data: rankAll } = myStore
    ? await supabase.rpc("get_cast_ranking", { p_store_id: myStore.id as string, p_period: month })
    : { data: null };
  type MyRank = { rank: number; hon_count: number; jonai_count: number; dohan_count: number; is_self: boolean };
  const rankRows = (rankAll ?? []) as MyRank[];
  const myRank = rankRows.find((r) => r.is_self) ?? null;

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

  const noneP: React.CSSProperties = { fontSize: 13, color: "var(--sub)" };
  const noteP: React.CSSProperties = { fontSize: 12, color: "var(--sub)", margin: 0 };

  return (
    /* 段0R 第3陣: モック正本どおりモバイルファースト1カラム（max-width 430・nox-minewrap）。
       印刷時は既存の .nox-main > * { max-width none } が幅を戻すため payslip の A4 印刷に影響しない。
       ページ見出しはモックどおり撤去＝.me ヘッダ（写真＋名前＋店）が先頭。 */
    <div className="nox-printpage nox-minewrap">
      {/* 段P: プロフィール写真（本人スコープのみ・client 自己完結＝他カードの取得に影響しない）
          段M2: モックの .me ヘッダ（写真＋名前＋店）へ。店名は上で引いた自店を渡すだけ。 */}
      <PhotoCard storeName={myStore?.name as string | undefined} />

      {/* 段M2: 打刻はスマホで一番使うのでヘッダ直後へ（section の中身・PunchActions・最終打刻の
          文言はそのまま＝移設のみ）。 */}
      <section className="nox-panel">
        <h3>打刻</h3>
        <PunchActions />
        <p className="nox-pstate">
          最終打刻:{" "}
          {last
            ? `${last.type === "in" ? "出勤" : "退勤"}（${new Date(last.punched_at as string).toLocaleString("ja-JP")}）`
            : "なし"}
        </p>
      </section>

      {/* ノルマ進捗（mig0042・表示のみ）: 採用軸かつ目標>0 の軸だけ・全非表示ならカード自体出ない
          ★店が採用している軸のときだけ出る現行条件はそのまま（部品側の判定に一切触れていない）。 */}
      <NormCard />

      {/* 印刷隔離の対象マーカーは維持（器だけ差し替え・明細スリップ部品は非改変） */}
      <section className="nox-panel nox-print">
        <h3>
          確定給与明細
          <span style={{ marginLeft: "auto" }}>{(slips ?? []).length > 0 && <PrintPayslipButton />}</span>
        </h3>
        {(slips ?? []).length === 0 && <p style={{ ...noneP, marginTop: 11 }}>確定分なし</p>}
        <div style={{ marginTop: 11 }}>
          {(slips ?? []).map((s, i) => (
            <PayslipSlip
              key={i}
              slip={{ period: s.period as string, net: s.net as number, breakdown_json: s.breakdown_json }}
            />
          ))}
        </div>
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
      />

      <section className="nox-panel">
        <h3>今月のバック（{month}）</h3>
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

      <section className="nox-panel">
        <h3>今月の出勤ボーナス（{month}）</h3>
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


      <section className="nox-panel">
        <h3>遅刻・当欠の連絡</h3>
        <AttendanceForm defaultDate={bizToday} />
      </section>

      <section className="nox-panel">
        <h3>
          直近のシフト
          {/* 段M2: 希望提出への導線（既存 /mine/wishes へのリンクのみ＝新しい提出 UI は作らない） */}
          <Link href="/mine/wishes" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto", textDecoration: "none" }}>
            ＋ 希望を提出
          </Link>
        </h3>
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

      {/* 段M2: 指名ランキング＝★自分の順位のみ。順位・母数・自分の件数だけを出し、
          他キャストの名前も数字も描画しない（1位との差のような他人由来の値も出さない）。
          値は /mine/ranking が既に使っている get_cast_ranking の自分の行そのもの＝情報は増えない。 */}
      {myRank && (
        <section className="nox-panel">
          <h3>指名ランキング（{month}）</h3>
          <div className="nox-myrank">
            <span className={`nox-medal ${myRank.rank === 1 ? "g1" : myRank.rank === 2 ? "g2" : myRank.rank === 3 ? "g3" : "gx"}`}>
              {myRank.rank}
            </span>
            <div>
              <div className="t num">{myRank.rank}位 / {rankRows.length}人中</div>
              <div className="n num">
                本指名 {myRank.hon_count}件・場内 {myRank.jonai_count}件・同伴 {myRank.dohan_count}件
              </div>
            </div>
            <Link href="/mine/ranking" style={{ ...t.btnGhost, ...t.btnSm, marginLeft: "auto", textDecoration: "none" }}>
              一覧 ›
            </Link>
          </div>
        </section>
      )}

      <section className="nox-panel">
        <h3>指名予約（今日以降）</h3>
        {(rsv ?? []).length === 0 && <p style={noneP}>予約なし</p>}
        {(rsv ?? []).map((r) => (
          <div key={r.id as string} style={{ padding: "7px 0", borderBottom: "1px solid var(--line2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span style={{ ...t.num, fontWeight: 700 }}>{rsvWhen(r.reserved_at as string)}</span>
              <span style={{ fontWeight: 700 }}>{rsvName(r.customers as RsvCustomer, r.guest_name as string | null)}</span>
              {r.party_size != null && <span style={{ color: "var(--sub)" }}>{r.party_size}名</span>}
              <span style={{
                fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 9px",
                color: "var(--gold)", background: "var(--card2)", border: "1px solid var(--line2)",
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

      <section className="nox-panel">
        <h3>今月の勤怠</h3>
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
