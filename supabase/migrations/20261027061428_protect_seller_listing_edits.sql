-- Phase 4: protect listing trust after seller edits.
-- Sellers may edit their own content and archive a listing, but cannot self-approve,
-- change subscription expiry, or reactivate an archived listing.
CREATE OR REPLACE FUNCTION public.guard_seller_listing_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  is_owner boolean;
BEGIN
  -- Trusted server-side operations (including admin moderation) use the service role.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.vendors v
    WHERE v.id = OLD.vendor_id
      AND v.profile_id = (SELECT auth.uid())
  ) INTO is_owner;

  -- Other authenticated roles remain subject to RLS and any dedicated admin workflow.
  IF NOT is_owner THEN
    RETURN NEW;
  END IF;

  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.visible_until IS DISTINCT FROM OLD.visible_until
     OR NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
    RAISE EXCEPTION 'Sellers cannot change listing ownership, moderation, or subscription expiry.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'Sellers may archive listings but cannot publish or reactivate them directly.';
  END IF;

  IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'Archived listings cannot be reactivated by sellers.';
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.price_ngn IS DISTINCT FROM OLD.price_ngn
     OR NEW.image_urls IS DISTINCT FROM OLD.image_urls THEN
    NEW.moderation_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_seller_listing_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_seller_listing_update ON public.listings;
CREATE TRIGGER guard_seller_listing_update
BEFORE UPDATE ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.guard_seller_listing_update();
