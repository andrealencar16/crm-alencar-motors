-- Complement to homologated 0011. PREPARED ONLY; run atomically after review.
-- No change to ingestion, automatic creation, unknown-text retention or purge.
DO $$ BEGIN
  IF to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('public.main_org_id()') IS NULL
    OR to_regclass('public.revendamais_lead_receipts') IS NULL
    OR to_regclass('public.user_roles') IS NULL OR to_regclass('public.pipeline_stages') IS NULL THEN
    RAISE EXCEPTION 'review_prerequisites_missing';
  END IF;
END $$;

CREATE TABLE public.revendamais_review_approvals (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  group_key text NOT NULL,
  approved_receipt_id uuid REFERENCES public.revendamais_lead_receipts(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  approved_by uuid NOT NULL, -- Audit survives Auth account deletion.
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,group_key)
);
ALTER TABLE public.revendamais_review_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.revendamais_review_approvals FROM PUBLIC,anon,authenticated,service_role;
-- Reassert the existing raw-table boundary without adding SELECT policies.
REVOKE ALL ON TABLE public.revendamais_lead_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.revendamais_review_org()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE v_org uuid := public.main_org_id(); v_actor uuid := auth.uid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_actor IS NULL OR v_org IS NULL
    OR (SELECT count(*) FROM public.organizations) <> 1 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.organizations WHERE id=v_org AND lower(btrim(name))='alencar motors' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  -- Every CRM member can review/approve; authority comes ONLY from user_roles.
  PERFORM 1 FROM public.user_roles WHERE user_id=v_actor AND org_id=v_org
    AND role::text IN ('owner','admin','member') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.set_config('response.headers','[{"Cache-Control":"no-store"}]',true);
  RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION public.revendamais_review_org() FROM PUBLIC,anon,authenticated,service_role;

-- Single authoritative group definition. Never expose this digest-derived key.
-- Independent of parent chains, received_at, status and cleared review_lead.
CREATE FUNCTION public.revendamais_review_group_key(p public.revendamais_lead_receipts)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN (p).provider='revendamais' AND (p).retry_identity_status='consistent'
    AND (p).dealer_id IS NOT NULL AND (p).retry_lead_id IS NOT NULL
    AND (p).retry_relation<>'content_conflict' AND coalesce((p).reason,'')<>'retry_payload_conflict'
    AND jsonb_array_length((p).interaction_lead_ids)>0
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements((p).interaction_lead_ids) AS e(v)
      WHERE v IS DISTINCT FROM to_jsonb((p).retry_lead_id))
  THEN 'retry:' || encode(extensions.digest(convert_to(jsonb_build_array(
    (p).org_id,(p).provider,(p).dealer_id,(p).retry_lead_id,encode((p).content_digest,'hex'))::text,'UTF8'),'sha256'),'hex')
  ELSE 'receipt:' || (p).id::text END
$$;
REVOKE ALL ON FUNCTION public.revendamais_review_group_key(public.revendamais_lead_receipts)
  FROM PUBLIC,anon,authenticated,service_role;

-- A conflict anywhere in a consistent retry scope blocks NEW conversion.
CREATE FUNCTION public.revendamais_review_scope_conflict(p public.revendamais_lead_receipts)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (p).retry_relation='content_conflict' OR coalesce((p).reason,'')='retry_payload_conflict'
    OR ((p).retry_identity_status='consistent' AND EXISTS (
      SELECT 1 FROM public.revendamais_lead_receipts r WHERE r.org_id=(p).org_id
      AND r.provider=(p).provider AND r.dealer_id=(p).dealer_id AND r.retry_lead_id=(p).retry_lead_id
      AND r.retry_identity_status='consistent' AND (r.content_digest<>(p).content_digest OR r.retry_relation='content_conflict')))
$$;
REVOKE ALL ON FUNCTION public.revendamais_review_scope_conflict(public.revendamais_lead_receipts)
  FROM PUBLIC,anon,authenticated,service_role;

-- Only hide a group when its processed result is unequivocal and still linked.
CREATE FUNCTION public.revendamais_review_group_completed(p_org uuid,p_key text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  WITH members AS MATERIALIZED (
    SELECT r.* FROM public.revendamais_lead_receipts r WHERE r.org_id=p_org
      AND public.revendamais_review_group_key(r)=p_key
  )
  SELECT CASE WHEN EXISTS(SELECT 1 FROM public.revendamais_review_approvals a WHERE a.org_id=p_org AND a.group_key=p_key)
  THEN EXISTS(SELECT 1 FROM public.revendamais_review_approvals a
    JOIN public.contacts c ON c.id=a.contact_id AND c.org_id=p_org
    JOIN public.deals d ON d.id=a.deal_id AND d.org_id=p_org AND d.contact_id=c.id
    WHERE a.org_id=p_org AND a.group_key=p_key AND NOT EXISTS(SELECT 1 FROM members m WHERE m.status='processed'
      AND (m.contact_id IS DISTINCT FROM a.contact_id OR m.deal_id IS DISTINCT FROM a.deal_id)))
  ELSE EXISTS(SELECT 1 FROM members WHERE status='processed')
    AND (SELECT count(DISTINCT ROW(contact_id,deal_id)) FROM members WHERE status='processed')=1
    AND NOT EXISTS(SELECT 1 FROM members m
      LEFT JOIN public.contacts c ON c.id=m.contact_id AND c.org_id=p_org
      LEFT JOIN public.deals d ON d.id=m.deal_id AND d.org_id=p_org AND d.contact_id=c.id
      WHERE m.status='processed' AND (c.id IS NULL OR d.id IS NULL)) END
$$;
REVOKE ALL ON FUNCTION public.revendamais_review_group_completed(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_pending_revendamais_leads(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE v_org uuid := public.revendamais_review_org(); v_result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'invalid_pagination' USING ERRCODE='22023';
  END IF;
  WITH keyed AS MATERIALIZED (
    SELECT r.*,r AS receipt_row,public.revendamais_review_group_key(r) AS g FROM public.revendamais_lead_receipts r
    WHERE r.org_id=v_org AND r.provider='revendamais'
  ), pending_groups AS (
    SELECT k.g FROM keyed k WHERE k.status='review'
      AND NOT public.revendamais_review_group_completed(v_org,k.g)
    GROUP BY k.g
  ), items AS (
    SELECT representative.id,representative.review_lead,representative.portal,representative.channel_name,
      representative.source_created_at,representative.retry_identity_status,
      -- The CTE also contains g; only receipt_row has the table's composite type.
      public.revendamais_review_scope_conflict(representative.receipt_row) AS conflict,
      (EXISTS(SELECT 1 FROM public.revendamais_review_approvals a WHERE a.org_id=v_org AND a.group_key=pg.g)
        OR EXISTS(SELECT 1 FROM keyed k WHERE k.g=pg.g AND k.status='processed')) AS processed_conflict,
      (SELECT count(*) FROM keyed k WHERE k.g=pg.g) AS attempts,
      (SELECT min(k.received_at) FROM keyed k WHERE k.g=pg.g) AS received_at,
      EXISTS(SELECT 1 FROM keyed k WHERE k.g=pg.g AND k.review_expires_at<=now()) AS expired
    FROM pending_groups pg CROSS JOIN LATERAL (
      SELECT k.* FROM keyed k WHERE k.g=pg.g AND k.status='review' ORDER BY k.received_at,k.id LIMIT 1
    ) representative
  ), page AS (SELECT * FROM items ORDER BY received_at,id LIMIT p_limit OFFSET p_offset)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM pending_groups),'items',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'receipt_id',id,'name',review_lead->>'name','phone',review_lead->>'phone','email',review_lead->>'email',
      'title',review_lead->>'title','portal',portal,'channel_name',channel_name,
      'source_created_at',source_created_at,'received_at',received_at,'attempt_count',attempts,
      'identity_status',retry_identity_status,'approval_blocker',CASE WHEN processed_conflict THEN 'processed_group_conflict'
        WHEN conflict THEN 'retry_scope_conflict'
        WHEN expired THEN 'review_expired'
        WHEN nullif(btrim(review_lead->>'phone'),'') IS NULL AND nullif(btrim(review_lead->>'email'),'') IS NULL
          THEN 'insufficient_contact' ELSE NULL END) ORDER BY received_at,id) FROM page),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
EXCEPTION
  WHEN insufficient_privilege THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  WHEN invalid_parameter_value THEN RAISE EXCEPTION 'invalid_pagination' USING ERRCODE='22023';
  WHEN OTHERS THEN RAISE EXCEPTION 'review_query_failed' USING ERRCODE='P0001';
END $$;
REVOKE ALL ON FUNCTION public.get_pending_revendamais_leads(integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_revendamais_leads(integer,integer) TO authenticated;

CREATE FUNCTION public.approve_revendamais_lead(p_receipt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE
  v_org uuid := public.revendamais_review_org(); v_actor uuid := auth.uid();
  v_target public.revendamais_lead_receipts%ROWTYPE; v_contact_row public.contacts%ROWTYPE;
  v_approval public.revendamais_review_approvals%ROWTYPE;
  v_key text; v_ids uuid[]; v_contact uuid; v_deal uuid; v_stage uuid; v_pipeline uuid;
  v_name text; v_phone text; v_email text; v_title text; v_n integer; v_processed integer;
BEGIN
  IF p_receipt_id IS NULL THEN RAISE EXCEPTION 'invalid_receipt' USING ERRCODE='22023'; END IF;
  -- SAME mutex/order as 0011 ingestion. Covers different receipts in one group,
  -- concurrent new retries and missing-row races. No per-receipt-only mutex.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('revendamais:' || v_org::text,0));
  SELECT * INTO v_target FROM public.revendamais_lead_receipts
    WHERE id=p_receipt_id AND org_id=v_org AND provider='revendamais' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_not_found' USING ERRCODE='P0002'; END IF;
  v_key := public.revendamais_review_group_key(v_target);
  -- Recompute membership AFTER mutex and row lock; never accept a client group.
  PERFORM 1 FROM public.revendamais_lead_receipts r WHERE r.org_id=v_org
    AND public.revendamais_review_group_key(r)=v_key ORDER BY r.id FOR UPDATE;
  SELECT array_agg(r.id ORDER BY r.id),count(*) FILTER(WHERE r.status='processed') INTO v_ids,v_processed
    FROM public.revendamais_lead_receipts r WHERE r.org_id=v_org AND public.revendamais_review_group_key(r)=v_key;
  SELECT * INTO v_approval FROM public.revendamais_review_approvals WHERE org_id=v_org AND group_key=v_key FOR UPDATE;
  IF FOUND THEN
    v_contact := v_approval.contact_id; v_deal := v_approval.deal_id;
  ELSIF v_processed>0 THEN
    -- Legacy processed rows: reconcile only an unequivocal, existing result.
    SELECT count(DISTINCT ROW(r.contact_id,r.deal_id)) INTO v_n FROM public.revendamais_lead_receipts r
      WHERE r.id=ANY(v_ids) AND r.status='processed';
    IF v_n<>1 THEN RETURN jsonb_build_object('status','conflict','code','processed_group_conflict'); END IF;
    SELECT contact_id,deal_id INTO v_contact,v_deal FROM public.revendamais_lead_receipts
      WHERE id=ANY(v_ids) AND status='processed' LIMIT 1;
  END IF;
  IF v_approval.group_key IS NOT NULL OR v_processed>0 THEN
    IF v_approval.group_key IS NOT NULL AND EXISTS(SELECT 1 FROM public.revendamais_lead_receipts
      WHERE id=ANY(v_ids) AND status='processed' AND (contact_id IS DISTINCT FROM v_contact OR deal_id IS DISTINCT FROM v_deal)) THEN
      RETURN jsonb_build_object('status','conflict','code','processed_group_conflict');
    END IF;
    PERFORM 1 FROM public.contacts WHERE id=v_contact AND org_id=v_org FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict','code','processed_links_missing'); END IF;
    PERFORM 1 FROM public.deals WHERE id=v_deal AND org_id=v_org AND contact_id=v_contact FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict','code','processed_links_missing'); END IF;
    INSERT INTO public.revendamais_review_approvals(org_id,group_key,approved_receipt_id,contact_id,deal_id,approved_by)
      VALUES(v_org,v_key,p_receipt_id,v_contact,v_deal,v_actor) ON CONFLICT(org_id,group_key) DO NOTHING;
    UPDATE public.revendamais_lead_receipts SET status='processed',contact_id=v_contact,deal_id=v_deal,
      processed_at=coalesce(processed_at,now()),reason=NULL,review_lead=NULL,review_expires_at=NULL
      WHERE id=ANY(v_ids) AND org_id=v_org;
    RETURN jsonb_build_object('status','already_processed','contact_id',v_contact,'deal_id',v_deal);
  END IF;
  IF public.revendamais_review_scope_conflict(v_target) THEN
    RETURN jsonb_build_object('status','conflict','code','retry_scope_conflict');
  END IF;
  IF EXISTS(SELECT 1 FROM public.revendamais_lead_receipts WHERE id=ANY(v_ids)
    AND (status<>'review' OR review_lead IS NULL OR review_expires_at<=now())) THEN
    RETURN jsonb_build_object('status','conflict','code','review_expired');
  END IF;
  v_name := nullif(btrim(v_target.review_lead->>'name'),'');
  v_phone := public.revendamais_match_phone(v_target.review_lead->>'phone');
  v_email := nullif(lower(btrim(v_target.review_lead->>'email')),'');
  v_title := nullif(btrim(v_target.review_lead->>'title'),'');
  IF v_title IS NULL OR (v_phone IS NULL AND v_email IS NULL) THEN
    RETURN jsonb_build_object('status','conflict','code','insufficient_contact');
  END IF;
  -- UI writers do not share advisory keys or unique channel constraints.
  LOCK TABLE public.contacts IN SHARE ROW EXCLUSIVE MODE NOWAIT;
  SELECT count(*) INTO v_n FROM public.contacts c WHERE c.org_id=v_org AND
    ((v_phone IS NOT NULL AND public.revendamais_match_phone(c.phone)=v_phone)
      OR (v_email IS NOT NULL AND lower(btrim(c.email))=v_email));
  IF v_n>1 THEN RETURN jsonb_build_object('status','conflict','code','ambiguous_contact'); END IF;
  IF v_n=1 THEN
    SELECT * INTO v_contact_row FROM public.contacts c WHERE c.org_id=v_org AND
      ((v_phone IS NOT NULL AND public.revendamais_match_phone(c.phone)=v_phone)
        OR (v_email IS NOT NULL AND lower(btrim(c.email))=v_email));
    IF (v_phone IS NOT NULL AND nullif(btrim(v_contact_row.phone),'') IS NOT NULL
        AND public.revendamais_match_phone(v_contact_row.phone) IS DISTINCT FROM v_phone)
      OR (v_email IS NOT NULL AND nullif(btrim(v_contact_row.email),'') IS NOT NULL
        AND lower(btrim(v_contact_row.email)) IS DISTINCT FROM v_email) THEN
      RETURN jsonb_build_object('status','conflict','code','ambiguous_contact');
    END IF;
    v_contact := v_contact_row.id;
  ELSIF v_name IS NULL THEN RETURN jsonb_build_object('status','conflict','code','missing_name'); END IF;
  SELECT count(*) INTO v_n FROM public.pipelines WHERE org_id=v_org AND lower(btrim(name))='venda pf';
  IF v_n<>1 THEN RETURN jsonb_build_object('status','conflict','code','pipeline_not_unique'); END IF;
  SELECT id INTO v_pipeline FROM public.pipelines WHERE org_id=v_org AND lower(btrim(name))='venda pf' FOR SHARE;
  SELECT count(*) INTO v_n FROM public.pipeline_stages WHERE org_id=v_org AND pipeline_id=v_pipeline AND lower(btrim(name))='lead';
  IF v_n<>1 THEN RETURN jsonb_build_object('status','conflict','code','stage_not_unique'); END IF;
  SELECT id INTO v_stage FROM public.pipeline_stages WHERE org_id=v_org AND pipeline_id=v_pipeline AND lower(btrim(name))='lead' FOR SHARE;
  IF v_contact IS NULL THEN
    INSERT INTO public.contacts(org_id,first_name,last_name,phone,email,status,owner_id)
      VALUES(v_org,v_name,NULL,v_phone,v_email,'lead',v_actor) RETURNING id INTO v_contact;
  ELSE
    UPDATE public.contacts SET phone=coalesce(nullif(btrim(phone),''),v_phone),
      email=coalesce(nullif(btrim(email),''),v_email) WHERE id=v_contact AND org_id=v_org
      AND ((nullif(btrim(phone),'') IS NULL AND v_phone IS NOT NULL)
        OR (nullif(btrim(email),'') IS NULL AND v_email IS NOT NULL));
  END IF;
  INSERT INTO public.deals(org_id,title,contact_id,vehicle_id,status,currency,value,stage_id,owner_id)
    VALUES(v_org,v_title,v_contact,NULL,'open','BRL',0,v_stage,v_actor) RETURNING id INTO v_deal;
  -- 0011 does not carry evidence of customer authorship/retention authorization
  -- for review_lead.firstMessage. Never turn it or unknown_interaction_text into a note.
  INSERT INTO public.revendamais_review_approvals(org_id,group_key,approved_receipt_id,contact_id,deal_id,approved_by)
    VALUES(v_org,v_key,p_receipt_id,v_contact,v_deal,v_actor);
  UPDATE public.revendamais_lead_receipts SET status='processed',contact_id=v_contact,deal_id=v_deal,
    processed_at=now(),reason=NULL,review_lead=NULL,review_expires_at=NULL WHERE id=ANY(v_ids) AND org_id=v_org;
  RETURN jsonb_build_object('status','approved','contact_id',v_contact,'deal_id',v_deal);
EXCEPTION
  -- Exception handling rolls back the block BEFORE returning a sanitized error.
  WHEN insufficient_privilege THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  WHEN no_data_found THEN RAISE EXCEPTION 'receipt_not_found' USING ERRCODE='P0002';
  WHEN invalid_parameter_value THEN RAISE EXCEPTION 'invalid_receipt' USING ERRCODE='22023';
  WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN
    RAISE EXCEPTION 'review_retry_required' USING ERRCODE='40001';
  WHEN query_canceled THEN RAISE EXCEPTION 'review_timeout' USING ERRCODE='57014';
  WHEN OTHERS THEN RAISE EXCEPTION 'review_operation_failed' USING ERRCODE='P0001';
END $$;
REVOKE ALL ON FUNCTION public.approve_revendamais_lead(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.approve_revendamais_lead(uuid) TO authenticated;
