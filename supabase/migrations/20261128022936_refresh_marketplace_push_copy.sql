-- Keep scheduled discovery copy aligned with in-app checkout and order chat.
update public.daily_push_messages
set body = 'Discover campus finds, add what you love to your cart and check out securely on tradR.'
where weekday = 4
  and body ilike '%whatsapp%';
