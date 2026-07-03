CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role    app_role;
  v_client  uuid;
BEGIN
  -- Hard-coded admin email
  IF new.email = 'partner@example.com' THEN
    v_role   := 'admin';
    v_client := NULL;

  -- Parent invited via signInWithOtp with metadata
  ELSIF (new.raw_user_meta_data ->> 'role') = 'parent'
        AND (new.raw_user_meta_data ->> 'client_id') IS NOT NULL THEN
    v_role   := 'parent';
    v_client := (new.raw_user_meta_data ->> 'client_id')::uuid;

  ELSE
    v_role   := 'parent';
    v_client := NULL;
  END IF;

  INSERT INTO public.profiles (id, role, client_id)
  VALUES (new.id, v_role, v_client)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;;
