CREATE OR REPLACE FUNCTION public.admin_cancel_transfer(_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_t public.transfers; v_docs_pending boolean;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'Une raison d''annulation est obligatoire';
  END IF;

  SELECT * INTO v_t FROM public.transfers WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  IF v_t.status = 'cancelled' THEN RETURN; END IF;

  -- Un virement totalement validé (fonds crédités, aucun document en attente) n'est plus annulable.
  v_docs_pending := (
    v_t.recipient_status IN ('blocked','documents_required','documents_review','tier_upgrade_required','sender_purpose_block')
    OR jsonb_array_length(COALESCE(v_t.purpose_required_documents,'[]'::jsonb))
       > jsonb_array_length(COALESCE(v_t.purpose_submitted_documents,'[]'::jsonb))
    OR jsonb_array_length(COALESCE(v_t.required_documents,'[]'::jsonb))
       > jsonb_array_length(COALESCE(v_t.submitted_documents,'[]'::jsonb))
  );

  IF v_t.status = 'success' AND NOT v_docs_pending THEN
    RAISE EXCEPTION 'Ce virement est entièrement validé : annulation impossible';
  END IF;

  -- Si les fonds avaient déjà été déplacés, on les restitue.
  IF v_t.status = 'success' THEN
    IF v_t.recipient_wallet_id IS NOT NULL THEN
      UPDATE public.wallets SET balance = balance - v_t.amount WHERE id = v_t.recipient_wallet_id;
    END IF;
    UPDATE public.wallets SET balance = balance + v_t.amount WHERE id = v_t.from_wallet_id;
  END IF;

  UPDATE public.transfers
    SET status = 'cancelled',
        block_reason = _reason,
        recipient_status = 'cancelled',
        recipient_block_reason = _reason,
        updated_at = now()
    WHERE id = _id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(),'transfer.cancelled_by_admin','transfer',_id,
          jsonb_build_object('reason',_reason,'previous_status',v_t.status,'amount',v_t.amount,'currency',v_t.currency));

  PERFORM public.notify_user(v_t.sender_id,'transfer.cancelled_by_admin',
    'Virement annulé par la conformité Valtis',
    'Votre virement de ' || v_t.amount::text || ' ' || v_t.currency || ' vers ' || v_t.recipient_identifier ||
    ' a été annulé par la conformité Valtis. Raison : ' || _reason,
    jsonb_build_object('transfer_id',_id,'reason',_reason), true);

  IF v_t.recipient_user_id IS NOT NULL THEN
    PERFORM public.notify_user(v_t.recipient_user_id,'transfer.cancelled_by_admin',
      'Virement entrant annulé par la conformité Valtis',
      'Le virement de ' || v_t.amount::text || ' ' || v_t.currency || ' à votre attention a été annulé par la conformité Valtis. Raison : ' || _reason,
      jsonb_build_object('transfer_id',_id,'reason',_reason), true);
  END IF;
END; $function$;