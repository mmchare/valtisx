CREATE OR REPLACE FUNCTION public.cancel_transfer(_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_t public.transfers;
BEGIN
  SELECT * INTO v_t FROM public.transfers WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  IF v_t.sender_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF v_t.status = 'success' THEN RAISE EXCEPTION 'Un virement confirmé ne peut plus être annulé'; END IF;
  IF v_t.status = 'cancelled' THEN RETURN; END IF;

  UPDATE public.transfers
  SET status='cancelled',
      block_reason = COALESCE(_reason, 'Annulé par le donneur d''ordre'),
      recipient_status = 'cancelled',
      updated_at = now()
  WHERE id = _id;

  PERFORM public.notify_user(v_t.sender_id,'transfer.cancelled','Virement annulé',
    'Votre virement de ' || v_t.amount::text || ' ' || v_t.currency || ' vers ' || v_t.recipient_identifier || ' a été annulé.',
    jsonb_build_object('transfer_id',_id), false);

  IF v_t.recipient_user_id IS NOT NULL THEN
    PERFORM public.notify_user(v_t.recipient_user_id,'transfer.cancelled_incoming','Virement entrant annulé',
      'Un virement à votre attention a été annulé par le donneur d''ordre.',
      jsonb_build_object('transfer_id',_id), false);
  END IF;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'transfer.cancelled', 'transfer', _id, jsonb_build_object('reason', COALESCE(_reason,'sender')));
END; $$;

REVOKE ALL ON FUNCTION public.cancel_transfer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_transfer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_transfer(uuid, text) TO service_role;