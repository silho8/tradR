-- Sellers can only create private drafts. Publication, approval and expiry are server-controlled.
CREATE OR REPLACE FUNCTION public.guard_seller_listing_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Trusted server-side operations may create listings with an explicit workflow state.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendors v
    WHERE v.id = NEW.vendor_id
      AND v.profile_id = (SELECT auth.uid())
  ) THEN
    NEW.status := 'draft';
    NEW.moderation_status := 'pending';
    NEW.visible_until := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_seller_listing_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_seller_listing_insert ON public.listings;
CREATE TRIGGER guard_seller_listing_insert
BEFORE INSERT ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.guard_seller_listing_insert();
