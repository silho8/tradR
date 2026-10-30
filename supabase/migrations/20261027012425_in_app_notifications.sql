-- tradR Phase 4: persistent in-app notifications for important account events.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'shop_status', 'listing_status', 'subscription_status',
    'transaction_status', 'report_status'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  entity_type text CHECK (entity_type IN ('shop', 'listing', 'subscription', 'transaction', 'report')),
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;
GRANT SELECT, UPDATE (read_at) ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;

DROP POLICY IF EXISTS notifications_read_own ON public.notifications;
CREATE POLICY notifications_read_own
  ON public.notifications FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS notifications_update_own_read_state ON public.notifications;
CREATE POLICY notifications_update_own_read_state
  ON public.notifications FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION private.notify_vendor_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notification_title text;
  notification_message text;
BEGIN
  IF NEW.verification_status IS NOT DISTINCT FROM OLD.verification_status
     OR NEW.verification_status NOT IN ('approved', 'rejected', 'suspended') THEN
    RETURN NEW;
  END IF;

  notification_title := CASE NEW.verification_status
    WHEN 'approved' THEN 'Your shop is approved'
    WHEN 'rejected' THEN 'Your shop needs attention'
    ELSE 'Your shop is suspended'
  END;
  notification_message := CASE NEW.verification_status
    WHEN 'approved' THEN 'Your shop has been approved. You can now submit listings for review.'
    WHEN 'rejected' THEN 'Your shop was not approved. Review your details and contact tradR support for next steps.'
    ELSE 'Your shop has been suspended and its listings may no longer be visible. Contact tradR support for help.'
  END;

  INSERT INTO public.notifications (user_id, kind, title, message, entity_type, entity_id)
  VALUES (NEW.profile_id, 'shop_status', notification_title, notification_message, 'shop', NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tradR shop notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.notify_listing_moderation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recipient uuid;
  notification_title text;
  notification_message text;
BEGIN
  IF NEW.moderation_status IS NOT DISTINCT FROM OLD.moderation_status
     OR NEW.moderation_status NOT IN ('approved', 'rejected', 'suspended') THEN
    RETURN NEW;
  END IF;

  SELECT v.profile_id INTO recipient
  FROM public.vendors AS v
  WHERE v.id = NEW.vendor_id;

  IF recipient IS NULL THEN RETURN NEW; END IF;

  notification_title := CASE NEW.moderation_status
    WHEN 'approved' THEN 'Your listing is approved'
    WHEN 'rejected' THEN 'Your listing needs changes'
    ELSE 'Your listing is suspended'
  END;
  notification_message := CASE NEW.moderation_status
    WHEN 'approved' THEN 'Your listing passed review. Activate it with the ₦500 / 30-day subscription to make it visible.'
    WHEN 'rejected' THEN 'Your listing was not approved. Review its details and contact tradR support if you need clarification.'
    ELSE 'Your listing has been suspended and is no longer eligible for activation. Contact tradR support for help.'
  END;

  INSERT INTO public.notifications (user_id, kind, title, message, entity_type, entity_id)
  VALUES (recipient, 'listing_status', notification_title, notification_message, 'listing', NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tradR listing notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.notify_subscription_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recipient uuid;
  notification_title text;
  notification_message text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('active', 'expired', 'failed') THEN
    RETURN NEW;
  END IF;

  SELECT v.profile_id INTO recipient
  FROM public.vendors AS v
  WHERE v.id = NEW.vendor_id;

  IF recipient IS NULL THEN RETURN NEW; END IF;

  notification_title := CASE NEW.status
    WHEN 'active' THEN 'Your listing is live'
    WHEN 'expired' THEN 'Your listing subscription expired'
    ELSE 'Listing payment did not complete'
  END;
  notification_message := CASE NEW.status
    WHEN 'active' THEN 'Your listing is active for 30 days. You can manage it from My shop.'
    WHEN 'expired' THEN 'Your listing subscription has expired. Renew it to make the listing visible again.'
    ELSE 'We could not complete your listing payment. You can safely try checkout again from My shop.'
  END;

  INSERT INTO public.notifications (user_id, kind, title, message, entity_type, entity_id)
  VALUES (recipient, 'subscription_status', notification_title, notification_message, 'subscription', NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tradR subscription notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

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
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT v.profile_id INTO seller_profile
  FROM public.vendors AS v
  WHERE v.id = NEW.seller_id;

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
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tradR transaction notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.notify_report_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('resolved', 'dismissed') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, message, entity_type, entity_id)
  VALUES (
    NEW.reporter_id,
    'report_status',
    CASE NEW.status WHEN 'resolved' THEN 'Your safety report was reviewed' ELSE 'Your safety report was closed' END,
    CASE NEW.status
      WHEN 'resolved' THEN 'The tradR team has reviewed your safety report. Thank you for helping keep the campus marketplace safer.'
      ELSE 'The tradR team has closed your safety report. Contact support if you have additional evidence or concerns.'
    END,
    'report',
    NEW.id
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tradR report notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_vendor_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify_listing_moderation_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify_subscription_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify_transaction_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify_report_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notifications_vendor_status_change ON public.vendors;
CREATE TRIGGER notifications_vendor_status_change
  AFTER UPDATE OF verification_status ON public.vendors
  FOR EACH ROW WHEN (OLD.verification_status IS DISTINCT FROM NEW.verification_status)
  EXECUTE FUNCTION private.notify_vendor_status_change();

DROP TRIGGER IF EXISTS notifications_listing_moderation_change ON public.listings;
CREATE TRIGGER notifications_listing_moderation_change
  AFTER UPDATE OF moderation_status ON public.listings
  FOR EACH ROW WHEN (OLD.moderation_status IS DISTINCT FROM NEW.moderation_status)
  EXECUTE FUNCTION private.notify_listing_moderation_change();

DROP TRIGGER IF EXISTS notifications_subscription_status_change ON public.listing_subscriptions;
CREATE TRIGGER notifications_subscription_status_change
  AFTER UPDATE OF status ON public.listing_subscriptions
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.notify_subscription_status_change();

DROP TRIGGER IF EXISTS notifications_transaction_status_change ON public.transactions;
CREATE TRIGGER notifications_transaction_status_change
  AFTER UPDATE OF status ON public.transactions
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.notify_transaction_status_change();

DROP TRIGGER IF EXISTS notifications_report_status_change ON public.seller_reports;
CREATE TRIGGER notifications_report_status_change
  AFTER UPDATE OF status ON public.seller_reports
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.notify_report_status_change();
