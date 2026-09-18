const fs = require("fs");
let s = fs.readFileSync("docs/tmp/gen_0147_draft.mjs", "utf8");
// ★1: live 11 行目（'];'→','）にも可視の ★1 コメントを付ける
s = s.replace('push(l.replace(/\\];$/, ","), "★1");', 'push(l.replace(/\\];$/, ",") + "   -- ★1 0147: 末尾 \'];\' → \',\'（12 キーを続ける）", "★1");');
// notes の live 行番号: 正規表現のエスケープ崩れを includes に置換
s = s.replace("live.findIndex((l) => /jsonb_typeof\\\\(p_patch->'store_code'\\\\)/.test(l)) + 1", "live.findIndex((l) => l.includes(\"jsonb_typeof(p_patch->'store_code')\")) + 1");
s = s.replace("live.findIndex((l) => /p_patch \\\\? 'show_open_status'/.test(l)) + 1", "live.findIndex((l) => l.includes(\"p_patch ? 'show_open_status'\")) + 1");
s = s.replace("live.findIndex((l) => /'\\\\{show_open_status\\\\}'/.test(l)) + 2", "live.findIndex((l) => l.includes(\"'{show_open_status}'\")) + 2");
fs.writeFileSync("docs/tmp/gen_0147_draft.mjs", s);
console.log("patched2", (s.match(/includes\(/g) || []).length, "includes;", s.includes("末尾 '];'") ? "star1 ok" : "star1 MISSING");
