# 0143 静的突合（2026-09-14・読取のみ・現ファイル 20,204 B）

### daily_report_aggregate: live 本文 57 行 vs mig（★D45 除外）63 行 → 差分 10 行
  live のみ |                  and x.biz_date = p_biz_date and x.method = 'cash')
  mig のみ  |                  and x.biz_date = p_biz_date and x.method = 'cash'),
  mig のみ  |     'ar_collected_card', (select coalesce(sum(x.amount), 0) from public.ar_collections x
  mig のみ  |                where x.org_id = v_org and x.store_id = p_store_id
  mig のみ  |                  and x.biz_date = p_biz_date and x.method = 'card'),
  mig のみ  |     'ar_collected_other', (select coalesce(sum(x.amount), 0) from public.ar_collections x
  mig のみ  |                where x.org_id = v_org and x.store_id = p_store_id
  mig のみ  |                  and x.biz_date = p_biz_date and x.method = 'other')
  live のみ | end $function$
  mig のみ  | end $function$;
  署名: 一致

### daily_report_close: live 本文 61 行 vs mig（★D45 除外）61 行 → 差分 6 行
  live のみ |      biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by)
  mig のみ  |      biz_cutoff_hm, card_tax_rate, close_idem_key, closed_by,
  live のみ |      v_cutoff, v_rate, p_idem_key, v_actor)
  mig のみ  |      v_cutoff, v_rate, p_idem_key, v_actor,
  live のみ | end $function$
  mig のみ  | end $function$;
  署名: 一致
  b. declare v_ar_card/v_ar_other int: あり
  b. ★insert … values … returning が見つからない
  d. diff 式: live「v_diff := case when p_counted_cash is null then null」 mig「v_diff := case when p_counted_cash is null then null」→ 一字一致・v_ar_card/other を含む: 含まない

### daily_report_reclose: live 本文 53 行 vs mig（★D45 除外）53 行 → 差分 2 行
  live のみ | end $function$
  mig のみ  | end $function$;
  署名: 一致
  b. declare v_ar_card/v_ar_other int: あり
  d. diff 式: live「v_diff := case when v_counted is null then null」 mig「v_diff := case when v_counted is null then null」→ 一字一致・v_ar_card/other を含む: 含まない

### c. alter
  alter table public.daily_reports add column ar_collected_card integer not null default 0 check (ar_collected_card >= 0), add column ar_collected_other integer not null default 0 check (ar_collected_other >= 0);
  ar_collected_card: NOT NULL default 0 CHECK>=0 OK / ar_collected_other: OK
  既存制約 28 本に daily_reports_ar_collected_card_check／_other_check: 無し（自動命名 <table>_<column>_check で衝突なし）
  既存 ar_collected の制約名（同型の確認）: daily_reports_ar_collected_check
