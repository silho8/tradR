-- Expose only an aggregate completed-handover count for approved public shops.
-- Transaction rows remain private to their buyer and seller participants.
CREATE OR REPLACE FUNCTION public.get_public_shop_completed_sales(p_vendor_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)
  FROM public.transactions AS t
  JOIN public.vendors AS v ON v.id = t.seller_id
  WHERE v.id = p_vendor_id
    AND v.verification_status = 'approved'
    AND t.status = 'completed';
$$;

REVOKE ALL ON FUNCTION public.get_public_shop_completed_sales(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_shop_completed_sales(uuid) TO anon, authenticated;
