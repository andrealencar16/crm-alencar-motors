-- Controlled read interface for stock-api. Requires validated/applied 0009 and
-- the existing vehicle schema. No new table grants, RLS policies or service role.
CREATE FUNCTION public.stock_catalog_read(
  p_key_hash text, p_resource text,
  p_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1, p_limit integer DEFAULT 20, p_sort text DEFAULT 'recentes',
  p_marca text DEFAULT NULL, p_modelo text DEFAULT NULL,
  p_ano_min integer DEFAULT NULL, p_ano_max integer DEFAULT NULL,
  p_preco_min numeric DEFAULT NULL, p_preco_max numeric DEFAULT NULL,
  p_combustivel text DEFAULT NULL, p_transmissao text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE v_org uuid; v_active boolean; v_revoked timestamptz; v_scopes text[];
  v_data jsonb; v_more boolean; v_photos text[];
BEGIN
  -- VOLATILE keeps direct PostgREST invocation POST-only (hash is a credential,
  -- never a URL parameter). No persistent writes are performed by this function.
  PERFORM set_config('response.headers', '[{"Cache-Control":"no-store"}]', true);
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_credential' USING ERRCODE = 'P0401';
  END IF;
  SELECT k.org_id, k.is_active, k.revoked_at, k.scopes
    INTO v_org, v_active, v_revoked, v_scopes
    FROM public.stock_api_keys k WHERE k.key_hash = p_key_hash;
  IF NOT FOUND OR v_active IS DISTINCT FROM true OR v_revoked IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_credential' USING ERRCODE = 'P0401';
  END IF;
  IF v_scopes IS DISTINCT FROM ARRAY['stock:read']::text[]
     OR v_org IS DISTINCT FROM public.main_org_id() THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  -- All checks are repeated in SQL: direct RPC callers cannot bypass the Edge.
  IF p_resource IS NULL OR p_resource NOT IN ('list','detail','photos')
     OR p_page IS NULL OR p_page < 1 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR ((p_page::bigint - 1) * p_limit) > 10000
     OR p_sort IS NULL OR p_sort NOT IN ('preco_asc','preco_desc','ano_desc','recentes')
     OR (p_resource = 'list' AND p_id IS NOT NULL)
     OR (p_resource <> 'list' AND p_id IS NULL)
     OR (p_ano_min IS NOT NULL AND p_ano_min NOT BETWEEN 1 AND 9999)
     OR (p_ano_max IS NOT NULL AND p_ano_max NOT BETWEEN 1 AND 9999)
     OR p_ano_min > p_ano_max OR p_preco_min > p_preco_max
     OR (p_preco_min IS NOT NULL AND (p_preco_min::text IN ('NaN','Infinity','-Infinity')
         OR p_preco_min < 0 OR p_preco_min >= 1000000000000 OR p_preco_min <> round(p_preco_min,2)))
     OR (p_preco_max IS NOT NULL AND (p_preco_max::text IN ('NaN','Infinity','-Infinity')
         OR p_preco_max < 0 OR p_preco_max >= 1000000000000 OR p_preco_max <> round(p_preco_max,2)))
     OR (p_marca IS NOT NULL AND (char_length(btrim(p_marca)) NOT BETWEEN 1 AND 100 OR p_marca ~ '[[:cntrl:]]'))
     OR (p_modelo IS NOT NULL AND (char_length(btrim(p_modelo)) NOT BETWEEN 1 AND 100 OR p_modelo ~ '[[:cntrl:]]'))
     OR (p_combustivel IS NOT NULL AND p_combustivel NOT IN ('flex','gasolina','etanol','diesel','eletrico','hibrido'))
     OR (p_transmissao IS NOT NULL AND p_transmissao NOT IN ('manual','automatica','cvt','automatizada'))
     OR (p_resource <> 'list' AND (p_page <> 1 OR p_limit <> 20 OR p_sort <> 'recentes'
         OR p_marca IS NOT NULL OR p_modelo IS NOT NULL OR p_ano_min IS NOT NULL OR p_ano_max IS NOT NULL
         OR p_preco_min IS NOT NULL OR p_preco_max IS NOT NULL OR p_combustivel IS NOT NULL OR p_transmissao IS NOT NULL)) THEN
    RAISE EXCEPTION 'invalid_query' USING ERRCODE = '22023';
  END IF;

  IF p_resource = 'photos' THEN
    SELECT v.fotos INTO v_photos FROM public.vehicles v
      WHERE v.id = p_id AND v.org_id = v_org AND v.status = 'disponivel';
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
    RETURN jsonb_build_object('data', jsonb_build_object('vehicle_id',p_id,'fotos',v_photos));
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'marca', v.marca, 'modelo', v.modelo, 'versao', v.versao,
    'ano_fabricacao', v.ano_fabricacao, 'ano_modelo', v.ano_modelo, 'km', v.km,
    'cor', v.cor, 'combustivel', v.combustivel, 'transmissao', v.transmissao,
    'preco_venda', v.preco_venda, 'descricao', v.descricao, 'opcionais', v.opcionais,
    'accepts_trade', v.accepts_trade, 'accepts_financing', v.accepts_financing,
    'fotos', v.fotos, 'status', v.status, 'updated_at', v.updated_at
  ) ORDER BY
    CASE WHEN p_sort='preco_asc' THEN v.preco_venda END ASC NULLS LAST,
    CASE WHEN p_sort='preco_desc' THEN v.preco_venda END DESC NULLS LAST,
    CASE WHEN p_sort='ano_desc' THEN v.ano_modelo END DESC NULLS LAST,
    CASE WHEN p_sort='recentes' THEN v.updated_at END DESC NULLS LAST,
    v.id ASC), '[]'::jsonb) INTO v_data
  FROM (
    -- Fixed projection: forbidden commercial/document/ownership fields are never selected.
    SELECT s.id, s.marca, s.modelo, s.versao, s.ano_fabricacao, s.ano_modelo, s.km,
      s.cor, s.combustivel, s.transmissao, s.preco_venda, s.descricao, s.opcionais,
      s.accepts_trade, s.accepts_financing, s.fotos, s.status, s.updated_at
    FROM public.vehicles s
    WHERE s.org_id = v_org AND s.status = 'disponivel'
      AND (p_resource = 'list' OR s.id = p_id)
      AND (p_marca IS NULL OR lower(s.marca) = lower(btrim(p_marca)))
      AND (p_modelo IS NULL OR strpos(lower(s.modelo),lower(btrim(p_modelo))) > 0)
      AND (p_ano_min IS NULL OR s.ano_modelo >= p_ano_min)
      AND (p_ano_max IS NULL OR s.ano_modelo <= p_ano_max)
      AND (p_preco_min IS NULL OR s.preco_venda >= p_preco_min)
      AND (p_preco_max IS NULL OR s.preco_venda <= p_preco_max)
      AND (p_combustivel IS NULL OR s.combustivel::text = p_combustivel)
      AND (p_transmissao IS NULL OR s.transmissao::text = p_transmissao)
    ORDER BY
      CASE WHEN p_sort='preco_asc' THEN s.preco_venda END ASC NULLS LAST,
      CASE WHEN p_sort='preco_desc' THEN s.preco_venda END DESC NULLS LAST,
      CASE WHEN p_sort='ano_desc' THEN s.ano_modelo END DESC NULLS LAST,
      CASE WHEN p_sort='recentes' THEN s.updated_at END DESC NULLS LAST,
      s.id ASC
    LIMIT CASE WHEN p_resource='list' THEN p_limit+1 ELSE 1 END
    OFFSET CASE WHEN p_resource='list' THEN (p_page::bigint-1)*p_limit ELSE 0 END
  ) v;
  IF p_resource = 'detail' THEN
    IF jsonb_array_length(v_data)=0 THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
    RETURN jsonb_build_object('data',v_data->0);
  END IF;
  v_more := jsonb_array_length(v_data) > p_limit;
  IF v_more THEN v_data := v_data - p_limit; END IF;
  RETURN jsonb_build_object('data',v_data,'pagination',jsonb_build_object('page',p_page,'limit',p_limit,'has_more',v_more));
END; $$;
REVOKE ALL ON FUNCTION public.stock_catalog_read(text,text,uuid,integer,integer,text,text,text,integer,integer,numeric,numeric,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_catalog_read(text,text,uuid,integer,integer,text,text,text,integer,integer,numeric,numeric,text,text)
  TO anon;
