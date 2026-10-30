-- Phase 3: verified, two-sided transaction confirmations and seller reviews.
-- Transactions can only be opened by a signed-in buyer for a live listing.
create index if not exists transactions_listing_id_idx on public.transactions(listing_id);
create index if not exists seller_reviews_reviewer_id_idx on public.seller_reviews(reviewer_id);

alter table public.transactions enable row level security;
alter table public.seller_reviews enable row level security;

drop policy if exists "transaction participants can read their transactions" on public.transactions;
create policy "transaction participants can read their transactions"
on public.transactions for select to authenticated
using (
  buyer_id = (select auth.uid())
  or exists (
    select 1 from public.vendors v
    where v.id = transactions.seller_id and v.profile_id = (select auth.uid())
  )
);

drop policy if exists "buyers can start transactions for live listings" on public.transactions;
create policy "buyers can start transactions for live listings"
on public.transactions for insert to authenticated
with check (buyer_id = (select auth.uid()));

drop policy if exists "participants can confirm their side" on public.transactions;
create policy "participants can confirm their side"
on public.transactions for update to authenticated
using (
  buyer_id = (select auth.uid())
  or exists (
    select 1 from public.vendors v
    where v.id = transactions.seller_id and v.profile_id = (select auth.uid())
  )
)
with check (
  buyer_id = (select auth.uid())
  or exists (
    select 1 from public.vendors v
    where v.id = transactions.seller_id and v.profile_id = (select auth.uid())
  )
);

drop policy if exists "Public can read seller reviews" on public.seller_reviews;
create policy "Public can read seller reviews"
on public.seller_reviews for select to anon, authenticated
using (true);

drop policy if exists "buyers can review completed transactions" on public.seller_reviews;
create policy "buyers can review completed transactions"
on public.seller_reviews for insert to authenticated
with check (
  reviewer_id = (select auth.uid())
  and exists (
    select 1 from public.transactions t
    where t.id = seller_reviews.transaction_id
      and t.buyer_id = (select auth.uid())
      and t.seller_id = seller_reviews.vendor_id
      and t.status = 'completed'
      and t.buyer_confirmed
      and t.seller_confirmed
  )
);

create or replace function public.guard_marketplace_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actual_seller_id uuid;
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is null then
      raise exception 'Sign in to record a transaction.';
    end if;
    if new.buyer_id is distinct from (select auth.uid()) then
      raise exception 'A transaction must belong to the signed-in buyer.';
    end if;

    select l.vendor_id into actual_seller_id
    from public.listings l
    join public.vendors v on v.id = l.vendor_id
    where l.id = new.listing_id
      and l.status = 'published'
      and l.moderation_status = 'approved'
      and l.visible_until > now()
      and v.verification_status = 'approved';

    if actual_seller_id is null then
      raise exception 'This listing is not currently available.';
    end if;
    if exists (
      select 1 from public.vendors v
      where v.id = actual_seller_id and v.profile_id = (select auth.uid())
    ) then
      raise exception 'You cannot create a transaction for your own listing.';
    end if;

    new.seller_id := actual_seller_id;
    new.status := 'pending';
    new.buyer_confirmed := false;
    new.seller_confirmed := false;
    new.created_at := now();
    new.updated_at := now();
    new.completed_at := null;
    return new;
  end if;

  if new.listing_id is distinct from old.listing_id
    or new.buyer_id is distinct from old.buyer_id
    or new.seller_id is distinct from old.seller_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Transaction participants and listing cannot be changed.';
  end if;

  if old.status <> 'pending' then
    raise exception 'This transaction can no longer be changed.';
  end if;

  if (select auth.uid()) = old.buyer_id then
    if new.seller_confirmed is distinct from old.seller_confirmed
      or old.buyer_confirmed
      or new.buyer_confirmed is not true then
      raise exception 'Buyers can only confirm receipt once.';
    end if;
  elsif exists (
    select 1 from public.vendors v
    where v.id = old.seller_id and v.profile_id = (select auth.uid())
  ) then
    if new.buyer_confirmed is distinct from old.buyer_confirmed
      or old.seller_confirmed
      or new.seller_confirmed is not true then
      raise exception 'Sellers can only confirm completion once.';
    end if;
  else
    raise exception 'Only the buyer or seller can confirm this transaction.';
  end if;

  new.status := case when new.buyer_confirmed and new.seller_confirmed then 'completed' else 'pending' end;
  new.completed_at := case when new.buyer_confirmed and new.seller_confirmed then now() else null end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists transactions_guard_marketplace_transaction on public.transactions;
create trigger transactions_guard_marketplace_transaction
before insert or update on public.transactions
for each row execute function public.guard_marketplace_transaction();

create or replace function public.guard_seller_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or new.reviewer_id is distinct from (select auth.uid()) then
    raise exception 'A review must belong to the signed-in buyer.';
  end if;

  if not exists (
    select 1 from public.transactions t
    where t.id = new.transaction_id
      and t.buyer_id = (select auth.uid())
      and t.seller_id = new.vendor_id
      and t.status = 'completed'
      and t.buyer_confirmed
      and t.seller_confirmed
  ) then
    raise exception 'Only a completed transaction can be reviewed by its buyer.';
  end if;

  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists seller_reviews_guard_seller_review on public.seller_reviews;
create trigger seller_reviews_guard_seller_review
before insert on public.seller_reviews
for each row execute function public.guard_seller_review();

-- No UPDATE or DELETE policy is granted for reviews, so published reviews are immutable.

drop policy if exists "review authors cannot edit reviews" on public.seller_reviews;
drop policy if exists "review authors cannot delete reviews" on public.seller_reviews;
