import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionRole } from "@/lib/nox/auth";
import * as t from "@/lib/nox/ui/theme";

export const dynamic = "force-dynamic";

// キャスト・報酬ハブ（D2-1・モック index.html 準拠）。
//   モックは3カード（plan/deduction/norma）だが、マスタ概要の「キャスト会計の許可」カードと
//   1:1 を保つため register を4枚目として置く（裁定＝カード4枚を各実ページへ 1:1 結線）。
//   状況サマリは server で軽く数えるだけ（有効プラン数・有効控除数・ノルマ採用フラグ）。
export default async function CastCompHubPage() {
  const { role } = await getSessionRole();
  const isManagerUp = role === "owner" || role === "manager";
  if (!isManagerUp) redirect("/dashboard");
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, settings_json").order("name").limit(1);
  const store = stores?.[0];
  const storeId = (store?.id as string | undefined) ?? "";
  if (!storeId) redirect("/master");
  const sj = store?.settings_json as Record<string, unknown> | null;

  const [{ count: planCount }, { count: dedCount }, { count: rankCount }] = await Promise.all([
    supabase.from("comp_plans").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("is_active", true),
    supabase.from("deductions").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("is_active", true),
    supabase.from("cast_ranks").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("is_active", true),
  ]);
  const salesNorm = sj?.sales_norm_enabled === true;
  const shimeiNorm = sj?.shimei_norm_enabled === true;
  const castReg = sj?.cast_register_enabled === true;

  const cards = [
    { href: "/master/cast-comp/plan", icon: "▲", title: "待遇プラン・報酬シミュレーター",
      desc: "保証時給、スライド、指名バック単価を試算。プラン割当・上書き・自由バックもここで管理。",
      status: `● 有効プラン ${planCount ?? 0}件` },
    { href: "/master/cast-comp/deduction", icon: "▽", title: "控除・送りの設定",
      desc: "固定控除の種別と金額、送り実費/一律、前借り・送り実費の発行を管理。",
      status: `● 有効控除 ${dedCount ?? 0}件` },
    { href: "/master/cast-comp/norma", icon: "◎", title: "ノルマ設定",
      desc: "採用する軸（売上・指名）、キャスト別目標、未達成時のペナルティを設定。",
      status: salesNorm || shimeiNorm ? "● 採用中" : "● 未採用" },
    { href: "/master/cast-comp/register", icon: "◈", title: "キャスト会計の許可",
      desc: "キャスト本人がレジを使えるようにする設定（店フラグ＋対象キャストの個別許可）。",
      status: castReg ? "● 店として許可中" : "● 店として停止中" },
  ];

  return (
    <div>
      <div className="nox-pthead">
        <div className="nox-pthead-main">
          <div className="title"><h2>キャスト・報酬</h2></div>
          <p className="desc">給与計算とキャスト運用の設定。報酬設計・控除ルール・ノルマ基準をまとめて管理します。</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
        {cards.map((c) => (
          <Link key={c.href} href={c.href} style={{ ...t.card, display: "block", padding: 18, textDecoration: "none" }}>
            <div style={{ fontSize: 22, color: "var(--gold2)" }}>{c.icon}</div>
            <h3 style={{ margin: "10px 0 6px", fontSize: 15, color: "var(--ink)" }}>{c.title}</h3>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--sub)", lineHeight: 1.7 }}>{c.desc}</p>
            <span style={{ fontSize: 12, color: "var(--ok)" }}>{c.status}</span>
            <span style={{ float: "right", fontSize: 12.5, fontWeight: 700, color: "var(--gold2)" }}>管理する →</span>
          </Link>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "14px 0 0", lineHeight: 1.7 }}>
        設定内容は給与計算やキャストのマイページ進捗に自動反映されます。
        指名料のランク（{rankCount ?? 0}件）は<Link href="/master/pricing" style={{ color: "var(--gold2)" }}>料金設定</Link>、
        ランクの割当は<Link href="/casts" style={{ color: "var(--gold2)" }}>キャスト管理</Link>で行います。
      </p>
    </div>
  );
}
