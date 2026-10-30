"use client";

// ★0190 フラグ true 便（裁定435・2026-10-30）: キオスクの 5 タイルのうち「シフト／在庫／日報」の行き先＝案内画面（この便では本体を開かない）。
//   本体（本店のシフト表・在庫・日報を同じ部品で描く＝K-0 と同型の包み）は K client 第 2 便＝RLS の kiosk 腕は 0190 で shifts／daily_reports 等 29 表に入っているが、
//   在庫（stock_*）と日報の書込 RPC の kiosk 腕が無い（別 mig）ため、この便では「端末アカウントの確認 → 行き先の案内 → 出退勤へ戻る」だけを置く。
//   ルートガード＝端末アカウントでなければ /kiosk（打刻端末）へ返す（kiosk_cast_list／kiosk_operator_list が 0 行＝端末ではない→ /login）。
import { useEffect, useState } from "react";
import Link from "next/link"; // ★Vercel の build＝@next/next/no-html-link-for-pages（<a href="/"> は Link に）
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { KIOSK_FEATURE_LABEL, type KioskFeature } from "@/lib/nox/rules-0175/kiosk";

const NOTE: Record<Exclude<KioskFeature, "punch" | "register">, string> = {
  shift: "今日の配置と希望の確認は、スタッフが本店の「シフト」で見られます。この端末からの表示は次の更新で開きます。",
  inventory: "開栓・補充・棚卸は、スタッフが本店の「在庫」で記録できます。この端末からの記録は次の更新で開きます。",
  report: "日次の締めは、本店の「日報」で行います。この端末からの表示は次の更新で開きます。",
};

export default function KioskFeaturePage({ feature }: { feature: Exclude<KioskFeature, "punch" | "register"> }) {
  const [state, setState] = useState<"loading" | "kiosk" | "not_kiosk" | "login">("loading");
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setState("login"); return; }
      const [{ data: c }, { data: o }] = await Promise.all([supabase.rpc("kiosk_cast_list"), supabase.rpc("kiosk_operator_list")]);
      setState((Array.isArray(c) && c.length > 0) || (Array.isArray(o) && o.length > 0) ? "kiosk" : "not_kiosk");
    })();
  }, []);
  return (
    <main className="nox-dark nox-kiosk" style={{ ...t.loginBg, minHeight: "100dvh", padding: 20 }} data-kiosk-feature={feature}>
      <div style={{ maxWidth: 720, margin: "0 auto", paddingTop: 20 }}>
        <div className="nox-khead">
          <div>
            <div className="store">NOX — 端末</div>
            <div className="mode">キオスクモード / {KIOSK_FEATURE_LABEL[feature]}</div>
          </div>
        </div>
        <div className="nox-cardtop" style={{ ...t.card, textAlign: "center", marginTop: 16 }}>
          {state === "loading" && <p style={{ color: "var(--sub)", margin: 0 }}>確認中…</p>}
          {state === "login" && <p style={{ margin: 0 }}>端末アカウントでログインしてください。<Link href="/kiosk" style={{ color: "var(--gold)" }}>出退勤の画面へ</Link></p>}
          {state === "not_kiosk" && <p style={{ margin: 0 }}>この画面は店舗の共用端末（端末アカウント）用です。<Link href="/" style={{ color: "var(--gold)" }}>ホームへ</Link></p>}
          {state === "kiosk" && (
            <>
              <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px" }}>{KIOSK_FEATURE_LABEL[feature]}</p>
              <p style={{ ...t.sub, margin: "0 0 14px", lineHeight: 1.7 }} data-kiosk-feature-note="1">{NOTE[feature]}</p>
              <Link href="/kiosk" style={{ ...t.btnGold, display: "inline-block", textDecoration: "none", padding: "12px 24px" }}>出退勤へ戻る</Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
