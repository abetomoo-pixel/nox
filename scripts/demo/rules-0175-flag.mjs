// ★便 P175-prep（2026-10-23）: lib/nox/rules-0175/flag.ts の鏡（gen-demo.mjs は .mjs＝TS の定数を直接 import できない）。
//   suite（verify:nox-p175prep）が flag.ts と同値であることを pin する＝片方だけ true にできない。
export const RULES_0175_APPLIED = true; // ★便 ON-1（2026-10-26）: 0175 v2（sha16 3979b9fcf596acb7）を Agoora が 10/26 に手貼り＝verify_0175_0176.sql 全 true（関数数 367・表数 104）→ true
export const OKURI_4WAY_APPLIED = true;
export const OKURI_TIERS_APPLIED = false; // ★裁定414 追補（0180）: flag.ts の鏡 // ★便 ON-1（2026-10-26）: 0177（sha16 e22bfcc3eb93625c）適用済み＝6 本の md5 が起草と一致→ true
export const SEAT_MOVE_PRICING_APPLIED = false; // ★便 ON-4（裁定427・0182）: flag.ts の鏡
