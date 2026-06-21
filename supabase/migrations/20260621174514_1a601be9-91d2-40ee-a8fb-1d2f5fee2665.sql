CREATE OR REPLACE FUNCTION public.card_history(_card_id uuid)
RETURNS TABLE(id uuid, action text, metadata jsonb, actor_id uuid, actor_email text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.cards WHERE id = _card_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Carte introuvable'; END IF;
  IF v_owner <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'compliance') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN QUERY
  SELECT a.id, a.action, a.metadata, a.actor_id, p.email, a.created_at
  FROM public.audit_logs a
  LEFT JOIN public.profiles p ON p.id = a.actor_id
  WHERE a.entity_type = 'card' AND a.entity_id = _card_id
  ORDER BY a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.card_history(uuid) TO authenticated;