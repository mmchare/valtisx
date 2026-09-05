CREATE OR REPLACE FUNCTION public.start_transfer(
  _from_wallet uuid,
  _recipient text,
  _amount numeric,
  _reference text DEFAULT NULL::text,
  _purpose text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_w public.wallets;
  v_id uuid;
  v_rec_user uuid;
  v_rec_wallet uuid;
  v_tag text;
  v_amount_cad numeric;
  v_required jsonb;
  v_rec_total numeric;
  v_rec_tier card_tier;
  v_rec_kyc text;
  v_block_reason text;
  v_rec_status text := 'ok';
  v_rec_progress smallint := 100;
  v_special_artwork boolean := lower(COALESCE(_purpose, '')) = 'art_speciaux';
  v_investment_roi boolean := lower(COALESCE(_purpose, '')) = 'investissement_avec_roi';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO v_w FROM public.wallets WHERE id = _from_wallet AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Portefeuille introuvable'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF _amount > v_w.balance THEN RAISE EXCEPTION 'Solde insuffisant'; END IF;

  IF left(_recipient, 1) = '@' THEN
    v_tag := lower(regexp_replace(substring(_recipient from 2), '[^a-z0-9]', '', 'gi'));
    SELECT p.id INTO v_rec_user
      FROM public.profiles p
      WHERE lower(regexp_replace(split_part(p.email, '@', 1), '[^a-z0-9]', '', 'gi')) = v_tag
      LIMIT 1;
    IF v_rec_user IS NOT NULL THEN
      SELECT id INTO v_rec_wallet
        FROM public.wallets
        WHERE user_id = v_rec_user AND currency = v_w.currency
        ORDER BY is_primary DESC
        LIMIT 1;
    END IF;
  END IF;

  v_amount_cad := _amount * CASE v_w.currency
    WHEN 'CAD' THEN 1 WHEN 'EUR' THEN 1.48 WHEN 'USD' THEN 1.36 ELSE 1 END;
  v_required := public.compute_required_documents(v_amount_cad);

  IF v_rec_user IS NOT NULL THEN
    SELECT kyc_status::text INTO v_rec_kyc FROM public.profiles WHERE id = v_rec_user;
    SELECT tier INTO v_rec_tier FROM public.cards WHERE user_id = v_rec_user ORDER BY created_at ASC LIMIT 1;
    v_rec_total := public.user_total_cad(v_rec_user);

    IF v_special_artwork THEN
      v_required := jsonb_build_array(
        jsonb_build_object(
          'code', 'icom_unesco_registration',
          'label', 'Preuve d''enregistrement ICOM/UNESCO des objets dans les serveurs internationaux (PDF)'
        ),
        jsonb_build_object(
          'code', 'collector_card',
          'label', 'Carte de collectionneur du bénéficiaire (PDF)'
        ),
        jsonb_build_object(
          'code', 'ownership_proof',
          'label', 'Preuve de propriété des objets (PDF)'
        )
      );
      v_block_reason := 'Achat d''objets d''art spéciaux : ' ||
        'vous devez fournir une preuve d''enregistrement ICOM/UNESCO dans les serveurs internationaux, ' ||
        'votre carte de collectionneur et la preuve de propriété des objets afin de garantir la légalité de la vente. ' ||
        '3 documents requis côté destinataire.';
      v_rec_status := 'documents_required';
      v_rec_progress := 82;
    ELSIF v_investment_roi THEN
      v_required := jsonb_build_array(
        jsonb_build_object(
          'code', 'contract_registration_proof',
          'label', 'Preuve de contrat enregistré (PDF)'
        ),
        jsonb_build_object(
          'code', 'collector_card',
          'label', 'Carte de collectionneur du bénéficiaire (PDF)'
        )
      );
      v_block_reason := 'Investissement avec ROI : la preuve du contrat enregistré et la carte de collectionneur du bénéficiaire doivent être fournis avant toute mise à disposition des fonds. Blocage appliqué uniquement côté destinataire.';
      v_rec_status := 'documents_required';
      v_rec_progress := 87;
    ELSIF v_rec_kyc <> 'approved' THEN
      v_block_reason := 'KYC destinataire non approuvé — vérification d''identité requise avant tout crédit.';
      v_rec_status := 'blocked';
      v_rec_progress := 63;
    ELSIF jsonb_array_length(v_required) > 0 THEN
      v_block_reason := public.edd_tier_label(v_amount_cad)
        || ' · ' || jsonb_array_length(v_required)::text
        || ' document(s) à fournir et valider par la conformité Valtis.';
      v_rec_status := 'documents_required';
      v_rec_progress := 63;
    ELSIF (v_rec_total + v_amount_cad) > 10000000 AND v_rec_tier <> 'gold_plus' THEN
      v_block_reason := 'Surclassement Gold Plus requis : le solde dépasserait 10 000 000 CAD.';
      v_rec_status := 'tier_upgrade_required';
      v_rec_progress := 63;
    ELSIF (v_rec_total + v_amount_cad) > 50000 AND v_rec_tier = 'standard' THEN
      v_block_reason := 'Surclassement Gold requis : carte standard plafonnée à 50 000 CAD.';
      v_rec_status := 'tier_upgrade_required';
      v_rec_progress := 63;
    END IF;
  END IF;

  INSERT INTO public.transfers(
    sender_id, from_wallet_id, recipient_identifier, recipient_user_id, recipient_wallet_id,
    amount, currency, reference, purpose, status, progress, current_step,
    recipient_progress, recipient_status, recipient_block_reason, required_documents, recipient_current_step
  )
  VALUES (
    auth.uid(), _from_wallet, _recipient, v_rec_user, v_rec_wallet,
    _amount, v_w.currency, _reference, _purpose, 'verifying', 0, 'auth',
    CASE WHEN v_rec_user IS NULL THEN 0 ELSE v_rec_progress END,
    CASE WHEN v_rec_user IS NULL THEN 'pending' ELSE v_rec_status END,
    v_block_reason, v_required, 'auth'
  )
  RETURNING id INTO v_id;

  PERFORM public.notify_user(
    auth.uid(), 'transfer.started', 'Transfert lancé',
    'Vérification conformité en cours pour ' || _amount::text || ' ' || v_w.currency || ' vers ' || _recipient,
    jsonb_build_object('transfer_id', v_id)
  );

  IF v_rec_user IS NOT NULL THEN
    IF v_special_artwork THEN
      PERFORM public.notify_user(
        v_rec_user,
        'transfer.incoming_artwork_registration_required',
        'Action requise — 3 justificatifs demandés à 82%',
        'Le transfert pour achat d''objets d''art spéciaux est arrivé à 82%. Veuillez déposer depuis votre tableau de bord : la preuve d''enregistrement de vos objets dans les serveurs internationaux ICOM/UNESCO, votre carte de collectionneur et la preuve de propriété des objets. Aucun document supplémentaire n''est demandé à l''émetteur.',
        jsonb_build_object('transfer_id', v_id, 'required_documents', v_required)
      );
    ELSIF v_investment_roi THEN
      PERFORM public.notify_user(
        v_rec_user,
        'transfer.incoming_roi_documents_required',
        'Action requise — preuve de contrat enregistré + carte de collectionneur demandées à 87%',
        'Le transfert pour investissement avec ROI est arrivé à 87%. Veuillez déposer la preuve du contrat enregistré et votre carte de collectionneur depuis votre tableau de bord. Aucun document supplémentaire n''est demandé à l''émetteur.',
        jsonb_build_object('transfer_id', v_id, 'required_documents', v_required)
      );
    ELSIF v_rec_status = 'ok' THEN
      PERFORM public.notify_user(
        v_rec_user, 'transfer.incoming', 'Transfert entrant en vérification',
        'Un transfert de ' || _amount::text || ' ' || v_w.currency || ' est en cours.',
        jsonb_build_object('transfer_id', v_id)
      );
    ELSE
      PERFORM public.notify_user(
        v_rec_user, 'transfer.incoming_blocked', 'Action requise — transfert entrant bloqué (63%)',
        COALESCE(v_block_reason, 'Conformité requise'),
        jsonb_build_object('transfer_id', v_id, 'required_documents', v_required)
      );
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;