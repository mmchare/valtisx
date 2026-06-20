
-- Card tier and status enums
CREATE TYPE public.card_tier AS ENUM ('standard', 'gold_plus');
CREATE TYPE public.card_status AS ENUM ('active', 'blocked', 'expired');

-- Cards table
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holder_name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'Valtis Visa',
  card_number TEXT NOT NULL,
  cvv TEXT NOT NULL,
  expiry_month SMALLINT NOT NULL,
  expiry_year SMALLINT NOT NULL,
  tier public.card_tier NOT NULL DEFAULT 'standard',
  status public.card_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own cards" ON public.cards
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance_officer'));

CREATE POLICY "Admins update cards" ON public.cards
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER cards_touch_updated_at
  BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Card generator
CREATE OR REPLACE FUNCTION public.generate_card_for_user(_user_id UUID, _holder_name TEXT, _tier public.card_tier DEFAULT 'standard')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_number TEXT;
  v_cvv TEXT;
  v_exp DATE;
BEGIN
  v_number := '4' || lpad((floor(random() * 1e15))::bigint::text, 15, '0');
  v_cvv := lpad((floor(random() * 1000))::int::text, 3, '0');
  v_exp := (now() + interval '4 years')::date;

  INSERT INTO public.cards (user_id, holder_name, card_number, cvv, expiry_month, expiry_year, tier)
  VALUES (
    _user_id,
    COALESCE(NULLIF(_holder_name, ''), 'Valtis Client'),
    v_number,
    v_cvv,
    EXTRACT(MONTH FROM v_exp)::smallint,
    EXTRACT(YEAR FROM v_exp)::smallint,
    _tier
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Update handle_new_user to also create a standard card
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.profiles (id, email, full_name, country)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    COALESCE(NEW.raw_user_meta_data->>'country', 'CA')
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');

  INSERT INTO public.wallets (user_id, currency, balance, label, is_primary)
  VALUES
    (NEW.id, 'CAD', 250000.00, 'Compte Principal', true),
    (NEW.id, 'EUR', 180000.00, 'Compte Europe', false);

  PERFORM public.generate_card_for_user(
    NEW.id,
    COALESCE(NULLIF(v_full_name, ''), split_part(NEW.email, '@', 1)),
    'standard'
  );

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (NEW.id, 'user.signup', 'user', NEW.id, jsonb_build_object('email', NEW.email));

  RETURN NEW;
END;
$$;

-- Ensure the trigger on auth.users actually exists (may have been dropped)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill cards for existing users that don't have one
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.id, COALESCE(NULLIF(p.full_name, ''), split_part(p.email, '@', 1)) AS holder
    FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.cards c WHERE c.user_id = p.id)
  LOOP
    PERFORM public.generate_card_for_user(r.id, r.holder, 'standard');
  END LOOP;
END$$;

-- Gold Plus eligibility threshold (CAD equivalent)
CREATE OR REPLACE FUNCTION public.user_total_cad(_user_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    balance * CASE currency
      WHEN 'CAD' THEN 1
      WHEN 'EUR' THEN 1.48
      WHEN 'USD' THEN 1.36
      ELSE 1
    END
  ), 0)
  FROM public.wallets WHERE user_id = _user_id;
$$;

-- Admin RPC: change card tier with balance check for upgrade
CREATE OR REPLACE FUNCTION public.admin_set_card_tier(_card_id UUID, _tier public.card_tier)
RETURNS public.cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card public.cards;
  v_total NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès refusé : rôle administrateur requis';
  END IF;

  SELECT * INTO v_card FROM public.cards WHERE id = _card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carte introuvable'; END IF;

  IF _tier = 'gold_plus' THEN
    v_total := public.user_total_cad(v_card.user_id);
    IF v_total < 500000 THEN
      RAISE EXCEPTION 'Solde insuffisant pour Gold Plus (minimum 500 000 CAD, actuel : %)', round(v_total, 2);
    END IF;
  END IF;

  UPDATE public.cards SET tier = _tier WHERE id = _card_id RETURNING * INTO v_card;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'card.tier_changed', 'card', _card_id, jsonb_build_object('new_tier', _tier, 'user_id', v_card.user_id));

  RETURN v_card;
END;
$$;

-- Admin RPC: change card status (block/activate)
CREATE OR REPLACE FUNCTION public.admin_set_card_status(_card_id UUID, _status public.card_status)
RETURNS public.cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_card public.cards;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès refusé : rôle administrateur requis';
  END IF;
  UPDATE public.cards SET status = _status WHERE id = _card_id RETURNING * INTO v_card;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carte introuvable'; END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'card.status_changed', 'card', _card_id, jsonb_build_object('new_status', _status));
  RETURN v_card;
END;
$$;

-- Bootstrap: allow ANY authenticated user to claim admin while no admin exists.
-- Once an admin is set, this RPC refuses further calls.
CREATE OR REPLACE FUNCTION public.claim_admin_if_none()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'Un administrateur existe déjà';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin.bootstrap', 'user', auth.uid(), '{}'::jsonb);
  RETURN TRUE;
END;
$$;

-- Admin RPC: list all users with totals & primary card
CREATE OR REPLACE FUNCTION public.admin_list_clients()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  kyc_status TEXT,
  total_cad NUMERIC,
  card_id UUID,
  card_tier public.card_tier,
  card_status public.card_status,
  card_last4 TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.kyc_status::text,
    public.user_total_cad(p.id),
    c.id,
    c.tier,
    c.status,
    RIGHT(c.card_number, 4)
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT * FROM public.cards WHERE user_id = p.id ORDER BY created_at ASC LIMIT 1
  ) c ON true
  ORDER BY p.created_at DESC;
END;
$$;
