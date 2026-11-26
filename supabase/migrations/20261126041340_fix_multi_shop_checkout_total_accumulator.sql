-- Verify the aggregate accumulator reset is present after the idempotency lookup.
-- This is intentionally an assertion-only follow-up: the corrected function is
-- already included in the consolidated multi-shop migration for clean installs.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.create_order_checkout(uuid,uuid,text,jsonb,jsonb,text,text,text)'::regprocedure
  ) into v_definition;
  if position('v_total_buyer_amount := 0' in v_definition) = 0 then
    raise exception 'Multi-shop checkout aggregate reset is missing';
  end if;
end;
$$;
