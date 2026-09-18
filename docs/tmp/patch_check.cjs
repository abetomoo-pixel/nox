const fs = require("fs");
let s = fs.readFileSync("docs/tmp/check_0147.mjs", "utf8");
s = s.replace(
  'const A = strip(nonStar), B = strip(live);',
  `// live 11 行目（v_keys の末尾 '];'）は ★1 で意図的に ',' へ変えた行＝比較集合から外し、別 assert で '];'→',' だけの差であることを見る
const LIVE11 = live[10];
const star1 = fn.find((l) => l.includes("★1 0147: 末尾"));
ok("a0 ★1 の変更行＝live 11 行目の '];'→',' のみ（コメント以外の差なし）", !!star1 && star1.split("   -- ★1")[0] === LIVE11.replace(/\\];$/, ","), star1 ? star1.trim().slice(0, 90) : "missing");
const A = strip(nonStar), B = strip(live.filter((_, i) => i !== 10));`
);
fs.writeFileSync("docs/tmp/check_0147.mjs", s);
console.log("patched check", s.includes("LIVE11"));
