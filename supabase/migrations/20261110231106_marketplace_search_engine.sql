CREATE OR REPLACE FUNCTION public.search_marketplace_listings(
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_min_price bigint DEFAULT NULL,
  p_max_price bigint DEFAULT NULL,
  p_sort text DEFAULT 'latest',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  category text,
  price_ngn bigint,
  image_urls text[],
  created_at timestamptz,
  vendor jsonb,
  total_count bigint,
  relevance real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH params AS (
    SELECT
      NULLIF(LEFT(BTRIM(COALESCE(p_search, '')), 120), '') AS search_text,
      CASE
        WHEN NULLIF(LEFT(BTRIM(COALESCE(p_search, '')), 120), '') IS NULL THEN NULL
        ELSE websearch_to_tsquery(
          'simple'::regconfig,
          LEFT(BTRIM(COALESCE(p_search, '')), 120)
        )
      END AS search_query
  ),
  matched AS (
    SELECT
      l.id,
      l.title,
      l.description,
      l.category,
      l.price_ngn,
      l.image_urls,
      l.created_at,
      jsonb_build_object(
        'id', v.id,
        'profile_id', v.profile_id,
        'shop_name', v.shop_name,
        'bio', v.bio,
        'whatsapp_number', v.whatsapp_number,
        'logo_url', v.logo_url
      ) AS vendor,
      CASE
        WHEN p.search_text IS NULL THEN 0::real
        ELSE
          (CASE WHEN lower(l.title) = lower(p.search_text) THEN 10 ELSE 0 END) +
          (CASE WHEN position(lower(p.search_text) in lower(l.title)) = 1 THEN 5 ELSE 0 END) +
          (CASE WHEN position(lower(p.search_text) in lower(l.title)) > 0 THEN 3 ELSE 0 END) +
          (CASE WHEN l.search_document @@ p.search_query
            THEN ts_rank_cd(l.search_document, p.search_query) * 2
            ELSE 0 END) +
          (CASE WHEN lower(v.shop_name) = lower(p.search_text) THEN 4
            WHEN position(lower(p.search_text) in lower(v.shop_name)) > 0 THEN 2
            WHEN position(lower(p.search_text) in lower(COALESCE(v.bio, ''))) > 0 THEN 1
            ELSE 0 END)
      END::real AS relevance
    FROM public.listings AS l
    JOIN public.vendors AS v ON v.id = l.vendor_id
    CROSS JOIN params AS p
    WHERE l.status = 'published'
      AND l.moderation_status = 'approved'
      AND l.visible_until > now()
      AND v.verification_status = 'approved'
      AND (p_category IS NULL OR p_category = '' OR p_category = 'All finds' OR l.category = p_category)
      AND (p_min_price IS NULL OR l.price_ngn >= p_min_price)
      AND (p_max_price IS NULL OR l.price_ngn <= p_max_price)
      AND (
        p.search_text IS NULL
        OR l.search_document @@ p.search_query
        OR strpos(lower(COALESCE(v.shop_name, '')), lower(p.search_text)) > 0
        OR strpos(lower(COALESCE(v.bio, '')), lower(p.search_text)) > 0
      )
  ),
  counted AS (
    SELECT matched.*, count(*) OVER () AS total_count
    FROM matched
  )
  SELECT
    counted.id,
    counted.title,
    counted.description,
    counted.category,
    counted.price_ngn,
    counted.image_urls,
    counted.created_at,
    counted.vendor,
    counted.total_count,
    counted.relevance
  FROM counted
  ORDER BY
    CASE WHEN p_sort = 'price-low' THEN counted.price_ngn END ASC NULLS LAST,
    CASE WHEN p_sort = 'price-high' THEN counted.price_ngn END DESC NULLS LAST,
    CASE WHEN p_sort NOT IN ('price-low', 'price-high')
      AND NULLIF(BTRIM(COALESCE(p_search, '')), '') IS NOT NULL
      THEN counted.relevance END DESC NULLS LAST,
    counted.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 40))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

REVOKE ALL ON FUNCTION public.search_marketplace_listings(text, text, bigint, bigint, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_marketplace_listings(text, text, bigint, bigint, text, integer, integer) TO anon, authenticated;
