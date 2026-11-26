
alter table public.payments alter column provider set default 'paystack';
alter table public.payments drop constraint if exists payments_provider_check;
-- Keep the legacy provider value valid for historical failed records, but all new code uses Paystack.
alter table public.payments add constraint payments_provider_check check (provider in ('flutterwave', 'paystack'));
;
