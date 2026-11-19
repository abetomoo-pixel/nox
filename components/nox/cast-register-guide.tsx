"use client";
// ★2026-11-19 昼（相談役 ②）: キャストがレジを使えないときの案内（卓の一覧の代わり）。卓の数と空席の並びは出さない。
//   店の端末（本人セッション）＝「打刻の画面へ戻る」で本人の終了 → 端末のホーム（/kiosk＝打刻の画面）。自分のスマホ＝/mine（打刻のボタンがある本人のホーム）。
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { endKioskPersonSession } from "@/lib/nox/kiosk/person-session-client";
import type { CastRegisterGuide } from "@/lib/nox/register/cast-register-guide";
import { Message } from "@/components/ui/toast";

const btn: React.CSSProperties = { display: "inline-block", fontFamily: "inherit", fontSize: 15, fontWeight: 700, padding: "12px 22px", borderRadius: 10, border: "1px solid var(--gold, #c9a24a)", background: "transparent", color: "inherit", cursor: "pointer", textDecoration: "none" };

export default function CastRegisterGuidePanel({ guide, kiosk }: { guide: CastRegisterGuide; kiosk: boolean }) {
  return (
    <div data-cast-register-guide={guide.kind} data-cast-register-guide-kiosk={kiosk ? "1" : "0"} style={{ maxWidth: 420, margin: "48px auto", padding: "28px 20px", textAlign: "center", border: "1px solid var(--line2, #444)", borderRadius: 14 }}>
      <Message kind="warn" style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, textAlign: "left" }}>{guide.text}</Message>{/* 文言は決まりどおり Message で（素の p に載せない＝verify:nox-messages） */}
      {kiosk
        ? <button type="button" data-cast-register-guide-back="kiosk" onClick={() => { void endKioskPersonSession(createClient(), "manual"); }} style={btn}>{guide.back}</button>
        : <Link href="/mine" data-cast-register-guide-back="mine" style={btn}>{guide.back}</Link>}
    </div>
  );
}
