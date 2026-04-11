ALTER TABLE agenda ADD COLUMN data_fim_prevista TIMESTAMPTZ;
-- Populate with current data_fim for existing events
UPDATE agenda SET data_fim_prevista = data_fim WHERE data_fim_prevista IS NULL;
