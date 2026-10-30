-- Phase 4: validate transaction ownership and make handover confirmations trustworthy.
-- Authenticated buyers can only record a real live listing against its actual seller.
CREATE OR REPLACE FUNCTION public.guard_marketplace_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  is_buyer boolean;
  is_seller boolean;
BEGIN
  -- Service-role operations are trusted server-side operations.
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.buyer_id <> actor THEN
      RAISE EXCEPTION 'You can only record a purchase for your own account.';
    END IF;

    IF NEW.status <> 'pending'
       OR NEW.buyer_confirmed
       OR NEW.seller_confirmed
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'New handover records must start pending and unconfirmed.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.listings l
      JOIN public.vendors v ON v.id = l.vendor_id
      WHERE l.id = NEW.listing_id
        AND l.vendor_id = NEW.seller_id
        AND l.status = 'published'
        AND l.moderation_status = 'approved'
        AND l.visible_until > now()
        AND v.verification_status = 'approved'
        AND v.profile_id <> actor
    ) THEN
      RAISE EXCEPTION 'This listing is not currently available for a handover record.';
    END IF;

    RETURN NEW;
  END IF;

  -- Participants cannot rewrite the identity or history of a transaction.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Transaction participants cannot change transaction ownership or history.';
  END IF;

  SELECT OLD.buyer_id = actor INTO is_buyer;
  SELECT EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = OLD.seller_id AND v.profile_id = actor
  ) INTO is_seller;

  IF NOT is_buyer AND NOT is_seller THEN
    RAISE EXCEPTION 'Only the buyer or seller can confirm a handover.';
  END IF;

  IF is_buyer THEN
    IF NEW.seller_confirmed IS DISTINCT FROM OLD.seller_confirmed THEN
      RAISE EXCEPTION 'Buyers cannot confirm the seller side of a handover.';
    END IF;
  ELSE
    IF NEW.buyer_confirmed IS DISTINCT FROM OLD.buyer_confirmed THEN
      RAISE EXCEPTION 'Sellers cannot confirm the buyer side of a handover.';
    END IF;
  END IF;

  IF (OLD.buyer_confirmed AND NOT NEW.buyer_confirmed)
     OR (OLD.seller_confirmed AND NOT NEW.seller_confirmed) THEN
    RAISE EXCEPTION 'Handover confirmations cannot be withdrawn.';
  END IF;

  -- Status and completion timestamp are derived only from both confirmations.
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'Transaction status is controlled by the handover confirmation process.';
  END IF;

  IF NEW.buyer_confirmed AND NEW.seller_confirmed THEN
    NEW.status := 'completed';
    NEW.completed_at := COALESCE(OLD.completed_at, now());
  ELSE
    NEW.status := 'pending';
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_marketplace_transaction() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_marketplace_transaction ON public.transactions;
CREATE TRIGGER guard_marketplace_transaction
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.guard_marketplace_transaction();

CREATE UNIQUE INDEX IF NOT EXISTS transactions_listing_buyer_unique
ON public.transactions (listing_id, buyer_id);
