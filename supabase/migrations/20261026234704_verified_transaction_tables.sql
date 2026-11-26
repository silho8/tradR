create table public.transactions (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.listings(id) on delete restrict,
 buyer_id uuid not null references auth.users(id) on delete restrict,
 seller_id uuid not null references public.vendors(id) on delete restrict,
 status text not null default 'pending' check (status in ('pending','completed','cancelled')),
 buyer_confirmed boolean not null default false,
 seller_confirmed boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz
);
create index transactions_buyer_created_idx on public.transactions (buyer_id, created_at desc);
create index transactions_seller_created_idx on public.transactions (seller_id, created_at desc);
alter table public.transactions enable row level security;
create table public.seller_reviews (
 id uuid primary key default gen_random_uuid(),
 transaction_id uuid not null unique references public.transactions(id) on delete restrict,
 reviewer_id uuid not null references auth.users(id) on delete restrict,
 vendor_id uuid not null references public.vendors(id) on delete restrict,
 rating smallint not null check (rating between 1 and 5),
 review_text text not null default '' check (char_length(review_text) <= 1000),
 created_at timestamptz not null default now()
);
create index seller_reviews_vendor_created_idx on public.seller_reviews (vendor_id, created_at desc);
alter table public.seller_reviews enable row level security;
