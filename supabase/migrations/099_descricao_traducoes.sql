-- 099: traducao guardada da descricao publica da oficina ("Töökojast") - auditoria Fable 18/11
-- (Documentos/Analises/Paginas_publicas_oficinas_2026-11-18). Traduzida UMA vez ao gravar o perfil
-- (rota /api/oficina/traduzir-descricao) e lida pela pagina publica; nunca traduzida a cada visita.
-- Formato: { "origem": "et", "hash": "<sha256 curto do original>", "et": "...", "ru": "...", "en": "...", "pt": "...", "pt-PT": "...", "it": "..." }
-- Preenchimento das oficinas existentes: POST /api/tarefas/traduzir-descricoes (chave TAREFAS_CHAVE), uma chamada ao provedor por oficina.
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS descricao_traducoes jsonb;
COMMENT ON COLUMN oficinas.descricao_traducoes IS 'Traducoes automaticas da descricao por idioma do site (origem, hash do original, et/ru/en/pt/pt-PT/it). Migracao 099.';
