"use client";
// ★0201t（2026-11-19 夜・相談役 ③）: 店長の PIN の画面に「PIN を設定し直してください」を件数だけ出す（旗 MIG_0201T_APPLIED の後ろ＝手貼り前は何も読まない・何も出さない）。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mig0201tOn } from "@/lib/nox/rules-0175/flag";
import { PIN_OVERLAP_RPC, pinOverlapCountsOf, pinOverlapLinesOf } from "@/lib/nox/staff/pin-overlap";

export default function PinOverlapNotice({ stores }: { stores: { id: string; name: string }[] }) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    if (!mig0201tOn()) return;
    const supabase = createClient();
    let alive = true;
    void (async () => {
      const out: string[] = [];
      for (const s of stores) {
        const { data, error } = await supabase.rpc(PIN_OVERLAP_RPC, { p_store_id: s.id });
        if (error) continue; // manager の他店など＝出さない
        const c = pinOverlapCountsOf(data);
        if (c) out.push(...pinOverlapLinesOf(c, stores.length > 1 ? s.name : undefined));
      }
      if (alive) setLines(out);
    })();
    return () => { alive = false; };
  }, [stores]);
  if (!mig0201tOn() || lines.length === 0) return null;
  return (
    <div data-pin-overlap-notice="1" role="status" style={{ margin: "0 0 10px", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--warn, #c98a2b)", fontSize: 12, lineHeight: 1.6, overflowWrap: "anywhere" }}>
      {lines.map((line) => <div key={line}>{line}</div>)}
    </div>
  );
}
