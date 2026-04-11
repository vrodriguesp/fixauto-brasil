-- Add missing service types to tipo_servico enum
-- Frontend uses 'revisao' and 'pneu' which don't exist in the DB enum
ALTER TYPE tipo_servico ADD VALUE IF NOT EXISTS 'revisao';
ALTER TYPE tipo_servico ADD VALUE IF NOT EXISTS 'pneu';
ALTER TYPE tipo_servico ADD VALUE IF NOT EXISTS 'pintura';
