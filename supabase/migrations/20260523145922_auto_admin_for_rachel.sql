CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (
    new.id,
    CASE
      WHEN new.email = 'partner@example.com' THEN 'admin'::app_role
      ELSE 'parent'::app_role
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;;
