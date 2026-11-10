-- Harden tradR trust and reputation flows.
-- Remove the older duplicate trigger; the current guard is retained.
DROP TRIGGER IF EXISTS transactions_guard_marketplace_transaction ON public.transactions;

-- Notify sellers when a buyer records a purchase, notify the other participant
-- when one side confirms, and notify both when the handover is complete.
CREATE OR REPLACE FUNCTION private.notify_transaction_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seller_profile uuid;
  notification_title text;
  notification_message text;
BEGIN
  SELECT v.profile_id INTO seller_profile
  FROM public.vendors AS v
  WHERE v.id = NEW.seller_id;

  IF TG_OP = 'INSERT' THEN
    IF seller_profile IS NOT NULL AND seller_profile IS DISTINCT FROM NEW.buyer_id THEN
      INSERT INTO public.notifications (user_id, kind, title, message, entity_type, entity_id)
      VALUES (
        seller_profile,
        'transaction_status',
        'A buyer recorded a purchase',
        'A buyer has recorded a purchase for one of your listings. Open Activity & updates and confirm the handover after it happens.',
        'transaction',
        NEW.id
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('completed', 'cancelled') THEN
    notification_title := CASE NEW.status
      WHEN 'completed' THEN 'Handover confirmed'
      ELSE 'Transaction cancelled'
    END;
    notification_message := CASE NEW.status
      WHEN 'completed' THEN 'Both sides confirmed this handover. You can now leave or view the verified seller review.'
      ELSE 'This transaction was cancelled. Contact the other person if you think this is a mistake.'
    END;

    INSERT INTO public.notifications (user_id, kind, title, message, entity_type, entity_id)
    VALUES (NEW.buyer_id, 'transaction_status', notification_title, notification_message, 'transaction', NEW.id);

    IF seller_profile IS NOT NULL AND seller_profile IS DISTINCT FROM NEW.buyer_id THEN
      INSERT INTO public.notifications (user_id, kind, title, message, entity_type, entity_id)
      VALUES (seller_profile, 'transaction_status', notification_title, notification_message, 'transaction', NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.buyer_confirmed IS DISTINCT FROM OLD.buyer_confirmed AND NEW.buyer_confirmed THEN
    IF seller_profile IS NOT NULL AND seller_profile IS DISTINCT FROM NEW.buyer_id THEN
      INSERT INTO public.notifications (user_id, kind, title, message, entity_type, entity_id)
      VALUES (
        seller_profile,
        'transaction_status',
        'Buyer confirmed receipt',
        'The buyer has confirmed receipt. Confirm the handover from Activity & updates to complete this transaction.',
        'transaction',
        NEW.id
      );
    END IF;
  ELSIF NEW.seller_confirmed IS DISTINCT FROM OLD.seller_confirmed AND NEW.seller_confirmed THEN
    INSERT INTO public.notifications (user_id, kind, title, message, entity_type, entity_id)
    VALUES (
      NEW.buyer_id,
      'transaction_status',
      'Seller confirmed the handover',
      'The seller has confirmed the handover. Confirm receipt from Activity & updates to complete this transaction.',
      'transaction',
      NEW.id
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tradR transaction notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_transaction_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notifications_transaction_status_change ON public.transactions;
CREATE TRIGGER notifications_transaction_status_change
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_transaction_status_change();

-- Anonymous visitors only need public review content and aggregate fields.
-- Keep reviewer and transaction identifiers available only to signed-in users.
REVOKE ALL PRIVILEGES ON TABLE public.seller_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, vendor_id, rating, review_text, created_at)
  ON public.seller_reviews TO anon;
GRANT SELECT ON public.seller_reviews TO authenticated;
GRANT INSERT (transaction_id, reviewer_id, vendor_id, rating, review_text)
  ON public.seller_reviews TO authenticated;
