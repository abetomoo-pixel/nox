// F0 verify 用の固定フィクスチャ定義（seed:f0 と verify:* で共有）。
// dev 専用・本番環境では使わない（CLAUDE.md 規約）。

export const ORG_A = "NOX-VERIFY-A";
export const ORG_B = "NOX-VERIFY-B";
export const STORE_A1 = "NOX-VERIFY-A1";
export const STORE_A2 = "NOX-VERIFY-A2";
export const STORE_B1 = "NOX-VERIFY-B1";

export type FixtureUserKey =
  | "ownerA" | "managerA1" | "staffA1" | "staffRegOnA1" | "staffRegOffA1"
  | "castA1a" | "castA1b" | "managerB1";

// perms = F3a-1（mig0022）staff 機能別フラグ。未指定は全 false（default deny と同じ・seed が明示値で書く＝規約7）。
// staffA1 は perms 無指定＝can_register=false: 既存 assert は会計可視に依存しない（会計テストは managerA1 実行）。
export const FIXTURE_USERS: Record<
  FixtureUserKey,
  {
    email: string; name: string; role: "owner" | "manager" | "staff" | "cast"; store: string; org: string;
    perms?: { can_register: boolean; can_crm: boolean; can_shift: boolean };
  }
> = {
  ownerA: {
    email: "nox-verify-owner-a@example.com",
    name: "検証オーナーA",
    role: "owner",
    store: STORE_A1,
    org: ORG_A,
  },
  managerA1: {
    email: "nox-verify-manager-a1@example.com",
    name: "検証店長A1",
    role: "manager",
    store: STORE_A1,
    org: ORG_A,
  },
  staffA1: {
    email: "nox-verify-staff-a1@example.com",
    name: "検証黒服A1",
    role: "staff",
    store: STORE_A1,
    org: ORG_A,
  },
  // F3a-1（仕様書 §7-A）: staff_can_register_on 相当（会計可視・顧客/シフト不可）
  staffRegOnA1: {
    email: "nox-verify-staff-regon-a1@example.com",
    name: "検証黒服RegOnA1",
    role: "staff",
    store: STORE_A1,
    org: ORG_A,
    perms: { can_register: true, can_crm: false, can_shift: false },
  },
  // F3a-1（仕様書 §7-A）: staff_can_register_off 相当（会計0行・顧客/シフト不可）
  staffRegOffA1: {
    email: "nox-verify-staff-regoff-a1@example.com",
    name: "検証黒服RegOffA1",
    role: "staff",
    store: STORE_A1,
    org: ORG_A,
    perms: { can_register: false, can_crm: false, can_shift: false },
  },
  castA1a: {
    email: "nox-verify-cast-a1a@example.com",
    name: "検証キャストA1a",
    role: "cast",
    store: STORE_A1,
    org: ORG_A,
  },
  castA1b: {
    email: "nox-verify-cast-a1b@example.com",
    name: "検証キャストA1b",
    role: "cast",
    store: STORE_A1,
    org: ORG_A,
  },
  managerB1: {
    email: "nox-verify-manager-b1@example.com",
    name: "検証店長B1",
    role: "manager",
    store: STORE_B1,
    org: ORG_B,
  },
};

export function loadEnvOrExit(keys: string[]): Record<string, string> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // .env.local が無い場合は環境変数直指定を許容
  }
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const k of keys) {
    const v = process.env[k];
    if (!v) missing.push(k);
    else out[k] = v;
  }
  if (missing.length) {
    console.error(`✗ .env.local に次のキーが必要です: ${missing.join(", ")}`);
    process.exit(1);
  }
  return out;
}
