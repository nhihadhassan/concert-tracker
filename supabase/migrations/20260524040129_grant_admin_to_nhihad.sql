
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
  _client_id uuid;
BEGIN
  -- Grant admin to known admin emails
  IF NEW.email IN ('partner@example.com', 'owner@example.com') THEN
    _role := 'admin';
    _client_id := NULL;
  ELSIF NEW.raw_user_meta_data->>'role' = 'parent' THEN
    _role := 'parent';
    _client_id := (NEW.raw_user_meta_data->>'client_id')::uuid;
  ELSE
    _role := 'parent';
    _client_id := NULL;
  END IF;

  INSERT INTO public.profiles (id, role, client_id)
  VALUES (NEW.id, _role, _client_id)
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role,
        client_id = EXCLUDED.client_id;

  RETURN NEW;
END;
$$;
;
