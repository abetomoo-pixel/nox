import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
const raw = readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(raw.split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL.trim(), ssl: { rejectUnauthorized: false } });
await db.connect();
// pricing_resolve_core の order（既定=最初の一致の定義）
const rc = await db.query(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='pricing_resolve_core'`);
const rcl = rc.rows[0].prosrc.split('\n');
console.log('=== pricing_resolve_core order/limit ===');
rcl.forEach((l,i)=>{ if (/order by|limit/i.test(l)) console.log(`${i}: ${l.trim()}`); });

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const mgr = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
await mgr.auth.signInWithPassword({ email: 'nox-verify-manager-a1@example.com', password: env.SEED_PASSWORD });
const { data: st } = await admin.from('stores').select('id, org_id').eq('name', 'NOX-VERIFY-A1').single();
// 同帯（条件全 null＝同一）に 30分/60分 の2本。priority: 30分=902・60分=901（60分を上位にして既定の決まり方を見る）
const { data: ins } = await admin.from('pricing_rules').insert([
  { org_id: st.org_id, store_id: st.id, fee_kind: 'extension', seat_kind: null, dow_mask: null, time_from_min: null, time_to_min: null, rank_id: null, amount: 5000, duration_min: 60, priority: 901, is_active: true },
  { org_id: st.org_id, store_id: st.id, fee_kind: 'extension', seat_kind: null, dow_mask: null, time_from_min: null, time_to_min: null, rank_id: null, amount: 3000, duration_min: 30, priority: 902, is_active: true },
]).select('id');
console.log('rules inserted:', ins.length, '(60分=pri901 / 30分=pri902)');
const { data: seat } = await admin.from('seats').select('id').eq('store_id', st.id).eq('name', 'NOX-VERIFY-卓1改').single();
const { data: cid, error } = await mgr.rpc('check_open', { p_seat_id: seat.id, p_people: 1, p_nom_type: 'free' });
if (error) { console.error('open:', error.message); }
const { data: chk } = await admin.from('checks').select('ext_min, ext_fee, ext_menu_snap').eq('id', cid).single();
console.log('既定（checks.ext_min/ext_fee）=', chk.ext_min, '分 / ¥', chk.ext_fee);
console.log('ext_menu_snap =', JSON.stringify(chk.ext_menu_snap));
await admin.from('check_lines').delete().eq('check_id', cid);
await admin.from('checks').delete().eq('id', cid);
await admin.from('pricing_rules').delete().in('id', ins.map(r => r.id));
const { data: left } = await admin.from('pricing_rules').select('id').eq('store_id', st.id).eq('fee_kind', 'extension');
console.log('cleaned. 残 extension rules:', left.length);
