# Y: レジ「指名・席」タブに紹介料の入口（裁定272-2／追補 2・R11・案 Q）
def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f"{path}: expected 1 occurrence, got {n}: {old[:90]!r}")
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(s)
    print("edited", path)
P = 'app/(manage)/register/register-board.tsx'
edit(P, [
 ('''import CastPicker from "@/components/nox/cast-picker";''',
  '''import CastPicker from "@/components/nox/cast-picker";
import Picker from "@/components/nox/picker"; // ★裁定272-2 追補（紹介料の紹介者＝裁定259 の picker）
import { detailLinesOf, referralRowsOf, referralTotalOf } from "@/lib/nox/register/referral"; // ★案 Q: 紹介料は明細・合計に載せず別掲'''),
 ('''const FEE_SHIMEI = "shimei";''',
  '''const FEE_SHIMEI = "shimei";
const FEE_REFERRAL = "referral"; // ★裁定272-2 追補: 紹介料カードの通知の宛先'''),
 ('''// approval RPC エラーの日本語化（F3c）''',
  '''// ★裁定272-2 追補（0148 check_add_referral）エラーの日本語化（握り潰さない）
function referralErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad amount")) return "金額は 1 円以上の整数で入力してください";
  if (msg.includes("bad name")) return "メモは 80 字以内で入力してください";
  if (msg.includes("inactive cast")) return "そのキャストは在籍していません";
  if (msg.includes("bad cast")) return "そのキャストは選べません（在籍・自店を確認してください）";
  if (msg.includes("not open")) return "この伝票は締められています";
  if (isBillingLocked(msg)) return BILLING_LOCKED_MSG;
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

// approval RPC エラーの日本語化（F3c）'''),
 ('''  const [dtab, setDtab] = useState<"order" | "nom" | "pay">("order");''',
  '''  const [dtab, setDtab] = useState<"order" | "nom" | "pay">("order");
  // ★裁定272-2 追補（R11・案 Q）: 紹介料の入口（金額・紹介者 picker・メモ）。p_idem_key は client で uuid を生成（規約 9 と同列）
  const [refAmount, setRefAmount] = useState("");
  const [refCast, setRefCast] = useState<string | null>(null);
  const [refMemo, setRefMemo] = useState("");'''),
 ('''  async function removeLine(lineId: string) {''',
  '''  // ★裁定272-2 追補（0148 check_add_referral）: 紹介料＝店が負担する手当（伝票合計・課税額には載らない＝案 Q）。
  //   owner／manager のレジのみ（kiosk-register には出さない＝DB の kiosk 腕は現状維持・裁定272 追補）。
  async function addReferral() {
    if (!check || !isManagerUp) return;
    if (check.status !== "open") { setFeeMsg({ to: FEE_REFERRAL, kind: "bad", text: "この伝票は締められています" }); return; }
    const amount = Number(refAmount.replace(/[,，¥￥\\s]/g, ""));
    if (!Number.isInteger(amount) || amount <= 0) { setFeeMsg({ to: FEE_REFERRAL, kind: "bad", text: "金額は 1 円以上の整数で入力してください" }); return; }
    if (dayBlocked()) return; // ★C層③: 締め済み日の先回り（RPC の関所が本体）
    const { error } = await supabase.rpc("check_add_referral", {
      p_check_id: check.id, p_cast_id: refCast, p_amount: amount, p_memo: refMemo.trim() === "" ? null : refMemo.trim(), p_idem_key: crypto.randomUUID(),
    });
    if (error) { setFeeMsg({ to: FEE_REFERRAL, kind: "bad", text: referralErrJa(error.message) }); return; }
    setRefAmount(""); setRefMemo("");
    setFeeMsg({ to: FEE_REFERRAL, kind: "ok", text: `紹介料 ${yen(amount)} を追加しました（お会計には含まれません）` });
    await loadCheck(check.id);
  }

  async function removeLine(lineId: string) {'''),
 ('''        {/* R-2a-2（モック nox-register-pos `assignmentView` / renderShares）: 指名の分配率カード。''',
  '''        {/* ★裁定272-2／追補 2（R11・案 Q・2026-09-18）: 紹介料の入口＝owner／manager のレジのみ。追加は check_add_referral・取消は既存 check_remove_line（入金前のみ）。
            明細一覧には出さず（detailLinesOf）、合計の下に「紹介料(店負担)」を別掲（referralTotalOf）。 */}
        {isManagerUp && (
          <div className="nox-cardtop" style={card}>
            <h3 style={t.cardTitle}>紹介料</h3>
            <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "0 0 10px", lineHeight: 1.7 }}>
              店が負担する手当です。お客様のお会計には含まれません。
            </p>
            {check.status === "open" && (
              <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  金額
                  <input value={refAmount} inputMode="numeric" placeholder="例: 3000" onChange={(e) => setRefAmount(e.target.value)}
                    style={{ ...t.input, width: 120, padding: "6px 8px" }} />
                  <span style={{ fontSize: 11, color: "var(--sub)" }}>円</span>
                </label>
                <Picker dense items={casts.map((c) => ({ id: c.id, label: c.name }))} value={refCast}
                  onPick={setRefCast} onClear={() => setRefCast(null)} placeholder="紹介者（キャストを検索・未選択＝外部紹介）" />
                <input value={refMemo} placeholder="メモ（任意・80 字まで）" onChange={(e) => setRefMemo(e.target.value)} style={{ ...t.input, padding: "6px 8px" }} />
                <div className="nox-actions">
                  <button type="button" className="nox-btn" onClick={() => void addReferral()}>追加</button>{/* 実行＝青塗り（裁定242） */}
                </div>
              </div>
            )}
            {referralRowsOf(lines).length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {referralRowsOf(lines).map((l) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: 6 }}>
                        <b>{l.cast_id ? (casts.find((c) => c.id === l.cast_id)?.name ?? "（キャスト）") : "外部紹介"}</b>
                        <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>{l.name_snapshot}</span>
                      </td>
                      <td className="num" style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{yen(l.line_total)}</td>
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                        {check.status === "open" && payments.length === 0 && (
                          <button type="button" onClick={() => void removeLine(l.id)}
                            style={{ ...btnLight, color: "var(--bad)", border: "1px solid var(--bad)" }}>取消</button>
                        )}{/* Danger＝red 枠（裁定242）。入金後は check_remove_line が 'has payments' で拒否＝出さない */}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {feeMsg?.to === FEE_REFERRAL && (
              <p style={{ fontSize: 12, fontWeight: 700, margin: "8px 0 0", lineHeight: 1.7,
                color: feeMsg.kind === "ok" ? "var(--ok)" : "var(--danger-ink)" }}>
                {feeMsg.text}
              </p>
            )}
          </div>
        )}

        {/* R-2a-2（モック nox-register-pos `assignmentView` / renderShares）: 指名の分配率カード。'''),
 ('''    const bx = gl.filter((l) => l.kind !== "discount").reduce((a, l) => a + l.line_total, 0);
    const disc = gl.filter((l) => l.kind === "discount").reduce((a, l) => a + l.line_total, 0);
    const net = Math.max(0, bx - disc);''',
  '''    const bx = gl.filter((l) => l.kind !== "discount" && l.kind !== "referral").reduce((a, l) => a + l.line_total, 0); // ★案 Q: 紹介料は小計に載せない（check_group_due と同じ除外）
    const disc = gl.filter((l) => l.kind === "discount").reduce((a, l) => a + l.line_total, 0);
    const net = Math.max(0, bx - disc);'''),
 ('''              {lines.map((l) => {
                const isDisc = l.kind === "discount"; // ★F3c: 承認割引（正の値・表示は −・削除不可＝承認経由のみ）''',
  '''              {detailLinesOf(lines).map((l) => {{/* ★案 Q: 紹介料行は明細に出さない（指名・席タブの紹介料カードで一覧） */}
                const isDisc = l.kind === "discount"; // ★F3c: 承認割引（正の値・表示は −・削除不可＝承認経由のみ）'''),
 ('''          <span className="total num"><small>合計</small>{yen(check.total)}</span>''',
  '''          <span className="total num"><small>合計</small>{yen(check.total)}</span>
          {referralTotalOf(lines) > 0 && (
            <span style={{ fontSize: 11.5, color: "var(--sub)", whiteSpace: "nowrap" }}>紹介料(店負担) <span className="num">{yen(referralTotalOf(lines))}</span></span>
          )}{/* ★案 Q: 合計には含めず別掲 */}'''),
])
print("Y patch done")
