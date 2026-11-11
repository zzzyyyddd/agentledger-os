-- Apply only to a dedicated, empty PostgreSQL database. Access is restricted to the application database role.
create extension if not exists pgcrypto;
create table public.payment_intents (
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
create table public.wallet_challenges (
 id uuid primary key default gen_random_uuid(), nonce text not null unique,
 browser_hash text not null, expires_at timestamptz not null,
 used_at timestamptz, created_at timestamptz not null default now()
);
create table public.wallet_sessions (
 token_hash text primary key, owner_account text not null,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
-- Each function is invoked only by the trusted backend after session verification.
create function public.claim_payment_intent(p_owner text, p_business_key text, p_contract text, p_reference text, p_recipient text, p_amount text, p_operation text, p_input jsonb)
returns setof public.payment_intents language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.payment_intents(business_key,owner_account,contract_account,payment_reference,recipient_account,amount_yoctonear,operation,action_input)
 values(p_business_key,p_owner,p_contract,p_reference,p_recipient,p_amount::numeric,p_operation,p_input)
 on conflict (business_key) do nothing;
 return query update public.payment_intents set status='AWAITING_SIGNATURE', version=version+1, updated_at=now()
 where business_key=p_business_key and owner_account=p_owner and status='CREATED' and action_input=p_input
 returning *;
end $$;
create function public.transition_payment_intent(p_id uuid,p_owner text,p_version integer,p_from text,p_to text,p_hash text default null)
returns setof public.payment_intents language plpgsql security invoker set search_path = '' as $$
begin
 if not ((p_from='AWAITING_SIGNATURE' and p_to in ('SUBMITTED','UNKNOWN')) or (p_from='UNKNOWN' and p_to='SUBMITTED') or (p_from in ('SUBMITTED','UNKNOWN') and p_to in ('CONFIRMED','FAILED','REFUNDED'))) then raise exception 'invalid transition'; end if;
 if p_to='SUBMITTED' and p_hash is null then raise exception 'hash required'; end if;
 return query update public.payment_intents set status=p_to,transaction_hash=coalesce(p_hash,transaction_hash),version=version+1,updated_at=now()
 where id=p_id and owner_account=p_owner and version=p_version and status=p_from and (transaction_hash is null or p_hash is null or transaction_hash=p_hash)
 returning *;
end $$;
create function public.consume_wallet_challenge(p_id uuid,p_browser_hash text)
returns setof public.wallet_challenges language sql security invoker set search_path = '' as $$
 update public.wallet_challenges set used_at=now() where id=p_id and browser_hash=p_browser_hash and used_at is null and expires_at>now() returning *;
$$;
-- A payment reference cannot be concurrently authorized against multiple requests.
create unique index payment_intents_authorize_reference on public.payment_intents(contract_account,payment_reference) where operation='authorize';

-- Only the database owner or explicitly granted application role may access these objects.
revoke all on public.payment_intents, public.wallet_challenges, public.wallet_sessions from public;
revoke all on function public.claim_payment_intent(text,text,text,text,text,text,text,jsonb), public.transition_payment_intent(uuid,text,integer,text,text,text), public.consume_wallet_challenge(uuid,text) from public;
