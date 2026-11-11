-- Read-only metadata checks. Never use SQL output alone as proof of Neon branch identity.
-- Confirm project, branch, compute endpoint and target separately in the Neon console.
BEGIN READ ONLY;

SELECT current_database() AS database_name, current_user AS role_name,
       inet_server_addr() AS server_address, inet_server_port() AS server_port,
       current_setting('server_version') AS postgres_version;

SELECT to_regclass('public.payment_intents') AS payment_intents,
       to_regclass('public.wallet_challenges') AS wallet_challenges,
       to_regclass('public.wallet_sessions') AS wallet_sessions;

SELECT to_regprocedure('public.claim_payment_intent(text,text,text,text,text,text,text,jsonb)') AS claim_payment_intent,
       to_regprocedure('public.transition_payment_intent(uuid,text,integer,text,text,text)') AS transition_payment_intent,
       to_regprocedure('public.consume_wallet_challenge(uuid,text)') AS consume_wallet_challenge,
       to_regprocedure('public.claim_judge_intent(text,text,text,text,text,text,text,jsonb)') AS claim_judge_intent;

SELECT has_schema_privilege(current_user,'public','CREATE') AS can_create_in_public,
       has_table_privilege(current_user,to_regclass('public.payment_intents'),'SELECT') AS intents_select,
       has_table_privilege(current_user,to_regclass('public.payment_intents'),'INSERT') AS intents_insert,
       has_table_privilege(current_user,to_regclass('public.payment_intents'),'UPDATE') AS intents_update,
       has_table_privilege(current_user,to_regclass('public.wallet_challenges'),'SELECT') AS challenges_select,
       has_table_privilege(current_user,to_regclass('public.wallet_challenges'),'INSERT') AS challenges_insert,
       has_table_privilege(current_user,to_regclass('public.wallet_challenges'),'UPDATE') AS challenges_update,
       has_table_privilege(current_user,to_regclass('public.wallet_sessions'),'SELECT') AS sessions_select,
       has_table_privilege(current_user,to_regclass('public.wallet_sessions'),'INSERT') AS sessions_insert,
       has_table_privilege(current_user,to_regclass('public.wallet_sessions'),'DELETE') AS sessions_delete;

SELECT p.oid::regprocedure AS function_signature,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege(current_user,p.oid,'EXECUTE') AS can_execute
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('claim_payment_intent','transition_payment_intent','consume_wallet_challenge','claim_judge_intent')
ORDER BY 1;

SELECT pg_catalog.pg_get_functiondef(
 to_regprocedure('public.claim_judge_intent(text,text,text,text,text,text,text,jsonb)')
) AS existing_judge_function_definition;

SELECT t.relname AS table_name, i.indexrelid::regclass AS index_name,
       i.indisunique AS is_unique, i.indisvalid AS is_valid, i.indisready AS is_ready,
       pg_catalog.pg_get_indexdef(i.indexrelid) AS definition
FROM pg_catalog.pg_index i
JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname IN ('payment_intents','wallet_challenges','wallet_sessions')
ORDER BY 1,2;

SELECT c.conrelid::regclass AS table_name,c.conname,c.contype,c.convalidated,
       pg_catalog.pg_get_constraintdef(c.oid) AS definition
FROM pg_catalog.pg_constraint c
WHERE c.conrelid IN (to_regclass('public.payment_intents'),to_regclass('public.wallet_challenges'),to_regclass('public.wallet_sessions'))
ORDER BY 1,2;

COMMIT;
