const fs = require("fs");
let s = fs.readFileSync("docs/tmp/gen_0147_draft.mjs", "utf8");
const before = "push(`  -- ── 0147 追加キー（裁定269-1／270-3）: enum text 2・boolean 10 ────────`, \"★2\");";
const after = "push(`  -- ── ★2〜★4 0147 追加キー（裁定269-1／270-3）: enum text 2・boolean 10 ────────`, \"★2\");";
if (!s.includes(before)) throw new Error("target line not found");
s = s.replace(before, after);
fs.writeFileSync("docs/tmp/gen_0147_draft.mjs", s);
console.log("patched3");
