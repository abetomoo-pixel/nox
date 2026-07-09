// F0 verify 用の固定フィクスチャ定義（seed:f0 と verify:* で共有）。
// dev 専用・本番環境では使わない（CLAUDE.md 規約）。

export const ORG_A = "NOX-VERIFY-A";
export const ORG_B = "NOX-VERIFY-B";
export const STORE_A1 = "NOX-VERIFY-A1";
export const STORE_A2 = "NOX-VERIFY-A2";
export const STORE_B1 = "NOX-VERIFY-B1";

export type FixtureUserKey =
  | "ownerA" | "managerA1" | "staffA1" | "staffRegOnA1" | "staffRegOffA1" | "staffCrmOnA1"
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
  // F3a-2（束2・mig0023）: can_register=false かつ can_crm=true＝2軸独立性の最も厳しい形
  // （会計は0行だが顧客は自店全客が見える staff）。
  staffCrmOnA1: {
    email: "nox-verify-staff-crmon-a1@example.com",
    name: "検証黒服CrmOnA1",
    role: "staff",
    store: STORE_A1,
    org: ORG_A,
    perms: { can_register: false, can_crm: true, can_shift: false },
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

// F3a-2（束2・mig0023）: customers seed の正本（seed:f0 と verify:nox-rls / nox-anon-guard で共有）。
// churnDaysAgo/total は closed check の started_at 逆算と total（customer_summary/list_summary の
// visits・total_spend・churn_tier ゴールデンの源）。tier 期待値: <30='none' / 30-59='mid' / 60+='high'。
// 30/60 の境界日を避けた 5/40/70 を使う（seed→verify の日跨ぎでも tier が動かないマージン）。
export type FixtureCustomerKey =
  | "custCastA" | "custCastB" | "custFree" | "custDormant" | "custA2" | "custB1";
export const FIXTURE_CUSTOMERS: Record<
  FixtureCustomerKey,
  {
    name: string; org: string; store: string;
    cast: "castA1a" | "castA1b" | null;   // 指名担当（customers.cast_id）
    active: boolean;                        // is_active（false=休眠）
    checks: Array<{ daysAgo: number; total: number }>; // closed checks（churn/visits/total_spend 用）
  }
> = {
  // 指名A客: visits=2・total_spend=30000・last_visit=5日前 → churn 'none'（リピート）
  custCastA: {
    name: "NOX-VERIFY-顧客-指名A", org: ORG_A, store: STORE_A1, cast: "castA1a", active: true,
    checks: [{ daysAgo: 5, total: 10_000 }, { daysAgo: 100, total: 20_000 }],
  },
  // 指名B客: last_visit=70日前 → churn 'high'（castA1a からは不可視の他 cast 客）
  custCastB: {
    name: "NOX-VERIFY-顧客-指名B", org: ORG_A, store: STORE_A1, cast: "castA1b", active: true,
    checks: [{ daysAgo: 70, total: 7_000 }],
  },
  // フリー客: cast_id=null・last_visit=40日前 → churn 'mid'（cast からは不可視）
  custFree: {
    name: "NOX-VERIFY-顧客-フリー", org: ORG_A, store: STORE_A1, cast: null, active: true,
    checks: [{ daysAgo: 40, total: 5_000 }],
  },
  // 休眠客: is_active=false（RLS は絞らない＝SELECT では見える・list_summary からは除外）
  custDormant: {
    name: "NOX-VERIFY-顧客-休眠", org: ORG_A, store: STORE_A1, cast: "castA1a", active: false,
    checks: [],
  },
  // 他店客（同 org A・store A2）: manager/staff の店スコープ assert 用（owner のみ可視）
  custA2: {
    name: "NOX-VERIFY-顧客-A2", org: ORG_A, store: STORE_A2, cast: null, active: true,
    checks: [],
  },
  // 他 org 客（org B・store B1）: org 遮断 assert 用（managerB1 のみ可視）
  custB1: {
    name: "NOX-VERIFY-顧客-B1", org: ORG_B, store: STORE_B1, cast: null, active: true,
    checks: [],
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
