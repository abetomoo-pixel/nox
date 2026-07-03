"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { groupDue } from "@/lib/nox/check-calc";

type Seat = { id: string; name: string; kind: string | null };
type Product = { id: string; name: string; type: string; price: number };
type Cast = { id: string; name: string };

type CheckRow = {
  id: string;
  seat_id: string;
  status: string;
  people: number | null;
  nom_type: string;
  total: number;
  service_rate: number;
  round_unit: number;
  round_mode: string;
};
type Line = {
  id: string;
  kind: string;
  pay_group: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  line_total: number;
};
type Payment = { id: string; pay_group: string; method: string; amount: number; tendered: number | null };
type Nom = { cast_id: string; ratio_weight: number };

const yen = (n: number) => "¥" + n.toLocaleString();
const METHOD_LABEL: Record<string, string> = { cash: "現金", card: "カード", ar: "売掛", other: "その他" };
const NOM_LABEL: Record<string, string> = { hon: "本指名", jonai: "場内", dohan: "同伴", free: "フリー" };

const card: React.CSSProperties = {
  border: "1px solid #ebebeb", borderRadius: 8, padding: 14, background: "#fff", marginBottom: 14,
};
const input: React.CSSProperties = { padding: 6, border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 };
const btnDark: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 6, border: "none", background: "#16161a", color: "#fff", cursor: "pointer", fontSize: 13,
};
const btnLight: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 6, border: "1px solid #e0e0e0", background: "#fff", cursor: "pointer", fontSize: 13,
};

export default function RegisterBoard({
  seats, products, casts, isManagerUp,
}: {
  seats: Seat[]; products: Product[]; casts: Cast[]; isManagerUp: boolean;
}) {
  const supabase = createClient();
  const [openMap, setOpenMap] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<CheckRow | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [noms, setNoms] = useState<Nom[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // フォーム状態
  const [nomType, setNomType] = useState("hon");
  const [nomWeights, setNomWeights] = useState<Record<string, number>>({});
  const [prodId, setProdId] = useState("");
  const [prodQty, setProdQty] = useState(1);
  const [prodGroup, setProdGroup] = useState("A");
  const [cName, setCName] = useState("");
  const [cPrice, setCPrice] = useState(0);
  const [cKind, setCKind] = useState("set");
  const [cGroup, setCGroup] = useState("A");
  const [payGroup, setPayGroup] = useState("A");
  const [payMethod, setPayMethod] = useState("cash");
  const [payAmount, setPayAmount] = useState(0);
  const [payTendered, setPayTendered] = useState("");

  const loadOpenMap = useCallback(async () => {
    const { data } = await supabase.from("checks").select("id, seat_id").eq("status", "open");
    const m: Record<string, string> = {};
    for (const r of data ?? []) m[r.seat_id as string] = r.id as string;
    setOpenMap(m);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCheck = useCallback(async (checkId: string) => {
    const { data: c } = await supabase.from("checks").select("*").eq("id", checkId).single();
    const { data: ls } = await supabase
      .from("check_lines").select("id, kind, pay_group, name_snapshot, unit_price_snapshot, qty, line_total")
      .eq("check_id", checkId).order("sort_order");
    const { data: ps } = await supabase
      .from("payments").select("id, pay_group, method, amount, tendered").eq("check_id", checkId).order("paid_at");
    const { data: ns } = await supabase
      .from("check_nominations").select("cast_id, ratio_weight").eq("check_id", checkId).order("position");
    setCheck(c as CheckRow);
    setLines((ls ?? []) as Line[]);
    setPayments((ps ?? []) as Payment[]);
    setNoms((ns ?? []) as Nom[]);
    if (c) {
      setNomType((c as CheckRow).nom_type);
      const w: Record<string, number> = {};
      for (const n of (ns ?? []) as Nom[]) w[n.cast_id] = n.ratio_weight;
      setNomWeights(w);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadOpenMap(); }, [loadOpenMap]);

  async function openSeat(seat: Seat) {
    setMsg(null);
    const existing = openMap[seat.id];
    if (existing) { await loadCheck(existing); return; }
    const { data, error } = await supabase.rpc("check_open", { p_seat_id: seat.id, p_people: null, p_nom_type: "free" });
    if (error) { setMsg(error.message); return; }
    await loadOpenMap();
    await loadCheck(data as string);
  }

  async function saveNoms() {
    if (!check) return;
    setMsg(null);
    const list = Object.entries(nomWeights)
      .filter(([, w]) => w > 0)
      .map(([cast_id, weight]) => ({ cast_id, weight }));
    const { error } = await supabase.rpc("check_set_nominations", {
      p_check_id: check.id, p_nom_type: nomType, p_nominations: list,
    });
    setMsg(error ? error.message : "指名を保存しました");
    await loadCheck(check.id);
  }

  async function addProductLine() {
    if (!check || !prodId) return;
    setMsg(null);
    const { error } = await supabase.rpc("check_add_line", {
      p_check_id: check.id, p_product_id: prodId, p_qty: prodQty, p_kind: null,
      p_pay_group: prodGroup || "A", p_name: null, p_unit_price: null,
    });
    setMsg(error ? error.message : null);
    await loadCheck(check.id);
  }

  async function addCustomLine() {
    if (!check || !cName) return;
    setMsg(null);
    const { error } = await supabase.rpc("check_add_line", {
      p_check_id: check.id, p_product_id: null, p_qty: 1, p_kind: cKind,
      p_pay_group: cGroup || "A", p_name: cName, p_unit_price: cPrice,
    });
    setMsg(error ? error.message : null);
    setCName(""); setCPrice(0);
    await loadCheck(check.id);
  }

  async function removeLine(lineId: string) {
    if (!check) return;
    setMsg(null);
    const { error } = await supabase.rpc("check_remove_line", { p_line_id: lineId });
    setMsg(error ? error.message : null);
    await loadCheck(check.id);
  }

  async function pay() {
    if (!check) return;
    setMsg(null);
    const { error } = await supabase.rpc("check_pay", {
      p_check_id: check.id, p_method: payMethod, p_amount: payAmount,
      p_pay_group: payGroup || "A",
      p_tendered: payMethod === "cash" && payTendered ? Number(payTendered) : null,
      p_idem_key: crypto.randomUUID(),
    });
    setMsg(error ? error.message : "入金しました");
    setPayTendered("");
    await loadCheck(check.id);
  }

  async function closeCheck() {
    if (!check) return;
    setMsg(null);
    const { error } = await supabase.rpc("check_close", { p_check_id: check.id, p_idem_key: crypto.randomUUID() });
    if (error) { setMsg(error.message); return; }
    setMsg(`会計完了 ${yen(check.total)}`);
    setCheck(null);
    await loadOpenMap();
  }

  async function voidCheck() {
    if (!check) return;
    const reason = window.prompt("取消理由を入力してください");
    if (!reason) return;
    const { error } = await supabase.rpc("check_void", { p_check_id: check.id, p_reason: reason });
    if (error) { setMsg(error.message); return; }
    setMsg("伝票を取消しました");
    setCheck(null);
    await loadOpenMap();
  }

  // group 集計（表示用・権威はサーバ＝check_pay/close が最終判定）
  const groups = Array.from(new Set(lines.map((l) => l.pay_group))).sort();
  const groupInfo = groups.map((g) => {
    const bx = lines.filter((l) => l.pay_group === g).reduce((a, l) => a + l.line_total, 0);
    const due = check ? groupDue(bx, check) : 0;
    const paid = payments.filter((p) => p.pay_group === g).reduce((a, p) => a + p.amount, 0);
    return { g, bx, due, paid, remaining: Math.max(0, due - paid) };
  });
  const allCovered = groups.length > 0 && groupInfo.every((gi) => gi.paid >= gi.due);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* 卓一覧 */}
      <section style={{ ...card, width: 220 }}>
        <h2 style={{ fontSize: 14, color: "#6b6b6b", marginTop: 0 }}>卓</h2>
        {seats.map((s) => (
          <button
            key={s.id}
            onClick={() => openSeat(s)}
            style={{
              ...btnLight, display: "block", width: "100%", textAlign: "left", marginBottom: 8,
              borderColor: check?.seat_id === s.id ? "#e8623a" : openMap[s.id] ? "#c9a24a" : "#e0e0e0",
            }}
          >
            {s.name} {s.kind ? `(${s.kind})` : ""} {openMap[s.id] ? "● 使用中" : "空"}
          </button>
        ))}
        {msg && <p style={{ fontSize: 12, color: "#404040" }}>{msg}</p>}
      </section>

      {/* 伝票 */}
      {check && (
        <section style={{ flex: 1, minWidth: 480 }}>
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>
                伝票（{seats.find((s) => s.id === check.seat_id)?.name}）
              </h2>
              <span style={{ fontSize: 13, color: "#6b6b6b" }}>{NOM_LABEL[check.nom_type]}</span>
              <span style={{ marginLeft: "auto", fontSize: 18, fontWeight: 700 }}>{yen(check.total)}</span>
              {/* void は manager 以上のみ表示（RPC 側でも owner/manager を強制＝二重） */}
              {isManagerUp && (
                <button onClick={voidCheck} style={{ ...btnLight, color: "#e5484d", borderColor: "#e5484d" }}>
                  取消
                </button>
              )}
            </div>
          </div>

          {/* 指名 */}
          <div style={card}>
            <h3 style={{ fontSize: 13, color: "#6b6b6b", marginTop: 0 }}>指名（重み比で分配）</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select value={nomType} onChange={(e) => setNomType(e.target.value)} style={input}>
                <option value="hon">本指名</option>
                <option value="jonai">場内</option>
                <option value="dohan">同伴</option>
                <option value="free">フリー</option>
              </select>
              {casts.map((ca) => (
                <label key={ca.id} style={{ fontSize: 13, display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={(nomWeights[ca.id] ?? 0) > 0}
                    onChange={(e) =>
                      setNomWeights((w) => ({ ...w, [ca.id]: e.target.checked ? 1 : 0 }))
                    }
                  />
                  {ca.name}
                  {(nomWeights[ca.id] ?? 0) > 0 && nomType !== "free" && (
                    <input
                      type="number"
                      min={1}
                      value={nomWeights[ca.id]}
                      onChange={(e) => setNomWeights((w) => ({ ...w, [ca.id]: Number(e.target.value) }))}
                      style={{ ...input, width: 52 }}
                    />
                  )}
                </label>
              ))}
              <button onClick={saveNoms} style={btnDark}>保存</button>
            </div>
          </div>

          {/* 明細追加 */}
          <div style={card}>
            <h3 style={{ fontSize: 13, color: "#6b6b6b", marginTop: 0 }}>明細追加</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <select value={prodId} onChange={(e) => setProdId(e.target.value)} style={{ ...input, maxWidth: 220 }}>
                <option value="">商品を選択</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{yen(p.price)}）
                  </option>
                ))}
              </select>
              <input type="number" min={1} value={prodQty} onChange={(e) => setProdQty(Number(e.target.value))} style={{ ...input, width: 60 }} />
              <span style={{ fontSize: 12 }}>伝票</span>
              <input value={prodGroup} onChange={(e) => setProdGroup(e.target.value)} style={{ ...input, width: 40 }} />
              <button onClick={addProductLine} style={btnDark}>追加</button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={cKind} onChange={(e) => setCKind(e.target.value)} style={input}>
                <option value="set">セット</option>
                <option value="time">延長</option>
                <option value="charge">料金</option>
                <option value="custom">その他</option>
              </select>
              <input placeholder="名称（例 セット60分）" value={cName} onChange={(e) => setCName(e.target.value)} style={{ ...input, width: 170 }} />
              <input type="number" min={0} value={cPrice} onChange={(e) => setCPrice(Number(e.target.value))} style={{ ...input, width: 90 }} />
              <span style={{ fontSize: 12 }}>伝票</span>
              <input value={cGroup} onChange={(e) => setCGroup(e.target.value)} style={{ ...input, width: 40 }} />
              <button onClick={addCustomLine} style={btnDark}>追加</button>
            </div>
          </div>

          {/* 明細 */}
          <div style={card}>
            <h3 style={{ fontSize: 13, color: "#6b6b6b", marginTop: 0 }}>明細</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                    <td style={{ padding: 6 }}>[{l.pay_group}]</td>
                    <td style={{ padding: 6 }}>{l.name_snapshot}</td>
                    <td style={{ padding: 6, textAlign: "right" }}>{yen(l.unit_price_snapshot)} × {l.qty}</td>
                    <td style={{ padding: 6, textAlign: "right" }}>{yen(l.line_total)}</td>
                    <td style={{ padding: 6 }}>
                      <button
                        onClick={() => removeLine(l.id)}
                        disabled={payments.length > 0}
                        title={payments.length > 0 ? "入金後の訂正は取消（void）で" : ""}
                        style={{ ...btnLight, padding: "2px 8px", fontSize: 12 }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 会計 */}
          <div style={card}>
            <h3 style={{ fontSize: 13, color: "#6b6b6b", marginTop: 0 }}>会計（伝票グループ別）</h3>
            <table style={{ borderCollapse: "collapse", fontSize: 13, marginBottom: 10 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e0e0e0" }}>
                  <th style={{ padding: 6 }}>伝票</th>
                  <th style={{ padding: 6 }}>小計</th>
                  <th style={{ padding: 6 }}>請求（サ料込）</th>
                  <th style={{ padding: 6 }}>入金済</th>
                  <th style={{ padding: 6 }}>残額</th>
                </tr>
              </thead>
              <tbody>
                {groupInfo.map((gi) => (
                  <tr key={gi.g} style={{ borderBottom: "1px solid #f4f4f5" }}>
                    <td style={{ padding: 6 }}>{gi.g}</td>
                    <td style={{ padding: 6 }}>{yen(gi.bx)}</td>
                    <td style={{ padding: 6, fontWeight: 700 }}>{yen(gi.due)}</td>
                    <td style={{ padding: 6 }}>{yen(gi.paid)}</td>
                    <td style={{ padding: 6, color: gi.remaining > 0 ? "#e5484d" : "#2e7d32" }}>{yen(gi.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12 }}>伝票</span>
              <input value={payGroup} onChange={(e) => setPayGroup(e.target.value)} style={{ ...input, width: 40 }} />
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={input}>
                {Object.entries(METHOD_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <input
                type="number" min={1} value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                style={{ ...input, width: 110 }}
              />
              {payMethod === "cash" && (
                <input
                  placeholder="お預かり" value={payTendered}
                  onChange={(e) => setPayTendered(e.target.value)}
                  style={{ ...input, width: 100 }}
                />
              )}
              <button onClick={pay} style={btnDark}>入金</button>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {payments.map((p) => (
                <span key={p.id} style={{ fontSize: 12, color: "#404040" }}>
                  [{p.pay_group}] {METHOD_LABEL[p.method]} {yen(p.amount)}
                  {p.tendered != null ? `（預 ${yen(p.tendered)}・釣 ${yen(p.tendered - p.amount)}）` : ""}
                </span>
              ))}
            </div>
            <button
              onClick={closeCheck}
              disabled={!allCovered}
              style={{ ...btnDark, marginTop: 10, padding: "10px 28px", opacity: allCovered ? 1 : 0.4 }}
            >
              会計完了（close）
            </button>
          </div>
        </section>
      )}
      {!check && <p style={{ fontSize: 13, color: "#8f8f8f", padding: 16 }}>卓を選択してください。</p>}
    </div>
  );
}
