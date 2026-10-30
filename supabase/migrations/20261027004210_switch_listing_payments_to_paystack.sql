-- Switch new listing subscription payments to Paystack.
-- Keep the legacy Flutterwave value valid for historical records; the old webhook is retired.
alter table public.payments alter column provider set default 'paystack';
alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check check (provider in ('flutterwave', 'paystack'));
