
REVOKE ALL ON FUNCTION public.generate_card_for_user(UUID, TEXT, public.card_tier) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_total_cad(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_card_tier(UUID, public.card_tier) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_card_status(UUID, public.card_status) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_clients() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_admin_if_none() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_total_cad(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_card_tier(UUID, public.card_tier) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_card_status(UUID, public.card_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_clients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_if_none() TO authenticated;
