ALTER TABLE public.wines ALTER COLUMN share_id SET DEFAULT translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', '-_');

UPDATE public.wines
SET share_id = translate(share_id, '+/=', '-_')
WHERE share_id ~ '[+/=]';