-- V2 starts empty. Apply only after review and explicit database approval.
create schema agentledger_v2;
revoke all on schema agentledger_v2 from public;
create extension if not exists pgcrypto;
create table agentledger_v2.payment_intents (
 id uuid primary key default gen_random_uuid(),
 business_key text not null unique,
 owner_account text not null,
 contract_account text not null,
 payment_reference text not null,
 recipient_account text,
 amount_yoctonear numeric(39,0),
 operation text not null,
 action_input jsonb not null,
 status text not null default 'CREATED' check (status in ('CREATED','AWAITING_SIGNATURE','SUBMITTED','UNKNOWN','CONFIRMED','FAILED','REFUNDED')),
 transaction_hash text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 0
);
create table agentledger_v2.wallet_challenges (
 id uuid primary key default gen_random_uuid(), nonce text not null unique,
 browser_hash text not null, expires_at timestamptz not null,
 used_at timestamptz, created_at timestamptz not null default now()
);
create table agentledger_v2.wallet_sessions (
 token_hash text primary key, owner_account text not null,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
-- Each function is invoked only by the trusted backend after session verification.
create function agentledger_v2.claim_payment_intent(p_owner text, p_business_key text, p_contract text, p_reference text, p_recipient text, p_amount text, p_operation text, p_input jsonb)
returns setof agentledger_v2.payment_intents language plpgsql security invoker set search_path = '' as $$
begin
 insert into agentledger_v2.payment_intents(business_key,owner_account,contract_account,payment_reference,recipient_account,amount_yoctonear,operation,action_input)
 values(p_business_key,p_owner,p_contract,p_reference,p_recipient,p_amount::numeric,p_operation,p_input)
 on conflict (business_key) do nothing;
 return query update agentledger_v2.payment_intents set status='AWAITING_SIGNATURE', version=version+1, updated_at=now()
 where business_key=p_business_key and owner_account=p_owner and status='CREATED' and action_input=p_input
 returning *;
end $$;
create function agentledger_v2.transition_payment_intent(p_id uuid,p_owner text,p_version integer,p_from text,p_to text,p_hash text default null)
returns setof agentledger_v2.payment_intents language plpgsql security invoker set search_path = '' as $$
begin
 if not ((p_from='AWAITING_SIGNATURE' and p_to in ('SUBMITTED','UNKNOWN','CONFIRMED')) or (p_from='UNKNOWN' and p_to='SUBMITTED') or (p_from in ('SUBMITTED','UNKNOWN') and p_to in ('CONFIRMED','FAILED','REFUNDED'))) then raise exception 'invalid transition'; end if;
 if p_to='SUBMITTED' and p_hash is null then raise exception 'hash required'; end if;
 return query update agentledger_v2.payment_intents set status=p_to,transaction_hash=coalesce(p_hash,transaction_hash),version=version+1,updated_at=now()
 where id=p_id and owner_account=p_owner and version=p_version and status=p_from and (transaction_hash is null or p_hash is null or transaction_hash=p_hash)
 returning *;
end $$;
create function agentledger_v2.consume_wallet_challenge(p_id uuid,p_browser_hash text)
returns setof agentledger_v2.wallet_challenges language sql security invoker set search_path = '' as $$
 update agentledger_v2.wallet_challenges set used_at=now() where id=p_id and browser_hash=p_browser_hash and used_at is null and expires_at>now() returning *;
$$;
-- A payment reference cannot be concurrently authorized against multiple requests.
create unique index payment_intents_authorize_reference on agentledger_v2.payment_intents(contract_account,payment_reference) where operation='authorize';

-- Only the database owner or explicitly granted application role may access these objects.
revoke all on agentledger_v2.payment_intents, agentledger_v2.wallet_challenges, agentledger_v2.wallet_sessions from public;
revoke all on function agentledger_v2.claim_payment_intent(text,text,text,text,text,text,text,jsonb), agentledger_v2.transition_payment_intent(uuid,text,integer,text,text,text), agentledger_v2.consume_wallet_challenge(uuid,text) from public;

-- Apply separately after review; this does not modify existing rows.
-- Serialize judge operations per owner and contract, including different request IDs.
create function agentledger_v2.claim_judge_intent(p_owner text, p_business_key text, p_contract text, p_reference text, p_recipient text, p_amount text, p_operation text, p_input jsonb)
returns setof agentledger_v2.payment_intents language plpgsql security invoker set search_path = '' as $$
declare refund_attempts bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner || ':' || p_contract, 0));
 if exists (select 1 from agentledger_v2.payment_intents where owner_account=p_owner and contract_account=p_contract and status in ('AWAITING_SIGNATURE','SUBMITTED','UNKNOWN')) then
  return;
 end if;
 -- A failed refund can be retried only after its receipt was verified and the
 -- backend marked it FAILED. Pending/unknown attempts are locked above.
 if p_operation = 'refund' then
  if exists (select 1 from agentledger_v2.payment_intents where owner_account=p_owner and contract_account=p_contract and payment_reference=p_reference and operation='refund' and status <> 'FAILED') then
   return;
  end if;
  select count(*) into refund_attempts from agentledger_v2.payment_intents where owner_account=p_owner and contract_account=p_contract and payment_reference=p_reference and operation='refund';
  p_business_key := p_business_key || ':' || refund_attempts::text;
 end if;
 return query select * from agentledger_v2.claim_payment_intent(p_owner,p_business_key,p_contract,p_reference,p_recipient,p_amount,p_operation,p_input);
end $$;
revoke all on function agentledger_v2.claim_judge_intent(text,text,text,text,text,text,text,jsonb) from public;
