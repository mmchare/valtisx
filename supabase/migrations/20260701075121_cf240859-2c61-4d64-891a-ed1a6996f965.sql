
-- 1) Nouveaux comptes à 0
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  INSERT INTO public.profiles (id, email, full_name, country)
  VALUES (NEW.id, NEW.email, v_full_name, COALESCE(NEW.raw_user_meta_data->>'country', 'CA'));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  INSERT INTO public.wallets (user_id, currency, balance, label, is_primary)
  VALUES
    (NEW.id, 'CAD', 0, 'Compte Principal', true),
    (NEW.id, 'EUR', 0, 'Compte Europe', false);
  PERFORM public.generate_card_for_user(
    NEW.id,
    COALESCE(NULLIF(v_full_name, ''), split_part(NEW.email, '@', 1)),
    'standard'
  );
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (NEW.id, 'user.signup', 'user', NEW.id, jsonb_build_object('email', NEW.email));
  RETURN NEW;
END;
$function$;

-- 2) Colonnes document KYC
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_document_url TEXT,
  ADD COLUMN IF NOT EXISTS kyc_document_type TEXT,
  ADD COLUMN IF NOT EXISTS kyc_document_number TEXT;

-- 3) submit_kyc accepte l'URL du fichier
CREATE OR REPLACE FUNCTION public.submit_kyc(_full_name text, _country text, _doc_type text, _doc_number text, _doc_url text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_admin uuid; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  IF _doc_url IS NULL OR length(_doc_url) < 5 THEN
    RAISE EXCEPTION 'Pièce d''identité requise (upload du document)';
  END IF;
  UPDATE public.profiles
    SET full_name = COALESCE(NULLIF(_full_name,''), full_name),
        country = COALESCE(NULLIF(_country,''), country),
        kyc_status = 'review',
        kyc_document_type = _doc_type,
        kyc_document_number = _doc_number,
        kyc_document_url = _doc_url
  WHERE id = auth.uid()
  RETURNING email INTO v_email;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),'kyc.submitted','user',auth.uid(),
          jsonb_build_object('doc_type',_doc_type,'doc_number',_doc_number,'doc_url',_doc_url));
  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role='admin' LOOP
    PERFORM public.notify_user(v_admin,'kyc.submitted',
      'Nouveau dossier KYC à valider',
      COALESCE(v_email,'client') || ' a soumis son dossier KYC avec pièce d''identité.',
      jsonb_build_object('user_id',auth.uid()));
  END LOOP;
END; $function$;

-- 4) admin_list_clients : exposer l'URL du document pour vérification
DROP FUNCTION IF EXISTS public.admin_list_clients();
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
  LEFT JOIN LATERAL (SELECT * FROM public.cards WHERE user_id=p.id ORDER BY created_at ASC LIMIT 1) c ON true
  ORDER BY p.created_at DESC;
END; $function$;
