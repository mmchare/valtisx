
-- 1. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "users update own notifications" ON public.notifications;
CREATE POLICY "users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. TRANSFERS
DO $$ BEGIN
  CREATE TYPE public.transfer_status AS ENUM ('verifying','blocked','success','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  recipient_identifier TEXT NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  reference TEXT,
  status public.transfer_status NOT NULL DEFAULT 'verifying',
  progress SMALLINT NOT NULL DEFAULT 0,
  current_step TEXT,
  block_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transfers_sender_idx ON public.transfers(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transfers_recipient_idx ON public.transfers(recipient_user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parties read transfers" ON public.transfers;
CREATE POLICY "parties read transfers" ON public.transfers
  FOR SELECT TO authenticated USING (
    auth.uid() = sender_id
    OR auth.uid() = recipient_user_id
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'compliance_officer')
  );
DROP TRIGGER IF EXISTS transfers_touch ON public.transfers;
CREATE TRIGGER transfers_touch BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Cards default blocked
CREATE OR REPLACE FUNCTION public.generate_card_for_user(_user_id uuid, _holder_name text, _tier card_tier DEFAULT 'standard'::card_tier)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id UUID; v_number TEXT; v_cvv TEXT; v_exp DATE;
BEGIN
  v_number := '4' || lpad((floor(random() * 1e15))::bigint::text, 15, '0');
  v_cvv := lpad((floor(random() * 1000))::int::text, 3, '0');
  v_exp := (now() + interval '4 years')::date;
  INSERT INTO public.cards (user_id, holder_name, card_number, cvv, expiry_month, expiry_year, tier, status)
  VALUES (_user_id, COALESCE(NULLIF(_holder_name,''),'Valtis Client'),
          v_number, v_cvv, EXTRACT(MONTH FROM v_exp)::smallint, EXTRACT(YEAR FROM v_exp)::smallint,
          _tier, 'blocked')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 4. notify helper
CREATE OR REPLACE FUNCTION public.notify_user(_user_id uuid, _type text, _title text, _body text, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notifications(user_id,type,title,body,metadata)
  VALUES (_user_id,_type,_title,_body,COALESCE(_meta,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 5. Submit KYC
CREATE OR REPLACE FUNCTION public.submit_kyc(_full_name text, _country text, _doc_type text, _doc_number text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_admin uuid; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  UPDATE public.profiles
    SET full_name = COALESCE(NULLIF(_full_name,''), full_name),
        country = COALESCE(NULLIF(_country,''), country),
        kyc_status = 'review'
  WHERE id = auth.uid()
  RETURNING email INTO v_email;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),'kyc.submitted','user',auth.uid(),
          jsonb_build_object('doc_type',_doc_type,'doc_number',_doc_number));
  FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role='admin' LOOP
    PERFORM public.notify_user(v_admin,'kyc.submitted',
      'Nouveau dossier KYC à valider',
      COALESCE(v_email,'client') || ' a soumis son dossier KYC.',
      jsonb_build_object('user_id',auth.uid()));
  END LOOP;
END; $$;

-- 6. Admin KYC
CREATE OR REPLACE FUNCTION public.admin_set_kyc_status(_user_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _status NOT IN ('pending','review','approved','rejected') THEN
    RAISE EXCEPTION 'Statut KYC invalide';
  END IF;
  UPDATE public.profiles SET kyc_status = _status WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil introuvable'; END IF;
  IF _status = 'approved' THEN
    UPDATE public.cards SET status = 'active'
    WHERE user_id = _user_id AND status = 'blocked' AND tier = 'standard';
    PERFORM public.notify_user(_user_id,'kyc.approved','KYC approuvé',
      'Votre dossier KYC a été validé. Votre carte standard est désormais active.', '{}'::jsonb);
  ELSIF _status = 'rejected' THEN
    PERFORM public.notify_user(_user_id,'kyc.rejected','KYC refusé',
      'Votre dossier KYC nécessite une mise à jour. Contactez votre gestionnaire.', '{}'::jsonb);
  ELSIF _status = 'review' THEN
    PERFORM public.notify_user(_user_id,'kyc.review','KYC en révision',
      'Votre dossier KYC est en cours d''examen.', '{}'::jsonb);
  END IF;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),'kyc.status_changed','user',_user_id,jsonb_build_object('new_status',_status));
END; $$;

-- 7. Admin adjust wallet
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(_wallet_id uuid, _delta numeric, _reason text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_w public.wallets; v_new numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO v_w FROM public.wallets WHERE id = _wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Portefeuille introuvable'; END IF;
  v_new := v_w.balance + _delta;
  IF v_new < 0 THEN RAISE EXCEPTION 'Solde négatif interdit (actuel %, delta %)', v_w.balance, _delta; END IF;
  UPDATE public.wallets SET balance = v_new WHERE id = _wallet_id;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),'wallet.adjusted','wallet',_wallet_id,
          jsonb_build_object('delta',_delta,'new_balance',v_new,'reason',_reason));
  PERFORM public.notify_user(v_w.user_id,
    CASE WHEN _delta >= 0 THEN 'wallet.credited' ELSE 'wallet.debited' END,
    CASE WHEN _delta >= 0 THEN 'Crédit appliqué' ELSE 'Débit appliqué' END,
    'Ajustement de ' || _delta::text || ' ' || v_w.currency || COALESCE(' — ' || _reason,''),
    jsonb_build_object('wallet_id',_wallet_id,'delta',_delta,'reason',_reason));
  RETURN v_new;
END; $$;

-- 8. Admin set role
CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role app_role, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_admin_count int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _grant THEN
    INSERT INTO public.user_roles(user_id,role) VALUES (_user_id,_role)
    ON CONFLICT (user_id,role) DO NOTHING;
  ELSE
    IF _role = 'admin' THEN
      SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role='admin';
      IF v_admin_count <= 1 AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='admin') THEN
        RAISE EXCEPTION 'Impossible de retirer le dernier administrateur';
      END IF;
    END IF;
    DELETE FROM public.user_roles WHERE user_id=_user_id AND role=_role;
  END IF;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES (auth.uid(),'role.changed','user',_user_id,jsonb_build_object('role',_role,'grant',_grant));
  PERFORM public.notify_user(_user_id,'role.changed',
    CASE WHEN _grant THEN 'Privilèges élevés' ELSE 'Privilèges modifiés' END,
    CASE WHEN _grant THEN 'Rôle ' || _role::text || ' attribué.' ELSE 'Rôle ' || _role::text || ' retiré.' END,
    '{}'::jsonb);
END; $$;

-- 9. Transfer lifecycle
CREATE OR REPLACE FUNCTION public.start_transfer(
  _from_wallet uuid, _recipient text, _amount numeric, _reference text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_w public.wallets; v_id uuid; v_rec_user uuid; v_rec_wallet uuid; v_tag text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO v_w FROM public.wallets WHERE id = _from_wallet AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Portefeuille introuvable'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF _amount > v_w.balance THEN RAISE EXCEPTION 'Solde insuffisant'; END IF;
  IF left(_recipient,1) = '@' THEN
    v_tag := lower(regexp_replace(substring(_recipient from 2), '[^a-z0-9]', '', 'gi'));
    SELECT p.id INTO v_rec_user FROM public.profiles p
      WHERE lower(regexp_replace(split_part(p.email,'@',1), '[^a-z0-9]', '', 'gi')) = v_tag
      LIMIT 1;
    IF v_rec_user IS NOT NULL THEN
      SELECT id INTO v_rec_wallet FROM public.wallets
        WHERE user_id = v_rec_user AND currency = v_w.currency
        ORDER BY is_primary DESC LIMIT 1;
    END IF;
  END IF;
  INSERT INTO public.transfers(sender_id,from_wallet_id,recipient_identifier,recipient_user_id,recipient_wallet_id,amount,currency,reference,status,progress,current_step)
  VALUES (auth.uid(),_from_wallet,_recipient,v_rec_user,v_rec_wallet,_amount,v_w.currency,_reference,'verifying',0,'auth')
  RETURNING id INTO v_id;
  PERFORM public.notify_user(auth.uid(),'transfer.started','Transfert lancé',
    'Vérification conformité en cours pour ' || _amount::text || ' ' || v_w.currency || ' vers ' || _recipient,
    jsonb_build_object('transfer_id',v_id));
  IF v_rec_user IS NOT NULL THEN
    PERFORM public.notify_user(v_rec_user,'transfer.incoming','Transfert entrant en vérification',
      'Un transfert de ' || _amount::text || ' ' || v_w.currency || ' est en cours de vérification conformité.',
      jsonb_build_object('transfer_id',v_id));
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_transfer_progress(_id uuid, _progress smallint, _step text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.transfers SET progress = _progress, current_step = _step
  WHERE id = _id AND (sender_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
END; $$;

CREATE OR REPLACE FUNCTION public.block_transfer(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_t public.transfers;
BEGIN
  UPDATE public.transfers SET status='blocked', block_reason=_reason, progress=63, current_step='edd'
  WHERE id = _id AND (sender_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  RETURNING * INTO v_t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  PERFORM public.notify_user(v_t.sender_id,'transfer.blocked','Transfert suspendu (63%)',
    'Le contrôle EDD a bloqué votre virement. ' || COALESCE(_reason,''),
    jsonb_build_object('transfer_id',_id));
  IF v_t.recipient_user_id IS NOT NULL THEN
    PERFORM public.notify_user(v_t.recipient_user_id,'transfer.blocked_incoming','Transfert entrant bloqué',
      'Un virement à votre attention a été suspendu par la conformité.',
      jsonb_build_object('transfer_id',_id));
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_transfer(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_t public.transfers;
BEGIN
  SELECT * INTO v_t FROM public.transfers WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfert introuvable'; END IF;
  IF v_t.sender_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF v_t.status = 'success' THEN RETURN; END IF;
  UPDATE public.wallets SET balance = balance - v_t.amount WHERE id = v_t.from_wallet_id;
  IF v_t.recipient_wallet_id IS NOT NULL THEN
    UPDATE public.wallets SET balance = balance + v_t.amount WHERE id = v_t.recipient_wallet_id;
  END IF;
  UPDATE public.transfers SET status='success', progress=100, current_step='confirm', block_reason=NULL WHERE id = _id;
  PERFORM public.notify_user(v_t.sender_id,'transfer.success','Transfert confirmé',
    'Votre virement de ' || v_t.amount::text || ' ' || v_t.currency || ' vers ' || v_t.recipient_identifier || ' est confirmé.',
    jsonb_build_object('transfer_id',_id));
  IF v_t.recipient_user_id IS NOT NULL THEN
    PERFORM public.notify_user(v_t.recipient_user_id,'transfer.received','Fonds reçus',
      'Vous avez reçu ' || v_t.amount::text || ' ' || v_t.currency || '.',
      jsonb_build_object('transfer_id',_id));
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.notifications SET read_at = now()
  WHERE user_id = auth.uid() AND (_ids IS NULL OR id = ANY(_ids));
$$;

-- 11. Re-create admin_list_clients (drop first; return type changed)
DROP FUNCTION IF EXISTS public.admin_list_clients();
CREATE FUNCTION public.admin_list_clients()
 RETURNS TABLE(user_id uuid, email text, full_name text, kyc_status text, total_cad numeric, card_id uuid, card_tier card_tier, card_status card_status, card_last4 text, is_admin boolean, is_compliance boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.kyc_status::text,
         public.user_total_cad(p.id),
         c.id, c.tier, c.status, RIGHT(c.card_number,4),
         public.has_role(p.id,'admin'),
         public.has_role(p.id,'compliance_officer')
  FROM public.profiles p
  LEFT JOIN LATERAL (SELECT * FROM public.cards WHERE user_id=p.id ORDER BY created_at ASC LIMIT 1) c ON true
  ORDER BY p.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_user_wallets(_user_id uuid)
RETURNS TABLE(id uuid, currency text, balance numeric, label text, is_primary boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY SELECT w.id, w.currency::text, w.balance, w.label, w.is_primary FROM public.wallets w WHERE w.user_id = _user_id ORDER BY w.is_primary DESC;
END; $$;
