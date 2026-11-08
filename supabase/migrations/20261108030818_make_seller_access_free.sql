-- Temporarily remove the shop-wide subscription/trial gate for all sellers.
-- Keep shop approval, ownership protection, and the existing 10-listing quota.

CREATE OR REPLACE FUNCTION public.guard_seller_listing_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  shop_status text;
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;

  SELECT v.verification_status INTO shop_status
  FROM public.vendors v
  WHERE v.id = NEW.vendor_id AND v.profile_id = actor;

  IF NOT FOUND THEN RETURN NEW; END IF;
  IF shop_status <> 'approved' THEN
    RAISE EXCEPTION 'Your shop must be approved by tradR before you can publish listings.';
  END IF;

  NEW.status := 'published';
  NEW.moderation_status := 'approved';
  NEW.visible_until := '9999-12-31 23:59:59+00'::timestamptz;
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
    RAISE EXCEPTION 'Sellers cannot change listing ownership or moderation fields.';
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
    SELECT v.verification_status INTO shop_status
    FROM public.vendors v WHERE v.id = OLD.vendor_id;
    IF shop_status <> 'approved' THEN
      RAISE EXCEPTION 'Your shop must be approved before you can edit live listings.';
    END IF;

    NEW.moderation_status := 'approved';
    NEW.status := 'published';
    NEW.visible_until := '9999-12-31 23:59:59+00'::timestamptz;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_approved_listing_with_shop_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.moderation_status <> 'approved' OR OLD.moderation_status = 'approved' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = NEW.vendor_id AND v.verification_status = 'approved'
  ) THEN
    NEW.status := 'published';
    NEW.visible_until := '9999-12-31 23:59:59+00'::timestamptz;
  ELSE
    NEW.status := 'draft';
    NEW.visible_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Make every existing approved seller's current listings visible again,
-- including listings that had expired under the previous trial/subscription rule.
UPDATE public.listings l
SET status = 'published',
    visible_until = '9999-12-31 23:59:59+00'::timestamptz,
    updated_at = now()
FROM public.vendors v
WHERE v.id = l.vendor_id
  AND v.verification_status = 'approved'
  AND l.status <> 'archived'
  AND l.moderation_status = 'approved';
