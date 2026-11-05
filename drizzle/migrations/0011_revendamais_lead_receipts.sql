-- PREPARED ONLY. Verify actual CRM schema/triggers before applying.
-- Provider root id identifies an ATTEMPT, changing on retry; never a business key.
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
  external_id text CHECK (external_id IS NULL), -- Reserved; no stable lead ID confirmed.
  delivery_attempt_id text CHECK (delivery_attempt_id ~ '^[1-9][0-9]{0,39}$'),
  source_lead_id_hint text CHECK (source_lead_id_hint ~ '^[1-9][0-9]{0,39}$'),
  dealer_id text CHECK (dealer_id ~ '^[1-9][0-9]{0,39}$'),
  interaction_lead_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(interaction_lead_ids)='array' AND jsonb_array_length(interaction_lead_ids)<=50),
  retry_lead_id text CHECK (retry_lead_id ~ '^[1-9][0-9]{0,39}$'),
  retry_identity_status text NOT NULL DEFAULT 'empty'
    CHECK (retry_identity_status IN ('consistent','empty','incomplete','ambiguous','unscoped')),
  retry_relation text NOT NULL DEFAULT 'none' CHECK (retry_relation IN ('none','automatic_resend','content_conflict')),
  possible_related_receipt_id uuid REFERENCES public.revendamais_lead_receipts(id) ON DELETE SET NULL,
  identity_confirmed boolean NOT NULL CHECK (NOT identity_confirmed),
  status text NOT NULL CHECK (status IN ('processed', 'review')),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  reason text CHECK (reason IN ('untrusted_identity','insufficient_contact','ambiguous_contact','identity_conflict','linked_records_missing','commercial_match_ambiguous','retry_identity_review','automatic_retry_review','retry_payload_conflict')),
  -- Comparison of authorized commercial data only: excludes attempt/hint IDs.
  -- Equality is a review signal, NOT proof that two deliveries are one interest.
  content_digest bytea NOT NULL,
  -- Only review retains normalized fields for recovery, never the raw HTTP body.
  review_lead jsonb,
  review_expires_at timestamptz,
  CHECK ((status = 'processed' AND processed_at IS NOT NULL AND reason IS NULL AND review_lead IS NULL AND review_expires_at IS NULL)
      OR (status = 'review' AND processed_at IS NULL AND reason IS NOT NULL AND review_lead IS NOT NULL AND review_expires_at IS NOT NULL)),
  CHECK (NOT identity_confirmed OR external_id IS NOT NULL),
  CHECK ((retry_identity_status='consistent' AND dealer_id IS NOT NULL AND retry_lead_id IS NOT NULL)
    OR (retry_identity_status<>'consistent' AND retry_lead_id IS NULL)),
  CHECK (retry_relation='none' OR retry_identity_status='consistent'),
  CHECK (possible_related_receipt_id IS NULL OR retry_relation='automatic_resend'),
  CHECK ((NOT unknown_text_present AND unknown_text_disposition='absent' AND unknown_interaction_text IS NULL)
    OR (unknown_text_present AND unknown_text_disposition IN ('omitted_policy','expired') AND unknown_interaction_text IS NULL)
    OR (unknown_text_present AND unknown_text_disposition='retained' AND unknown_interaction_text IS NOT NULL)),
  CHECK ((unknown_interaction_text IS NULL AND unknown_interaction_authorship IS NULL
    AND unknown_interaction_index IS NULL AND unknown_interaction_created_at IS NULL AND unknown_text_expires_at IS NULL)
    OR (unknown_interaction_text IS NOT NULL AND unknown_interaction_authorship IS NOT NULL
    AND unknown_interaction_index IS NOT NULL AND unknown_text_expires_at IS NOT NULL))
);
CREATE INDEX revendamais_receipts_attempt_idx ON public.revendamais_lead_receipts(org_id, delivery_attempt_id)
  WHERE delivery_attempt_id IS NOT NULL;
CREATE INDEX revendamais_receipts_comparison_idx ON public.revendamais_lead_receipts(org_id, content_digest);
CREATE INDEX revendamais_receipts_retry_scope_idx ON public.revendamais_lead_receipts(org_id,dealer_id,retry_lead_id)
  WHERE retry_identity_status='consistent';
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
  v_attempt text; v_hint text; v_related uuid;
  v_dealer text; v_ids jsonb; v_retry_id text; v_retry_status text; v_relation text := 'none';
  v_missing integer; v_distinct integer; v_prior_id uuid;
  v_candidate public.contacts%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_identity_confirmed THEN
    RAISE EXCEPTION 'unstable_delivery_identity' USING ERRCODE = '22023';
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
    WHERE k NOT IN ('channelId','channelName','createdAt','unknownInteraction','unknownTextPresent','deliveryAttemptId','sourceLeadIdHint','dealerId','interactionLeadIds')
    OR (k NOT IN ('unknownInteraction','unknownTextPresent','interactionLeadIds') AND jsonb_typeof(v) NOT IN ('string','null'))
    OR (k = 'interactionLeadIds' AND jsonb_typeof(v) NOT IN ('array','null'))
    OR (k = 'unknownTextPresent' AND jsonb_typeof(v) NOT IN ('boolean','null'))
    OR (k = 'unknownInteraction' AND jsonb_typeof(v) NOT IN ('object','null'))) THEN
    RAISE EXCEPTION 'invalid_metadata' USING ERRCODE = '22023';
  END IF;
  v_channel_id := p_metadata->>'channelId';
  v_channel_name := p_metadata->>'channelName';
  v_source_date := p_metadata->>'createdAt';
  v_attempt := p_metadata->>'deliveryAttemptId'; v_hint := p_metadata->>'sourceLeadIdHint';
  v_dealer := p_metadata->>'dealerId';
  v_ids := coalesce(nullif(p_metadata->'interactionLeadIds','null'::jsonb),'[]'::jsonb);
  IF (v_dealer IS NOT NULL AND v_dealer !~ '^[1-9][0-9]{0,39}$') OR jsonb_array_length(v_ids)>50
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_ids) AS e(v)
      WHERE jsonb_typeof(v) NOT IN ('string','null')
        OR (jsonb_typeof(v)='string' AND (v#>>'{}') !~ '^[1-9][0-9]{0,39}$')) THEN
    RAISE EXCEPTION 'invalid_metadata' USING ERRCODE='22023';
  END IF;
  SELECT count(*) FILTER (WHERE jsonb_typeof(v)='null'),
    count(DISTINCT(v#>>'{}')) FILTER (WHERE jsonb_typeof(v)='string'),
    min(v#>>'{}') FILTER (WHERE jsonb_typeof(v)='string')
    INTO v_missing,v_distinct,v_retry_id FROM jsonb_array_elements(v_ids) AS e(v);
  v_retry_status := CASE WHEN jsonb_array_length(v_ids)=0 THEN 'empty'
    WHEN v_distinct>1 THEN 'ambiguous' WHEN v_missing>0 THEN 'incomplete'
    WHEN v_dealer IS NULL THEN 'unscoped' ELSE 'consistent' END;
  IF v_retry_status<>'consistent' THEN v_retry_id := NULL; END IF;
  IF (v_channel_id IS NOT NULL AND v_channel_id !~ '^[1-9][0-9]{0,39}$')
    OR (v_attempt IS NOT NULL AND v_attempt !~ '^[1-9][0-9]{0,39}$')
    OR (v_hint IS NOT NULL AND v_hint !~ '^[1-9][0-9]{0,39}$')
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
  v_name := nullif(btrim(p_lead->>'name'), '');
  v_phone := nullif(btrim(p_lead->>'phone'), '');
  v_email := nullif(btrim(p_lead->>'email'), '');
  v_title := nullif(btrim(p_lead->>'title'), '');
  v_message := nullif(btrim(p_lead->>'firstMessage'), '');
  v_portal := nullif(btrim(p_lead->>'portal'), '');
  v_external := nullif(btrim(p_lead->>'externalId'), '');
  IF v_external IS NOT NULL THEN RAISE EXCEPTION 'no_stable_external_id' USING ERRCODE = '22023'; END IF;
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
  -- Commercial comparison excludes attempt IDs, unconfirmed lead hints, ALL
  -- timestamps and source-array positions. Equality only suggests human review.
  v_digest := extensions.digest(convert_to(jsonb_build_object('name',lower(v_name),'phone',v_phone,'email',v_email,
    'title',lower(v_title),'firstMessage',v_message,'portal',v_portal,
    'channelId',v_channel_id,'channelName',lower(v_channel_name),
    'unknownText',v_unknown,'unknownTextPresent',v_unknown_present)::text,'UTF8'), 'sha256');
  -- Confirmed retry scope: integrator (fixed), authorized dealer and unanimous
  -- interations[].lead_id. No commercial-only fallback for missing/ambiguous IDs.
  IF v_retry_status='consistent' THEN
    SELECT id INTO v_prior_id FROM public.revendamais_lead_receipts
      WHERE org_id=v_org AND dealer_id=v_dealer AND retry_lead_id=v_retry_id AND retry_identity_status='consistent'
      ORDER BY received_at,id LIMIT 1 FOR KEY SHARE;
    IF FOUND THEN
      IF EXISTS (SELECT 1 FROM public.revendamais_lead_receipts
        WHERE org_id=v_org AND dealer_id=v_dealer AND retry_lead_id=v_retry_id AND retry_identity_status='consistent'
          AND content_digest<>v_digest) THEN
        v_relation := 'content_conflict'; v_reason := 'retry_payload_conflict';
      ELSE
        v_related := v_prior_id; v_relation := 'automatic_resend'; v_reason := 'automatic_retry_review';
      END IF;
    ELSE v_reason := 'retry_identity_review'; END IF;
  ELSE v_reason := 'untrusted_identity'; END IF;
  -- No retry intervals are known. No time window or four-attempt cutoff is used.
  -- Every delivery gets its OWN durable receipt, even a byte-identical replay.
  IF v_relation<>'content_conflict' AND (v_name IS NULL OR (v_phone IS NULL AND v_email IS NULL)) THEN
    v_reason := 'insufficient_contact';
  END IF;
  -- The atomic CRM-writing block below is retained, but intentionally unreachable
  -- until a NEW, proven stable identity/review-approval contract is implemented.
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
      unknown_text_present,unknown_text_disposition,delivery_attempt_id,source_lead_id_hint,possible_related_receipt_id,
      dealer_id,interaction_lead_ids,retry_lead_id,retry_identity_status,retry_relation)
    VALUES(v_org,v_portal,v_external,p_identity_confirmed,'review',v_reason,v_digest,
      jsonb_build_object('name',v_name,'phone',v_phone,'email',v_email,'title',v_title,'firstMessage',v_message),
      now() + interval '30 days',v_channel_id,v_channel_name,v_source_date,v_unknown,
      CASE WHEN v_unknown IS NOT NULL THEN 'unknown' END,v_unknown_index,v_unknown_date,
      CASE WHEN v_unknown IS NOT NULL THEN now() + interval '30 days' END,v_unknown_present,v_disposition,
      v_attempt,v_hint,v_related,v_dealer,v_ids,v_retry_id,v_retry_status,v_relation) RETURNING id INTO v_receipt;
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
