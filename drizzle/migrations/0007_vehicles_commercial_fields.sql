ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS opcionais text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS accepts_trade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepts_financing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS commercial_notes text;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_descricao_len CHECK (descricao IS NULL OR char_length(descricao) <= 5000),
  ADD CONSTRAINT vehicles_commercial_notes_len CHECK (commercial_notes IS NULL OR char_length(commercial_notes) <= 5000),
  ADD CONSTRAINT vehicles_opcionais_max CHECK (coalesce(array_length(opcionais, 1), 0) <= 100),
  ADD CONSTRAINT vehicles_fotos_max CHECK (coalesce(array_length(fotos, 1), 0) <= 20);

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_org_placa_uniq ON public.vehicles (org_id, upper(placa)) WHERE placa IS NOT NULL AND placa <> '';
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_org_chassi_uniq ON public.vehicles (org_id, upper(chassi)) WHERE chassi IS NOT NULL AND chassi <> '';

COMMENT ON COLUMN public.vehicles.descricao IS 'Descrição comercial pública do veículo';
COMMENT ON COLUMN public.vehicles.opcionais IS 'Lista de opcionais e equipamentos';
COMMENT ON COLUMN public.vehicles.commercial_notes IS 'Observações comerciais INTERNAS - nunca expor publicamente';