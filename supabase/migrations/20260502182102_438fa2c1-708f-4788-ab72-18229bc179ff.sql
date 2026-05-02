
REVOKE EXECUTE ON FUNCTION public.recompute_taste_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_wines_recompute_taste() FROM PUBLIC, anon, authenticated;
