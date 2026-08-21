"use client";

// 席・卓マスター（DP1 P1 で master-board.tsx の view === "seat" から移設）。
//
// ★送る RPC と引数は不変: set_seat(p_id, p_store_id, p_name, p_kind, p_sort_order, p_is_active) ＝6引数。
//   p_is_active は明示 boolean（規約 原則7＝coalesce(p_x, true) の null→true リセットを避ける）。
// ★JSX・state 名・フィルタ条件・KPI の式はすべて移設前の逐語（構造変換であって挙動変更ではない）。
//   変わったのは「ハブの view state ではなく URL で開く」ことと、
//   取得が seats だけになったこと（旧 load() は products/categories/stock も同時に取っていた）。
// ★E8-5 席#5 の並べ替え（↑↓）は引き続き未実装＝set_seat 2連続呼びが非原子になるため
//   （skipped.md の記録どおり・表示順の数値入力で同じ結果が得られる）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import MasterPageHead from "../master-page-head";

export type Seat = { id: string; name: string; kind: string | null; sort_order: number; is_active: boolean };

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;

export default function SeatsBoard({ storeId, isManagerUp, initial }: {
  storeId: string; isManagerUp: boolean; initial: Seat[];
}) {
  const supabase = createClient();
  const [seats, setSeats] = useState<Seat[]>(initial);
  const [msg, setMsg] = useState<string | null>(null);

  // 席フォーム（移設前と同じ7本。sId 1つで新規/編集を兼用）
  const [sId, setSId] = useState<string | null>(null);
  const [sName, setSName] = useState("");
  const [sKind, setSKind] = useState("卓");
  const [sSort, setSSort] = useState(0);
  const [sActive, setSActive] = useState(true);
  // E8-5 席#5（T2）: 席一覧の検索・種別フィルタ（client のみ・取得と編集経路は不変）
  const [seatQ, setSeatQ] = useState("");
  const [seatKind, setSeatKind] = useState("");

  async function reload() {
    const { data } = await supabase
      .from("seats").select("id, name, kind, sort_order, is_active").order("sort_order");
    setSeats((data ?? []) as Seat[]);
  }

  async function saveSeat() {
    setMsg(null);
    const { error } = await supabase.rpc("set_seat", {
      p_id: sId, p_store_id: storeId, p_name: sName, p_kind: sKind, p_sort_order: sSort,
      p_is_active: sActive, // 明示 boolean（原則7）
    });
    setMsg(error ? error.message : sId ? "席を更新しました" : "席を登録しました");
    setSId(null); setSName("");
    await reload();
  }

  return (
    <div>
      <MasterPageHead
        title="席・卓"
        count={seats.length}
        unit="卓"
        desc="卓／カウンター／VIP の登録と並び順、稼働の有効切替。"
      />
      <Toast msg={msg} />

      <section className="nox-cardtop" style={card}>
        <h2 id="m-seat" style={secTitle}>席（クリックで編集）</h2>
        {/* E8-5 席#2（T1）: 席 KPI 4枚＝seats state の再形のみ */}
        <div className="nox-repsum">
          <div className="nox-rs"><div className="l">総席数</div><div className="v num">{seats.length}</div></div>
          <div className="nox-rs"><div className="l">稼働可能</div><div className="v num">{seats.filter((s) => s.is_active).length}</div></div>
          <div className="nox-rs"><div className="l">無効</div><div className="v num">{seats.filter((s) => !s.is_active).length}</div></div>
          <div className="nox-rs"><div className="l">VIP</div><div className="v num">{seats.filter((s) => s.kind === "VIP").length}</div></div>
        </div>
        {/* E8-5 席#5（T2）: 検索＋種別フィルタ（表示のみ） */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <input value={seatQ} onChange={(e) => setSeatQ(e.target.value)} placeholder="席名で検索"
            aria-label="席名で検索" style={{ ...input, width: 160 }} />
          <div className="nox-seg">
            {([["", "すべて"], ["卓", "卓"], ["カウンター", "カウンター"], ["VIP", "VIP"]] as const).map(([v, label]) => (
              <button key={v || "all"} className={seatKind === v ? "on" : ""} onClick={() => setSeatKind(v)}>{label}</button>
            ))}
          </div>
        </div>
        <table className="nox-table" style={{ marginBottom: 10 }}>
          <tbody>
            {seats.filter((s) =>
              (!seatQ.trim() || s.name.toLowerCase().includes(seatQ.trim().toLowerCase())) &&
              (seatKind === "" || s.kind === seatKind),
            ).map((s) => (
              <tr key={s.id} onClick={() => isManagerUp && (setSId(s.id), setSName(s.name), setSKind(s.kind ?? "卓"), setSSort(s.sort_order), setSActive(s.is_active))}
                style={{ cursor: isManagerUp ? "pointer" : "default" }}>
                <td>{s.name}</td>
                <td>{s.kind}</td>
                <td style={{ color: s.is_active ? "var(--ok)" : "var(--sub)" }}>{s.is_active ? "有効" : "無効"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isManagerUp && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>{sId ? "編集中" : "新規"}</span>
            <input placeholder="席名" value={sName} onChange={(e) => setSName(e.target.value)} style={{ ...input, width: 140 }} />
            <select value={sKind} onChange={(e) => setSKind(e.target.value)} style={input}>
              <option value="卓">卓</option><option value="カウンター">カウンター</option><option value="VIP">VIP</option>
            </select>
            <label style={{ fontSize: 12 }}>表示順 <input type="number" min={0} value={sSort} onChange={(e) => setSSort(Number(e.target.value))} style={{ ...input, width: 56 }} /></label>
            {/* 段G: 既存 boolean(is_active) のトグルを canonical スイッチ表示へ（状態・挙動は不変） */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12 }}>
              <button type="button" className={`nox-switch ${sActive ? "on" : ""}`} onClick={() => setSActive(!sActive)} aria-pressed={sActive} aria-label="有効"><i /></button>
              有効
            </span>
            <button style={btnDark} onClick={saveSeat}>{sId ? "更新" : "登録"}</button>
          </div>
        )}
      </section>
    </div>
  );
}
