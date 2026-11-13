-- Read-only inspection. A database name or SQL result alone does not establish
-- the Neon project or branch; verify the endpoint in the provider console first.
SELECT current_database() AS database_name, current_user AS database_role;
SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='agentledger_v2') AS v2_schema_exists,
       to_regclass('agentledger_v2.wallet_challenges') AS challenges,
       to_regclass('agentledger_v2.wallet_sessions') AS sessions,
       to_regclass('agentledger_v2.payment_intents') AS intents,
       to_regclass('agentledger_v2.payment_intents_authorize_reference') AS authorization_index;
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='agentledger_v2' AND table_name IN ('wallet_challenges','wallet_sessions','payment_intents')
ORDER BY table_name, ordinal_position;
SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='agentledger_v2' ORDER BY c.relname,con.conname;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='agentledger_v2' ORDER BY indexname;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege(current_user,p.oid,'EXECUTE') AS can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='agentledger_v2' AND p.proname IN ('consume_wallet_challenge','claim_payment_intent','claim_judge_intent','transition_payment_intent')
ORDER BY p.proname;
SELECT CASE WHEN to_regnamespace('agentledger_v2') IS NULL THEN false
       ELSE has_schema_privilege(current_user,'agentledger_v2','USAGE') END AS v2_schema_usage,
       CASE WHEN to_regclass('agentledger_v2.wallet_challenges') IS NULL THEN false
       ELSE has_table_privilege(current_user,'agentledger_v2.wallet_challenges','SELECT') AND has_table_privilege(current_user,'agentledger_v2.wallet_challenges','INSERT') AND has_table_privilege(current_user,'agentledger_v2.wallet_challenges','UPDATE') END AS challenge_access,
       CASE WHEN to_regclass('agentledger_v2.wallet_sessions') IS NULL THEN false
       ELSE has_table_privilege(current_user,'agentledger_v2.wallet_sessions','SELECT') AND has_table_privilege(current_user,'agentledger_v2.wallet_sessions','INSERT') AND has_table_privilege(current_user,'agentledger_v2.wallet_sessions','DELETE') END AS session_access,
       CASE WHEN to_regclass('agentledger_v2.payment_intents') IS NULL THEN false
       ELSE has_table_privilege(current_user,'agentledger_v2.payment_intents','SELECT') AND has_table_privilege(current_user,'agentledger_v2.payment_intents','INSERT') AND has_table_privilege(current_user,'agentledger_v2.payment_intents','UPDATE') END AS intent_access;
