-- PREPARED ONLY. Verify actual CRM schema/triggers before applying.
-- No provider ID uniqueness constraint: identity semantics remain unconfirmed.
DO $$ BEGIN
  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'pgcrypto prerequisite missing';
  END IF;
END $$;

CREATE TABLE public.revendamais_lead_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  provider text NOT NULL DEFAULT 'revendamais' CHECK (provider = 'revendamais'),
  portal text CHECK (char_length(portal) <= 100),
  -- Provider channel metadata belongs to this receipt, not contacts/deals.
  channel_external_id text CHECK (channel_external_id ~ '^[1-9][0-9]{0,39}$'),
  channel_name text CHECK (char_length(channel_name) <= 100),
  source_created_at text CHECK (source_created_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'),
  -- Original wall-clock text: never timestamptz, never infer a timezone.
  unknown_interaction_text text CHECK (char_length(unknown_interaction_text) BETWEEN 1 AND 12000),
  unknown_interaction_authorship text CHECK (unknown_interaction_authorship = 'unknown'),
  unknown_interaction_index integer CHECK (unknown_interaction_index BETWEEN 0 AND 49),
  unknown_interaction_created_at text,
  unknown_text_expires_at timestamptz,
  unknown_text_present boolean NOT NULL DEFAULT false,
  unknown_text_disposition text NOT NULL DEFAULT 'absent'
    CHECK (unknown_text_disposition IN ('absent','omitted_policy','retained','expired')),
  external_id text CHECK (char_length(external_id) <= 200),
  identity_confirmed boolean NOT NULL,
  status text NOT NULL CHECK (status IN ('processed', 'review')),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  reason text CHECK (reason IN ('untrusted_identity','insufficient_contact','ambiguous_contact','identity_conflict','linked_records_missing')),
  -- Restricted digest detects divergent reuse of a trusted ID; never logged/exposed.
  content_digest bytea NOT NULL,
  -- Only review retains normalized fields for recovery, never the raw HTTP body.
  review_lead jsonb,
  review_expires_at timestamptz,
  CHECK ((status = 'processed' AND processed_at IS NOT NULL AND reason IS NULL AND review_lead IS NULL AND review_expires_at IS NULL)
      OR (status = 'review' AND processed_at IS NULL AND reason IS NOT NULL AND review_lead IS NOT NULL AND review_expires_at IS NOT NULL)),
  CHECK (NOT identity_confirmed OR external_id IS NOT NULL),
  CHECK ((NOT unknown_text_present AND unknown_text_disposition='absent' AND unknown_interaction_text IS NULL)
    OR (unknown_text_present AND unknown_text_disposition IN ('omitted_policy','expired') AND unknown_interaction_text IS NULL)
    OR (unknown_text_present AND unknown_text_disposition='retained' AND unknown_interaction_text IS NOT NULL)),
  CHECK ((unknown_interaction_text IS NULL AND unknown_interaction_authorship IS NULL
    AND unknown_interaction_index IS NULL AND unknown_interaction_created_at IS NULL AND unknown_text_expires_at IS NULL)
    OR (unknown_interaction_text IS NOT NULL AND unknown_interaction_authorship IS NOT NULL
    AND unknown_interaction_index IS NOT NULL AND unknown_text_expires_at IS NOT NULL))
);
CREATE INDEX revendamais_receipts_identity_idx ON public.revendamais_lead_receipts(org_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX revendamais_receipts_review_idx ON public.revendamais_lead_receipts(review_expires_at)
  WHERE status = 'review';
CREATE INDEX revendamais_receipts_unknown_expiry_idx ON public.revendamais_lead_receipts(unknown_text_expires_at)
  WHERE unknown_text_expires_at IS NOT NULL;
ALTER TABLE public.revendamais_lead_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.revendamais_lead_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.revendamais_match_phone(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH d AS (SELECT pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g') AS n
    WHERE p_phone ~ '^\+?[0-9[:space:]().-]+$')
  SELECT CASE WHEN n ~ '^0055[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$' THEN '+' || substring(n FROM 3)
    WHEN n ~ '^55[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$' THEN '+' || n
    WHEN n ~ '^[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$' THEN '+55' || n END FROM d
$$;
REVOKE ALL ON FUNCTION public.revendamais_match_phone(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.revendamais_local_date_valid(p_value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_value IS NULL THEN RETURN true; END IF;
  IF p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$' THEN RETURN false; END IF;
  RETURN pg_catalog.to_char(p_value::timestamp without time zone, 'YYYY-MM-DD HH24:MI:SS') = p_value;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.revendamais_local_date_valid(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.revendamais_commit_lead(p_lead jsonb, p_identity_confirmed boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}', p_unknown_text_retention_approved boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET lock_timeout = '3s' SET statement_timeout = '8s' AS $$
DECLARE
  v_org uuid; v_receipt uuid; v_contact uuid; v_deal uuid; v_count integer;
  v_name text; v_phone text; v_email text; v_title text; v_message text;
  v_portal text; v_external text; v_digest bytea; v_reason text;
  v_channel_id text; v_channel_name text; v_source_date text;
  v_unknown text; v_unknown_date text; v_unknown_index integer; v_meta jsonb;
  v_unknown_present boolean; v_disposition text;
  v_prior public.revendamais_lead_receipts%ROWTYPE;
  v_candidate public.contacts%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Explicit allowlist; even privileged callers cannot assign CRM IDs or roles.
  IF p_lead IS NULL OR jsonb_typeof(p_lead) <> 'object' OR p_identity_confirmed IS NULL
    OR octet_length(p_lead::text) > 65536 THEN
    RAISE EXCEPTION 'invalid_lead' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_lead) AS e(k,v)
    WHERE k NOT IN ('name','phone','email','title','firstMessage','portal','externalId')
       OR jsonb_typeof(v) NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'invalid_lead' USING ERRCODE = '22023';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' OR octet_length(p_metadata::text) > 65536
    OR p_unknown_text_retention_approved IS NULL THEN
    RAISE EXCEPTION 'invalid_metadata' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_metadata) AS e(k,v)
    WHERE k NOT IN ('channelId','channelName','createdAt','unknownInteraction','unknownTextPresent')
    OR (k NOT IN ('unknownInteraction','unknownTextPresent') AND jsonb_typeof(v) NOT IN ('string','null'))
    OR (k = 'unknownTextPresent' AND jsonb_typeof(v) NOT IN ('boolean','null'))
    OR (k = 'unknownInteraction' AND jsonb_typeof(v) NOT IN ('object','null'))) THEN
    RAISE EXCEPTION 'invalid_metadata' USING ERRCODE = '22023';
  END IF;
  v_channel_id := p_metadata->>'channelId';
  v_channel_name := p_metadata->>'channelName';
  v_source_date := p_metadata->>'createdAt';
  IF (v_channel_id IS NOT NULL AND v_channel_id !~ '^[1-9][0-9]{0,39}$')
    OR char_length(v_channel_name) > 100 OR NOT public.revendamais_local_date_valid(v_source_date) THEN
    RAISE EXCEPTION 'invalid_metadata' USING ERRCODE = '22023';
  END IF;
  v_unknown_present := coalesce((p_metadata->>'unknownTextPresent')::boolean,false)
    OR coalesce(jsonb_typeof(p_metadata->'unknownInteraction') = 'object',false);
  -- A defensive direct caller cannot force retention by passing content alone.
  -- Without approval, ignore the entire object BEFORE extracting or hashing text.
  IF jsonb_typeof(p_metadata->'unknownInteraction') = 'object' AND p_unknown_text_retention_approved THEN
    v_meta := p_metadata->'unknownInteraction';
    IF EXISTS (SELECT 1 FROM jsonb_each(v_meta) AS e(k,v) WHERE
      k NOT IN ('text','sourceIndex','createdAt','authorship')
      OR (k <> 'sourceIndex' AND jsonb_typeof(v) NOT IN ('string','null'))
      OR (k = 'sourceIndex' AND jsonb_typeof(v) <> 'number'))
      OR v_meta->>'authorship' IS DISTINCT FROM 'unknown'
      OR nullif(btrim(v_meta->>'text'),'') IS NULL OR char_length(v_meta->>'text') > 12000
      OR (v_meta->>'sourceIndex') IS NULL OR (v_meta->>'sourceIndex') !~ '^[0-9]{1,2}$'
      OR NOT public.revendamais_local_date_valid(v_meta->>'createdAt') THEN
      RAISE EXCEPTION 'invalid_metadata' USING ERRCODE = '22023';
    END IF;
    v_unknown := v_meta->>'text'; v_unknown_date := v_meta->>'createdAt';
    v_unknown_index := (v_meta->>'sourceIndex')::integer;
    IF v_unknown_index > 49 THEN RAISE EXCEPTION 'invalid_metadata' USING ERRCODE = '22023'; END IF;
  END IF;
  v_disposition := CASE WHEN v_unknown IS NOT NULL THEN 'retained'
    WHEN v_unknown_present THEN 'omitted_policy' ELSE 'absent' END;
  v_meta := jsonb_build_object('channelId',v_channel_id,'channelName',v_channel_name,'createdAt',v_source_date,
    'unknownText',v_unknown,'unknownCreatedAt',v_unknown_date,'unknownIndex',v_unknown_index,'unknownTextPresent',v_unknown_present);
  v_name := nullif(btrim(p_lead->>'name'), '');
  v_phone := nullif(btrim(p_lead->>'phone'), '');
  v_email := nullif(btrim(p_lead->>'email'), '');
  v_title := nullif(btrim(p_lead->>'title'), '');
  v_message := nullif(btrim(p_lead->>'firstMessage'), '');
  v_portal := nullif(btrim(p_lead->>'portal'), '');
  v_external := nullif(btrim(p_lead->>'externalId'), '');
  IF v_title IS NULL OR char_length(v_title) > 300 OR char_length(v_name) > 200
    OR char_length(v_message) > 10000 OR char_length(v_portal) > 100 OR char_length(v_external) > 200
    OR char_length(v_email) > 254 OR (v_email IS NOT NULL AND (v_email <> lower(v_email) OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    OR (v_phone IS NOT NULL AND v_phone !~ '^\+55[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$')
    OR (p_identity_confirmed AND v_external IS NULL) THEN
    RAISE EXCEPTION 'invalid_lead' USING ERRCODE = '22023';
  END IF;
  v_org := public.main_org_id();
  IF v_org IS NULL OR (SELECT count(*) FROM public.organizations) <> 1
     OR (SELECT lower(btrim(name)) FROM public.organizations WHERE id = v_org) IS DISTINCT FROM 'alencar motors' THEN
    RAISE EXCEPTION 'organization_unavailable' USING ERRCODE = '42501';
  END IF;
  -- Single-org serialization includes absent-ID and conflicting-ID decisions.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('revendamais:' || v_org::text, 0));
  v_digest := extensions.digest(convert_to(jsonb_build_object('name',v_name,'phone',v_phone,'email',v_email,
    'title',v_title,'firstMessage',v_message,'portal',v_portal,'externalId',v_external,'metadata',v_meta)::text,'UTF8'), 'sha256');
  IF p_identity_confirmed THEN
    SELECT * INTO v_prior FROM public.revendamais_lead_receipts
      -- Also respect reviews received before identity was confirmed: flipping a
      -- flag must not silently promote pending reviews into new CRM records.
      WHERE org_id = v_org AND external_id = v_external
      ORDER BY (content_digest = v_digest) DESC,
        (status = 'processed' AND contact_id IS NOT NULL AND deal_id IS NOT NULL) DESC,
        (status = 'review') DESC, received_at, id LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      IF v_prior.content_digest IS DISTINCT FROM v_digest THEN
        v_reason := 'identity_conflict';
      ELSIF v_prior.status = 'processed' AND v_prior.contact_id IS NOT NULL AND v_prior.deal_id IS NOT NULL THEN
        RETURN jsonb_build_object('status','duplicate','contactId',v_prior.contact_id,'dealId',v_prior.deal_id);
      ELSIF v_prior.status = 'processed' THEN
        v_reason := 'linked_records_missing';
      ELSE
        RETURN jsonb_build_object('status','review','receiptId',v_prior.id);
      END IF;
    END IF;
  ELSE
    v_reason := 'untrusted_identity';
  END IF;
  IF v_reason IS NULL THEN
    IF v_phone IS NULL AND v_email IS NULL THEN
      v_reason := 'insufficient_contact';
    ELSE
      -- Existing UI writers do not share advisory locks and channels are not UNIQUE.
      -- Retain protection of absent matches; NOWAIT fails fast rather than queuing
      -- a table-wide waiter behind an operational UI transaction. No lock on review/duplicate.
      LOCK TABLE public.contacts IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      SELECT count(*) INTO v_count FROM public.contacts c WHERE c.org_id = v_org AND
        ((v_phone IS NOT NULL AND public.revendamais_match_phone(c.phone) = v_phone)
         OR (v_email IS NOT NULL AND lower(btrim(c.email)) = v_email));
      IF v_count > 1 THEN v_reason := 'ambiguous_contact';
      ELSIF v_count = 1 THEN
        SELECT * INTO v_candidate FROM public.contacts c WHERE c.org_id = v_org AND
          ((v_phone IS NOT NULL AND public.revendamais_match_phone(c.phone) = v_phone)
           OR (v_email IS NOT NULL AND lower(btrim(c.email)) = v_email));
        IF (v_phone IS NOT NULL AND nullif(btrim(v_candidate.phone),'') IS NOT NULL AND
             public.revendamais_match_phone(v_candidate.phone) IS DISTINCT FROM v_phone)
          OR (v_email IS NOT NULL AND nullif(btrim(v_candidate.email),'') IS NOT NULL AND
             lower(btrim(v_candidate.email)) IS DISTINCT FROM v_email) THEN
          v_reason := 'ambiguous_contact';
        ELSE v_contact := v_candidate.id; END IF;
      ELSIF v_name IS NULL THEN v_reason := 'insufficient_contact';
      END IF;
    END IF;
  END IF;
  IF v_reason IS NOT NULL THEN
    INSERT INTO public.revendamais_lead_receipts(org_id, portal, external_id, identity_confirmed,
      status, reason, content_digest, review_lead, review_expires_at,
      channel_external_id,channel_name,source_created_at,unknown_interaction_text,
      unknown_interaction_authorship,unknown_interaction_index,unknown_interaction_created_at,unknown_text_expires_at,
      unknown_text_present,unknown_text_disposition)
    VALUES(v_org,v_portal,v_external,p_identity_confirmed,'review',v_reason,v_digest,
      jsonb_build_object('name',v_name,'phone',v_phone,'email',v_email,'title',v_title,'firstMessage',v_message),
      now() + interval '30 days',v_channel_id,v_channel_name,v_source_date,v_unknown,
      CASE WHEN v_unknown IS NOT NULL THEN 'unknown' END,v_unknown_index,v_unknown_date,
      CASE WHEN v_unknown IS NOT NULL THEN now() + interval '30 days' END,v_unknown_present,v_disposition) RETURNING id INTO v_receipt;
    RETURN jsonb_build_object('status','review','receiptId',v_receipt);
  END IF;
  IF v_contact IS NULL THEN
    INSERT INTO public.contacts(org_id, first_name, last_name, phone, email, status, owner_id)
      VALUES(v_org,v_name,NULL,v_phone,v_email,'lead',NULL) RETURNING id INTO v_contact;
  END IF;
  -- Fill only missing channels on a matched contact, under the same table lock.
  UPDATE public.contacts SET phone = coalesce(nullif(btrim(phone),''),v_phone),
    email = coalesce(nullif(btrim(email),''),v_email)
    WHERE id = v_contact AND org_id = v_org
      AND ((nullif(btrim(phone),'') IS NULL AND v_phone IS NOT NULL)
        OR (nullif(btrim(email),'') IS NULL AND v_email IS NOT NULL));
  INSERT INTO public.deals(org_id,title,contact_id,vehicle_id,status,currency,owner_id,stage_id)
    VALUES(v_org,v_title,v_contact,NULL,'open','BRL',NULL,NULL) RETURNING id INTO v_deal;
  IF v_message IS NOT NULL THEN
    INSERT INTO public.activities(org_id,contact_id,deal_id,type,title,body,user_id)
      VALUES(v_org,v_contact,v_deal,'note','Primeira mensagem — Revenda Mais',v_message,NULL);
  END IF;
  INSERT INTO public.revendamais_lead_receipts(org_id,portal,external_id,identity_confirmed,status,
    contact_id,deal_id,processed_at,content_digest,
    channel_external_id,channel_name,source_created_at,unknown_interaction_text,
    unknown_interaction_authorship,unknown_interaction_index,unknown_interaction_created_at,unknown_text_expires_at,
    unknown_text_present,unknown_text_disposition)
    VALUES(v_org,v_portal,v_external,p_identity_confirmed,'processed',v_contact,v_deal,now(),v_digest,
      v_channel_id,v_channel_name,v_source_date,v_unknown,
      CASE WHEN v_unknown IS NOT NULL THEN 'unknown' END,v_unknown_index,v_unknown_date,
      CASE WHEN v_unknown IS NOT NULL THEN now() + interval '30 days' END,v_unknown_present,v_disposition);
  RETURN jsonb_build_object('status','created','contactId',v_contact,'dealId',v_deal);
  -- Uncaught errors roll back ALL writes, including contact, note and receipt.
END $$;
REVOKE ALL ON FUNCTION public.revendamais_commit_lead(jsonb,boolean,jsonb,boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revendamais_commit_lead(jsonb,boolean,jsonb,boolean) TO service_role;

-- No scheduler is installed. Future operator must schedule this before activation.
CREATE FUNCTION public.revendamais_purge_expired_reviews()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE n bigint; v_cleared bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.revendamais_lead_receipts WHERE status = 'review'
    AND org_id = public.main_org_id() AND review_expires_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.revendamais_lead_receipts SET unknown_interaction_text=NULL,
    unknown_interaction_authorship=NULL,unknown_interaction_index=NULL,
    unknown_interaction_created_at=NULL,unknown_text_expires_at=NULL,unknown_text_disposition='expired'
    WHERE org_id=public.main_org_id() AND unknown_text_expires_at <= now();
  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  RETURN n + v_cleared;
END $$;
REVOKE ALL ON FUNCTION public.revendamais_purge_expired_reviews() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revendamais_purge_expired_reviews() TO service_role;
