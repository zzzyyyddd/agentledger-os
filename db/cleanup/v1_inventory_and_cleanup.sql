-- REVIEW ONLY. Do not run as a migration. No data is modified by this file.
-- Inventory the legacy tables before any cleanup; inspect actual results and dependencies.
SELECT table_schema, table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name IN ('payment_intents','wallet_challenges','wallet_sessions') ORDER BY table_name;
SELECT contract_account, status, operation, count(*) AS rows
 FROM public.payment_intents GROUP BY contract_account, status, operation ORDER BY contract_account, status, operation;
SELECT count(*) AS challenges FROM public.wallet_challenges;
SELECT count(*) AS sessions FROM public.wallet_sessions;
-- Proposed destructive cleanup, intentionally commented out. Do not execute until a
-- separate approval, verified backup and recovery review, including UNKNOWN and
-- pending transactions and dependencies, identify exactly which rows may be removed.
-- BEGIN;
-- DELETE FROM public.payment_intents WHERE id = ANY(:reviewed_legacy_ids::uuid[]);
-- DELETE FROM public.wallet_challenges WHERE id = ANY(:reviewed_challenge_ids::uuid[]);
-- DELETE FROM public.wallet_sessions WHERE token_hash = ANY(:reviewed_session_hashes::text[]);
-- COMMIT;
-- Do not drop tables/functions while any legacy deployment may still use them.
