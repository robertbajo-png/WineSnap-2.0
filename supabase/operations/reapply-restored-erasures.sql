-- Recovery-only operation, before reopening application/Storage access.
-- First import the latest protected external copy of privacy_erasure_receipts.
-- Never assume the restored backup contains erasure requests made after it.
-- Uses the previously authorized requests; it does not select inactive accounts.
BEGIN;

INSERT INTO public.account_erasure_jobs(user_id, requested_at)
SELECT r.user_id, r.requested_at
FROM public.privacy_erasure_receipts r
JOIN auth.users u ON u.id = r.user_id
ON CONFLICT (user_id) DO UPDATE SET last_attempt_at = NULL, last_error_code = NULL;

UPDATE public.wines w SET is_public = false
WHERE EXISTS(SELECT 1 FROM public.privacy_erasure_receipts r WHERE r.user_id = w.user_id);
UPDATE public.profiles p SET is_public = false
WHERE EXISTS(SELECT 1 FROM public.privacy_erasure_receipts r WHERE r.user_id = p.id);

UPDATE public.privacy_erasure_receipts r SET completed_at = NULL
WHERE EXISTS(SELECT 1 FROM auth.users u WHERE u.id = r.user_id);

COMMIT;
