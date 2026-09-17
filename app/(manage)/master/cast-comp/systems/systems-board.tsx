"use client";

// マスタ「報酬制度」の client 側（裁定269）。保存は store-flag-toggle.tsx の switchTo を写経＝
//   set_store_profile に {sys_x: boolean} の 1 キー patch だけを渡す（他キーは触らない・新しい判定式なし）。
//   269-3（使用中は OFF 不可）の判定は部品（StoreSystemsPanel）の usage 表示と disabled に集約。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import StoreSystemsPanel from "@/components/nox/store-systems-panel";
import { storeProfileErrJa } from "../../store-flag-toggle";
import { SYSTEM_LABELS, type SystemKey } from "@/lib/nox/store-systems";

const card: React.CSSProperties = t.card;
const secTitle: React.CSSProperties = t.cardTitle;

export default function SystemsBoard({ storeId, storeName, isOwner, initialSettings, usage }: {
  storeId: string; storeName: string; isOwner: boolean;
  initialSettings: Record<string, unknown>;
  usage: Record<SystemKey, number>;
}) {
  const supabase = createClient();
  const [settings, setSettings] = useState<Record<string, unknown>>(initialSettings);
  const [busyKey, setBusyKey] = useState<SystemKey | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onChange(key: SystemKey, next: boolean) {
    if (busyKey || !storeId) return;
    setBusyKey(key); setMsg(null);
    const { error } = await supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: { [key]: next } });
    setBusyKey(null);
    if (error) { setMsg(`保存に失敗: ${storeProfileErrJa(error.message)}`); return; }
    setSettings((s) => ({ ...s, [key]: next }));
    setMsg(`${SYSTEM_LABELS[key]}を「${next ? "ON" : "OFF"}」にしました`);
  }

  return (
    <div>
      <Toast msg={msg} />
      <div className="nox-pthead">
        <div className="nox-pthead-main">
          <div className="title"><h2>報酬制度</h2></div>
          <p className="desc">
            この店で使う制度を選びます。OFF にした制度は待遇プラン・控除・商品・マイページの該当する節が表示されなくなります
            （計算は変わりません＝キャスト個別の設定はそのまま残ります）。
          </p>
        </div>
      </div>
      <section className="nox-cardtop" style={card}>
        <h2 style={{ ...secTitle, margin: "0 0 4px" }}>使う制度{storeName ? `（${storeName}）` : ""}</h2>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>
          未設定の制度は ON として扱います。キャスト個別の設定（上書き・ノルマ目標）がある制度は OFF にできません。
        </p>
        <StoreSystemsPanel settings={settings} onChange={onChange} usage={usage} readOnly={!isOwner} busyKey={busyKey} />
      </section>
    </div>
  );
}
