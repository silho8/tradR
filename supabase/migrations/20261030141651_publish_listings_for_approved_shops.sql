-- Listing approval is no longer a separate moderation gate. Approved shops with
-- active shop access publish immediately; admins retain post-publication removal.
CREATE OR REPLACE FUNCTION public.guard_seller_listing_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  shop_status text;
  signup_at timestamptz;
  access_expires_at timestamptz;
BEGIN
  -- Trusted server-side operations remain able to create workflow records.
  IF actor IS NULL THEN RETURN NEW; END IF;

  SELECT v.verification_status INTO shop_status
  FROM public.vendors v
  WHERE v.id = NEW.vendor_id AND v.profile_id = actor;

  IF NOT FOUND THEN RETURN NEW; END IF;
  IF shop_status <> 'approved' THEN
    RAISE EXCEPTION 'Your shop must be approved by tradR before you can publish listings.';
  END IF;

  SELECT p.created_at INTO signup_at FROM public.profiles p WHERE p.id = actor;
  SELECT max(s.expires_at) INTO access_expires_at
  FROM public.shop_subscriptions s
  WHERE s.vendor_id = NEW.vendor_id AND s.status = 'active' AND s.expires_at > now();

  IF signup_at IS NOT NULL AND now() < signup_at + interval '1 month' THEN
    access_expires_at := greatest(coalesce(access_expires_at, signup_at + interval '1 month'), signup_at + interval '1 month');
  END IF;

  IF access_expires_at IS NULL OR access_expires_at <= now() THEN
    RAISE EXCEPTION 'Your free shop trial has ended. Subscribe for ₦500 per month to publish listings.';
  END IF;

  NEW.status := 'published';
  NEW.moderation_status := 'approved';
  NEW.visible_until := access_expires_at;
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_seller_listing_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  is_owner boolean;
  shop_status text;
  signup_at timestamptz;
  access_expires_at timestamptz;
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = OLD.vendor_id AND v.profile_id = actor
  ) INTO is_owner;
  IF NOT is_owner THEN RETURN NEW; END IF;

  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.visible_until IS DISTINCT FROM OLD.visible_until
     OR NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
    RAISE EXCEPTION 'Sellers cannot change listing ownership, moderation, or subscription expiry.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'Sellers may archive listings but cannot publish or reactivate them directly.';
  END IF;
  IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'Archived listings cannot be reactivated by sellers.';
  END IF;

  IF NEW.status <> 'archived' AND (
     NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.price_ngn IS DISTINCT FROM OLD.price_ngn
     OR NEW.image_urls IS DISTINCT FROM OLD.image_urls) THEN
    SELECT v.verification_status INTO shop_status FROM public.vendors v WHERE v.id = OLD.vendor_id;
    IF shop_status <> 'approved' THEN
      RAISE EXCEPTION 'Your shop must be approved before you can edit live listings.';
    END IF;

    SELECT p.created_at INTO signup_at FROM public.profiles p WHERE p.id = actor;
    SELECT max(s.expires_at) INTO access_expires_at
    FROM public.shop_subscriptions s
    WHERE s.vendor_id = OLD.vendor_id AND s.status = 'active' AND s.expires_at > now();
    IF signup_at IS NOT NULL AND now() < signup_at + interval '1 month' THEN
      access_expires_at := greatest(coalesce(access_expires_at, signup_at + interval '1 month'), signup_at + interval '1 month');
    END IF;
    IF access_expires_at IS NULL OR access_expires_at <= now() THEN
      RAISE EXCEPTION 'Your shop access has expired. Subscribe for ₦500 per month to edit and publish listings.';
    END IF;

    NEW.moderation_status := 'approved';
    NEW.status := 'published';
    NEW.visible_until := greatest(coalesce(OLD.visible_until, access_expires_at), access_expires_at);
  END IF;
  RETURN NEW;
END;
$$;

-- Existing drafts from shops that were awaiting approval become publishable as
-- soon as the shop is approved, subject to the existing trial/subscription gate.
CREATE OR REPLACE FUNCTION public.recheck_vendor_listings_after_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.verification_status = 'approved' AND OLD.verification_status IS DISTINCT FROM NEW.verification_status THEN
    UPDATE public.listings
      SET moderation_status = 'approved', updated_at = now()
      WHERE vendor_id = NEW.id AND status <> 'archived' AND moderation_status <> 'approved';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_seller_listing_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_seller_listing_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recheck_vendor_listings_after_approval() FROM PUBLIC, anon, authenticated;

-- This older guard reset moderation fields after the new publication trigger ran.
-- The replacement insert/update guards above now protect those fields and set them
-- only after verifying shop approval and subscription access.
DROP TRIGGER IF EXISTS listings_protect_system_fields ON public.listings;

-- Publish legacy pending listings belonging to shops that are already approved.
-- The existing publication trigger still enforces the trial/subscription expiry.
UPDATE public.listings l
SET moderation_status = 'approved', updated_at = now()
FROM public.vendors v
WHERE v.id = l.vendor_id
  AND v.verification_status = 'approved'
  AND l.status <> 'archived'
  AND l.moderation_status <> 'approved';
