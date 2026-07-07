CREATE OR REPLACE FUNCTION public.admin_list_clients()
 RETURNS TABLE(user_id uuid, email text, full_name text, kyc_status text, kyc_document_url text, kyc_document_type text, kyc_document_number text, total_cad numeric, card_id uuid, card_tier card_tier, card_status card_status, card_last4 text, is_admin boolean, is_compliance boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.kyc_status::text,
         p.kyc_document_url, p.kyc_document_type, p.kyc_document_number,
         public.user_total_cad(p.id),
         c.id, c.tier, c.status, RIGHT(c.card_number,4),
         public.has_role(p.id,'admin'),
         public.has_role(p.id,'compliance_officer')
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT * FROM public.cards ca WHERE ca.user_id = p.id ORDER BY ca.created_at ASC LIMIT 1
  ) c ON true
  ORDER BY p.created_at DESC;
END; $function$;