const fs = require("fs");
let s = fs.readFileSync("docs/tmp/gen_0147_draft.mjs", "utf8");
s = s.replace('if (live[live.length - 1] === "") live.pop();', 'while (live[live.length - 1] === "") live.pop();');
s = s.replace("if (live.length !== 123) throw new Error(`live def lines ${live.length} (expect 123)`);", "if (live.length !== 122) throw new Error(`live def lines ${live.length} (expect 122)`);");
s = s.split("123 行").join("122 行");
s = s.split("${out.length - 123}").join("${out.length - 122}");
fs.writeFileSync("docs/tmp/gen_0147_draft.mjs", s);
console.log("patched");
