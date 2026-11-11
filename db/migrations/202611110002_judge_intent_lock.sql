-- Apply separately after review; this does not modify existing rows.
-- Serialize judge operations per owner and contract, including different request IDs.
create function public.claim_judge_intent(p_owner text, p_business_key text, p_contract text, p_reference text, p_recipient text, p_amount text, p_operation text, p_input jsonb)
returns setof public.payment_intents language plpgsql security invoker set search_path = '' as $$
declare refund_attempts bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner || ':' || p_contract, 0));
 if exists (select 1 from public.payment_intents where owner_account=p_owner and contract_account=p_contract and status in ('AWAITING_SIGNATURE','SUBMITTED','UNKNOWN')) then
  return;
 end if;
 -- A failed refund can be retried only after its receipt was verified and the
 -- backend marked it FAILED. Pending/unknown attempts are locked above.
 if p_operation = 'refund' then
  if exists (select 1 from public.payment_intents where owner_account=p_owner and contract_account=p_contract and payment_reference=p_reference and operation='refund' and status <> 'FAILED') then
   return;
  end if;
  select count(*) into refund_attempts from public.payment_intents where owner_account=p_owner and contract_account=p_contract and payment_reference=p_reference and operation='refund';
  p_business_key := p_business_key || ':' || refund_attempts::text;
 end if;
 return query select * from public.claim_payment_intent(p_owner,p_business_key,p_contract,p_reference,p_recipient,p_amount,p_operation,p_input);
end $$;
revoke all on function public.claim_judge_intent(text,text,text,text,text,text,text,jsonb) from public;
