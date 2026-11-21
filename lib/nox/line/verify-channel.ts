// ★0202e（2026-11-21 夜・枝 night1121-line-verify）: LINE 連携の確かめ＝Vault のトークンで LINE の API に聞く（サーバ専用・route からだけ呼ぶ）。
//   1 GET /v2/bot/info：トークンが効き、ボットの ID（basicId＝@…／userId＝U…）が保存した値と同じ（保存してある方だけ比べる・どちらも無ければ偽）
//   2 GET /v2/bot/channel/webhook/endpoint：登録先が NOX の Webhook（<site>/api/line/webhook/<storeId>）で、有効（active）
//   3 POST /v2/bot/channel/webhook/test：LINE から Webhook へのテストが成功（署名の確かめまで通る）
//   戻すのは真偽の 4 つと日本語の理由だけ＝トークン・URL・ボットの ID は戻さない・ログにも出さない。店の側の LINE 連携の画面にも同じ確かめを付けるときはこの部品を使う。
export type LineVerifyResult = { bot_id_match: boolean; webhook_endpoint_ok: boolean; webhook_active: boolean; webhook_test_ok: boolean };
export const LINE_VERIFY_REASON: Record<keyof LineVerifyResult, string> = {
  bot_id_match: "ボットの ID が保存した値と違う（トークンか ID を確かめてください）",
  webhook_endpoint_ok: "Webhook の登録先が NOX になっていない",
  webhook_active: "Webhook の利用がオフになっている",
  webhook_test_ok: "Webhook のテストが通らない（チャネルシークレットを確かめてください）",
};
const API = "https://api.line.me/v2/bot";
export async function verifyLineChannel(o: { token: string; expectBasicId?: string | null; expectUserId?: string | null; webhookUrl: string; fetchImpl?: typeof fetch }): Promise<{ result: LineVerifyResult; reasons: string[] }> {
  const f = o.fetchImpl ?? fetch;
  const h = { authorization: `Bearer ${o.token}` };
  const json = async (r: Response) => (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const res: LineVerifyResult = { bot_id_match: false, webhook_endpoint_ok: false, webhook_active: false, webhook_test_ok: false };
  try {
    const r1 = await f(`${API}/info`, { headers: h });
    if (r1.ok) {
      const b = await json(r1);
      const want = [o.expectBasicId ? b.basicId === o.expectBasicId : null, o.expectUserId ? b.userId === o.expectUserId : null].filter((x) => x !== null);
      res.bot_id_match = want.length > 0 && want.every(Boolean);
    }
    const r2 = await f(`${API}/channel/webhook/endpoint`, { headers: h });
    if (r2.ok) { const e = await json(r2); res.webhook_endpoint_ok = e.endpoint === o.webhookUrl; res.webhook_active = e.active === true; }
    const r3 = await f(`${API}/channel/webhook/test`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({}) });
    if (r3.ok) { const t = await json(r3); res.webhook_test_ok = t.success === true; }
  } catch { /* 通信の失敗＝偽のまま（理由に出る） */ }
  const reasons = (Object.keys(res) as (keyof LineVerifyResult)[]).filter((k) => !res[k]).map((k) => LINE_VERIFY_REASON[k]);
  return { result: res, reasons };
}
