INSERT INTO public.profiles (id, username, email, status, approved_at)
VALUES ('b9be37f9-76f0-41ac-a1d0-760f7ee79ecb', 'dingfungawd', 'dingfungawd@hansha.local', 'approved', now())
ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, email = EXCLUDED.email, status = 'approved', approved_at = now();

INSERT INTO public.user_roles (user_id, role)
VALUES ('b9be37f9-76f0-41ac-a1d0-760f7ee79ecb', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;