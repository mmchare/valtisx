CREATE OR REPLACE FUNCTION public.apply_ai_recipient_block(_transfer_id uuid, _reason text, _required jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_t public.transfers;
BEGIN
  SELECT * INTO v_t FROM public.transfers WHERE id = _transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  IF v_t.sender_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Acces refuse';
  END IF;
  IF v_t.recipient_user_id IS NULL THEN RETURN; END IF;
  IF _required IS NULL OR jsonb_array_length(_required) = 0 THEN RETURN; END IF;

  UPDATE public.transfers
    SET recipient_status = 'documents_required',
        recipient_progress = 63,
        recipient_block_reason = _reason,
        required_documents = COALESCE(required_documents, '[]'::jsonb) || _required
    WHERE id = _transfer_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'transfer.ai_recipient_block', 'transfer', _transfer_id,
          jsonb_build_object('reason', _reason, 'required_documents', _required, 'purpose', v_t.purpose));

  PERFORM public.notify_user(
    v_t.recipient_user_id,
    'transfer.incoming_blocked',
    'Action requise — transfert entrant bloque a 63%',
    COALESCE(_reason, 'Documents de conformite requis') ||
      ' Merci de deposer les justificatifs demandes (PDF) depuis votre tableau de bord Valtis.',
    jsonb_build_object('transfer_id', _transfer_id, 'required_documents', _required),
    true
  );
END; $$;