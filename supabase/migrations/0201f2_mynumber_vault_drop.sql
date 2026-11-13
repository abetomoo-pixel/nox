-- 0201f2_mynumber_vault_drop.sql（2026-11-13・CC 起草・貼らない＝合図は相談役）Vault のマイナンバーの鍵 nox_mynumber_key を消す（0201f から分けた・相談役【2】）
-- 翻訳元: docs/tmp/0201f_mynumber_key.sql の旧 ★9（delete from vault.secrets where name = 'nox_mynumber_key'）
-- 検証クエリ: docs/tmp/0201f2_verify.sql（1 回の SELECT で全行・先頭は貼り先証明 select 'nox-project-proof', count(*) from public.orgs;）
-- 事前確認: docs/tmp/0201f2_precheck.sql（返りが貼り先証明の 1 行だけなら貼ってよい）
-- 前提＝0201f の後・0201f のフラグ便（アプリ側の暗号化）を本番で確かめた後。関数・表の数は変えない。
-- ★1 0201f が入っていること（mynumber_enc が text・CHECK がある）と、鍵を読む関数が 0 本であることを本文の中でも確かめる
-- ★2 Vault の鍵 1 行を消す（鍵が無くても 0 行で通る）。DB の中の暗号文は 0201f の後はアプリの鍵で作ったものだけ＝この鍵で戻す番号は無い
-- ★教訓132: begin の直後に lock_timeout
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

do $guard$
begin
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'cast_sensitive' and column_name = 'mynumber_enc') <> 'text' then
    raise exception '0201f2: 0201f not applied';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.cast_sensitive'::regclass and conname = 'cast_sensitive_mynumber_enc_form_check') then
    raise exception '0201f2: ciphertext form check missing';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and regexp_replace(prosrc, '--[^\n]*', '', 'g') like '%nox_mynumber_key%') then
    raise exception '0201f2: a function still reads nox_mynumber_key';
  end if;
end $guard$;

delete from vault.secrets where name = 'nox_mynumber_key';

commit;
