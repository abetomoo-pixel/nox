// ★便 ON-3（2026-10-26・0176 ★1＝401 Webhook）: LINE Messaging API の Webhook（店ごと＝path の storeId）。セッション無し＝x-line-signature（Vault の channel_secret・raw body）が信頼の境目。
//   署名違い 401・設定なし 503・bot_destination が入っていて違えば 401。follow とテキストに reply（無料・台帳に入れない）で LIFF の入口を返す。常に 200（LINE の再送を止める）。
//   手順書（docs/handoff/nox_port_2026-10-21.md §4）: LINE Developers の Messaging API チャネルで Webhook URL＝<site>/api/line/webhook/<storeId>・Webhook の利用 ON・応答メッセージ OFF。
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLineSecret, lineSignatureOk, replyLine } from "@/lib/nox/line/server";
import { liffEntryUrlOf } from "@/lib/nox/line/liff-endpoint";
import { UUID_RE, lineStoreOf } from "@/lib/nox/line/subject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LineEvent = { type: string; replyToken?: string; message?: { type?: string; text?: string } };

export async function GET() { return new NextResponse("ok", { status: 200 }); } // LINE コンソールの「検証」は POST＝GET は到達確認だけ

export async function POST(req: Request, ctx: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await ctx.params;
  if (!UUID_RE.test(storeId)) return new NextResponse("not found", { status: 404 });
  const admin = createAdminClient();
  const store = await lineStoreOf(admin, storeId);
  if (!store) return new NextResponse("not found", { status: 404 });
  const secret = await getLineSecret(admin, storeId, "channel_secret");
  if (!secret) return new NextResponse("not configured", { status: 503 });
  const raw = await req.text();
  if (!lineSignatureOk(secret, raw, req.headers.get("x-line-signature"))) return new NextResponse("unauthorized", { status: 401 });
  let j: { destination?: string; events?: LineEvent[] } = {};
  try { j = JSON.parse(raw) as typeof j; } catch { return new NextResponse("ok", { status: 200 }); }
  if (store.config.bot_destination && j.destination && j.destination !== store.config.bot_destination) return new NextResponse("unauthorized", { status: 401 });
  if (store.isDemo) return new NextResponse("ok", { status: 200 }); // デモ org は返事もしない
  const token = await getLineSecret(admin, storeId, "access_token");
  const entry = liffEntryUrlOf(new URL(req.url).origin, storeId);
  for (const ev of j.events ?? []) {
    if (!ev.replyToken || !token) continue;
    if (ev.type === "follow") await replyLine(token, ev.replyToken, `友だち追加ありがとうございます。${store.name} のシフトはこちら：${entry}`);
    else if (ev.type === "message" && ev.message?.type === "text") await replyLine(token, ev.replyToken, `シフトはこちら：${entry}`);
  }
  return new NextResponse("ok", { status: 200 });
}
