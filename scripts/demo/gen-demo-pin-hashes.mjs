// gen-demo-pin-hashes.mjs — デモの人ごとの PIN の bcrypt を作る（★夜便レーン 1・2026-11-11）。
//   入力＝scripts/demo/demo-pin-missing.json（gen-demo が書く「店コード:表示名|pin」）・出力＝scripts/demo/demo-pin-hashes.json に足す（id → { pin, hash }）。
//   ハッシュは本番 DB の pgcrypto crypt を「読み取りだけの tx」で呼ぶ（書込なし）。salt は id から決まる（payload が再生成のたびに変わらない）。
//   PIN の平文は demoPinOf(id)（lib/nox/demo/pin.ts）＝デモ org のキオスクが名前の下に出す値と同じ。本番の店の PIN とは無関係。
process.loadEnvFile(".env.local");
import fs from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
const B64 = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const saltOf = (id) => { const h = createHash("sha256").update(`nox-demo-pin:${id}`).digest(); let s = ""; for (let i = 0; i < 21; i++) s += B64[h[i] % 64]; s += ".Oeu"[h[21] % 4]; return `$2a$06$${s}`; };
const missing = JSON.parse(fs.readFileSync("scripts/demo/demo-pin-missing.json", "utf8"));
const out = fs.existsSync("scripts/demo/demo-pin-hashes.json") ? JSON.parse(fs.readFileSync("scripts/demo/demo-pin-hashes.json", "utf8")) : {};
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin read only");
for (const m of missing) {
  const [id, pin] = m.split("|"); // id＝「店コード:表示名」
  const r = await c.query(`select extensions.crypt($1, $2) h`, [pin, saltOf(id)]);
  const h = r.rows[0].h;
  const back = await c.query(`select extensions.crypt($1, $2) = $2 ok`, [pin, h]); // 照合できること（kiosk_login と同じ式）
  if (!back.rows[0].ok || !h.startsWith("$2a$06$")) throw new Error(`crypt: ${id}`);
  out[id] = { pin, hash: h };
}
await c.query("rollback");
await c.end();
fs.writeFileSync("scripts/demo/demo-pin-hashes.json", JSON.stringify(Object.fromEntries(Object.entries(out).sort()), null, 1) + "\n");
console.log(`added ${missing.length}・total ${Object.keys(out).length}`);
