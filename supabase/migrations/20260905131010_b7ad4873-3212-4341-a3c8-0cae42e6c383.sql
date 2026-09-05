-- 1. Motifs de virement configurables
CREATE TABLE public.transfer_purposes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_fr text NOT NULL,
  label_en text,
  requires_detail boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.transfer_purposes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.transfer_purposes TO authenticated;
GRANT ALL ON public.transfer_purposes TO service_role;
ALTER TABLE public.transfer_purposes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read purposes" ON public.transfer_purposes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins insert purposes" ON public.transfer_purposes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update purposes" ON public.transfer_purposes
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete purposes" ON public.transfer_purposes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_transfer_purposes_updated BEFORE UPDATE ON public.transfer_purposes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Regles de conformite configurables
CREATE TABLE public.compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  side text NOT NULL DEFAULT 'sender',
  condition_kind text NOT NULL DEFAULT 'purpose',
  purpose_code text,
  min_amount_cad numeric,
  block_percentage smallint NOT NULL DEFAULT 63,
  reason text NOT NULL,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  unlock_mode text NOT NULL DEFAULT 'documents',
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_rules_side_chk CHECK (side IN ('sender','recipient')),
  CONSTRAINT compliance_rules_kind_chk CHECK (condition_kind IN ('purpose','amount_threshold','kyc_not_approved','recipient_unrecognized')),
  CONSTRAINT compliance_rules_unlock_chk CHECK (unlock_mode IN ('documents','compliance_code','admin_review')),
  CONSTRAINT compliance_rules_pct_chk CHECK (block_percentage BETWEEN 1 AND 99)
);

GRANT SELECT ON public.compliance_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.compliance_rules TO authenticated;
GRANT ALL ON public.compliance_rules TO service_role;
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read rules" ON public.compliance_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins insert rules" ON public.compliance_rules
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update rules" ON public.compliance_rules
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete rules" ON public.compliance_rules
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_compliance_rules_updated BEFORE UPDATE ON public.compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Motifs existants
INSERT INTO public.transfer_purposes (code, label_fr, label_en, requires_detail, sort_order) VALUES
  ('immobilier', 'Achat de bien immobilier', 'Real estate purchase', false, 10),
  ('vehicule', 'Achat de véhicule', 'Vehicle purchase', false, 20),
  ('objets_art', 'Achat d''objets d''art / antiquités', 'Art & antiques purchase', false, 30),
  ('art_speciaux', 'Achat d''objets d''art spéciaux', 'Special artwork purchase', false, 40),
  ('investissement', 'Investissement / placement financier', 'Investment', false, 50),
  ('investissement_avec_roi', 'Investissement avec ROI', 'Investment with ROI', false, 55),
  ('entreprise', 'Investissement professionnel / entreprise', 'Business investment', false, 60),
  ('don_familial', 'Don familial', 'Family gift', false, 70),
  ('frais_scolarite', 'Frais de scolarité', 'Tuition fees', false, 80),
  ('frais_medicaux', 'Frais médicaux', 'Medical expenses', false, 90),
  ('voyage', 'Voyage / loisirs', 'Travel & leisure', false, 100),
  ('autre', 'Autre motif', 'Other purpose', true, 999);

-- 4. Regles existantes
INSERT INTO public.compliance_rules (name, side, condition_kind, purpose_code, min_amount_cad, block_percentage, reason, required_documents, unlock_mode, priority) VALUES
  ('KYC émetteur non approuvé', 'sender', 'kyc_not_approved', NULL, NULL, 63,
   'Votre dossier KYC n''est pas encore approuvé par notre cellule conformité. Une vérification renforcée est requise avant tout virement sortant.',
   '[]'::jsonb, 'admin_review', 10),
  ('Bénéficiaire non reconnu', 'sender', 'recipient_unrecognized', NULL, NULL, 63,
   'Le bénéficiaire n''est pas reconnu (tag Valtis ou IBAN attendu). Le contrôle sanctions et listes PEP a échoué.',
   '[]'::jsonb, 'admin_review', 20),
  ('Montant élevé ≥ 10 000', 'sender', 'amount_threshold', NULL, 10000, 63,
   'Virement à montant élevé (≥ 10 000). Un code de déblocage conformité (EDD) est obligatoire — contactez votre gestionnaire dédié.',
   '[]'::jsonb, 'compliance_code', 30),
  ('Justificatifs immobilier', 'sender', 'purpose', 'immobilier', NULL, 82,
   'Le motif déclaré nécessite des justificatifs complémentaires avant finalisation du virement.',
   '[{"code":"real_estate_deed","label":"Acte notarié / promesse de vente"},{"code":"real_estate_id","label":"Pièce d''identité du notaire ou de l''étude"}]'::jsonb,
   'documents', 100),
  ('Justificatifs véhicule', 'sender', 'purpose', 'vehicule', NULL, 82,
   'Le motif déclaré nécessite des justificatifs complémentaires avant finalisation du virement.',
   '[{"code":"vehicle_invoice","label":"Facture d''achat / bon de commande du véhicule"},{"code":"vehicle_registration","label":"Certificat d''immatriculation ou titre de propriété du véhicule"}]'::jsonb,
   'documents', 100),
  ('Justificatifs objets d''art', 'sender', 'purpose', 'objets_art', NULL, 82,
   'Le motif déclaré nécessite des justificatifs complémentaires avant finalisation du virement.',
   '[{"code":"art_certificate","label":"Certificat d''authenticité de l''œuvre / objet"},{"code":"art_ownership","label":"Titre de propriété / preuve de possession"}]'::jsonb,
   'documents', 100),
  ('Objets d''art spéciaux — destinataire', 'recipient', 'purpose', 'art_speciaux', NULL, 82,
   'Achat d''objets d''art spéciaux : vous devez fournir une preuve d''enregistrement ICOM/UNESCO dans les serveurs internationaux, votre carte de collectionneur et la preuve de propriété des objets afin de garantir la légalité de la vente. 3 documents requis côté destinataire.',
   '[{"code":"icom_unesco_registration","label":"Preuve d''enregistrement ICOM/UNESCO des objets dans les serveurs internationaux (PDF)"},{"code":"collector_card","label":"Carte de collectionneur du bénéficiaire (PDF)"},{"code":"ownership_proof","label":"Preuve de propriété des objets (PDF)"}]'::jsonb,
   'documents', 100),
  ('Investissement avec ROI — destinataire', 'recipient', 'purpose', 'investissement_avec_roi', NULL, 87,
   'Investissement avec ROI : la preuve du contrat enregistré et la carte de collectionneur du bénéficiaire doivent être fournis avant toute mise à disposition des fonds. Blocage appliqué uniquement côté destinataire.',
   '[{"code":"contract_registration_proof","label":"Preuve de contrat enregistré (PDF)"},{"code":"collector_card","label":"Carte de collectionneur du bénéficiaire (PDF)"}]'::jsonb,
   'documents', 100);

-- 5. Resolution d'une regle destinataire
CREATE OR REPLACE FUNCTION public.match_recipient_rule(_purpose text, _amount_cad numeric)
RETURNS public.compliance_rules
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.* FROM public.compliance_rules r
  WHERE r.active
    AND r.side = 'recipient'
    AND (
      (r.condition_kind = 'purpose' AND r.purpose_code IS NOT NULL AND r.purpose_code = lower(COALESCE(_purpose, '')))
      OR (r.condition_kind = 'amount_threshold' AND COALESCE(_amount_cad, 0) >= COALESCE(r.min_amount_cad, 0))
    )
  ORDER BY r.priority ASC, r.min_amount_cad DESC NULLS LAST, r.created_at ASC
  LIMIT 1
$$;

-- 6. start_transfer pilote par la configuration
CREATE OR REPLACE FUNCTION public.start_transfer(_from_wallet uuid, _recipient text, _amount numeric, _reference text DEFAULT NULL::text, _purpose text DEFAULT NULL::text)
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
  v_rule public.compliance_rules;
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

    SELECT * INTO v_rule FROM public.match_recipient_rule(_purpose, v_amount_cad);

    IF v_rule.id IS NOT NULL THEN
      v_required := v_rule.required_documents;
      v_block_reason := v_rule.reason;
      v_rec_status := CASE WHEN jsonb_array_length(COALESCE(v_rule.required_documents, '[]'::jsonb)) > 0
        THEN 'documents_required' ELSE 'blocked' END;
      v_rec_progress := v_rule.block_percentage;
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
    IF v_rec_status = 'ok' THEN
      PERFORM public.notify_user(
        v_rec_user, 'transfer.incoming', 'Transfert entrant en vérification',
        'Un transfert de ' || _amount::text || ' ' || v_w.currency || ' est en cours.',
        jsonb_build_object('transfer_id', v_id)
      );
    ELSIF jsonb_array_length(COALESCE(v_required, '[]'::jsonb)) > 0 THEN
      PERFORM public.notify_user(
        v_rec_user,
        'transfer.incoming_documents_required',
        'Action requise — ' || jsonb_array_length(v_required)::text || ' justificatif(s) demandé(s) à ' || v_rec_progress::text || '%',
        COALESCE(v_block_reason, 'Conformité requise') || E'\n\nVeuillez déposer les documents demandés depuis votre tableau de bord. Aucun document supplémentaire n''est demandé à l''émetteur.',
        jsonb_build_object('transfer_id', v_id, 'required_documents', v_required)
      );
    ELSE
      PERFORM public.notify_user(
        v_rec_user, 'transfer.incoming_blocked',
        'Action requise — transfert entrant bloqué (' || v_rec_progress::text || '%)',
        COALESCE(v_block_reason, 'Conformité requise'),
        jsonb_build_object('transfer_id', v_id, 'required_documents', v_required)
      );
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;