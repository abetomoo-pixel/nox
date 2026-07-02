// F0 verify 用の固定フィクスチャ定義（seed:f0 と verify:* で共有）。
// dev 専用・本番環境では使わない（CLAUDE.md 規約）。

export const ORG_A = "NOX-VERIFY-A";
export const ORG_B = "NOX-VERIFY-B";
export const STORE_A1 = "NOX-VERIFY-A1";
export const STORE_A2 = "NOX-VERIFY-A2";
export const STORE_B1 = "NOX-VERIFY-B1";

export type FixtureUserKey = "ownerA" | "managerA1" | "castA1a" | "castA1b" | "managerB1";

export const FIXTURE_USERS: Record<
  FixtureUserKey,
  { email: string; name: string; role: "owner" | "manager" | "staff" | "cast"; store: string; org: string }
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
