-- Must precede each non-bootstrap SQL operation in this laboratory.
DO $$ BEGIN
  IF current_database() <> 'revendamais_leads_test' OR current_user <> 'revendamais_lab'
    OR current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'Wrong laboratory database/user/version';
  END IF;
  IF (SELECT marker FROM public.revendamais_lab_identity) IS DISTINCT FROM 'alencar-revendamais-pg17-disposable-v1' THEN
    RAISE EXCEPTION 'Missing disposable laboratory marker';
  END IF;
END $$;
