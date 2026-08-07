"use client";

// 待遇プラン・報酬シミュレーター（D2-1・モック plan.html 準拠の実ページ化）。
// 旧 CompMaster の「プラン／割当／自由バック」タブ＋SimulatorPanel(mode="store") を1ページに集約。
// ★各セクションの中身は comp-sections.tsx 経由の逐語移設＝RPC・引数・権限出し分けは不変。
//   シミュレーターのプラン値は sim-data.ts（server 取得）＝DB 経由の読みで、編集後は再読込で追随。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import SimulatorPanel from "@/components/simulator-panel";
import type { StoreSimData } from "@/lib/nox/payroll/sim-data";
import { PlanTab, AssignTab, BackTab, useCompData, secTitle } from "../comp-sections";

const card: React.CSSProperties = t.card;

export default function PlanBoard({ storeId, isManagerUp, isOwner, sim }: {
  storeId: string; isManagerUp: boolean; isOwner: boolean; sim: StoreSimData | null;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const data = useCompData(storeId);

  return (
    <div>
      <Toast msg={msg} />

      {sim && (
        <SimulatorPanel mode="store" plans={sim.plans} masters={sim.masters} openAdv={0} openOkuri={0} defaultTaxMode="委託" />
      )}

      <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
        <h2 style={secTitle}>待遇プラン</h2>
        <PlanTab plans={data.plans} isOwner={isOwner} storeId={storeId} setMsg={setMsg} reload={data.reload} />
      </section>

      <section className="nox-cardtop" style={{ ...card, marginBottom: 14 }}>
        <h2 style={secTitle}>キャスト割当（プラン・上書き）</h2>
        <AssignTab plans={data.plans} casts={data.casts} castPlans={data.castPlans}
          isManagerUp={isManagerUp} setMsg={setMsg} reload={data.reload} />
      </section>

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>自由バック</h2>
        <BackTab backs={data.backs} isManagerUp={isManagerUp} storeId={storeId} setMsg={setMsg} reload={data.reload} />
      </section>
    </div>
  );
}
