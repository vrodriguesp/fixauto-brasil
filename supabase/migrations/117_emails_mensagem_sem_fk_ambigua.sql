-- 117: corrige a regressao da 116 (25/11). emails_mensagem_cliente tinha FK para oficinas E para profiles, e o
-- PostgREST passou a ver uma relacao muitos-para-muitos oficinas<->profiles atraves dela. Todo embed
-- "oficinas(..., profile:profiles(...))" sem dica de FK virou erro 300 / PGRST201 ("more than one relationship"):
-- lista de pedidos da oficina vazia (use-solicitacoes cai no fallback do cliente), dados da oficina, etc.
--  - tira as FKs oficina_id e profile_id (fica so a de solicitacao_id, com o CASCADE). A tabela e so a trava
--    anti-spam do e-mail (lib/email-mensagem-oficina.ts: insert/update/delete pela chave primaria); nenhum codigo
--    faz embed por ela. Linha orfa (oficina/perfil apagado) so impede um e-mail repetido por 3 h; inofensiva.
--  - com uma FK so, a tabela deixa de ser "juncao" e nenhuma relacao nova aparece.
--
-- Idempotente. Transacao unica: psql -1 -v ON_ERROR_STOP=1 -f 117_emails_mensagem_sem_fk_ambigua.sql
-- Rollback (volta o erro 300!):
--   ALTER TABLE emails_mensagem_cliente ADD CONSTRAINT emails_mensagem_cliente_oficina_id_fkey
--     FOREIGN KEY (oficina_id) REFERENCES oficinas(id) ON DELETE CASCADE;
--   ALTER TABLE emails_mensagem_cliente ADD CONSTRAINT emails_mensagem_cliente_profile_id_fkey
--     FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
--   NOTIFY pgrst, 'reload schema';
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE emails_mensagem_cliente DROP CONSTRAINT IF EXISTS emails_mensagem_cliente_oficina_id_fkey;
ALTER TABLE emails_mensagem_cliente DROP CONSTRAINT IF EXISTS emails_mensagem_cliente_profile_id_fkey;

NOTIFY pgrst, 'reload schema';
COMMIT;
