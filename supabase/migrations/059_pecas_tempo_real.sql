-- Pedidos de pecas em tempo real (teste do dono 10/10): o pedido de uma
-- oficina vizinha so aparecia na aba "Vender excedente" depois de recarregar
-- a pagina, e as ofertas das lojas tambem. A RLS continua valendo para o
-- tempo real (cada um so recebe o que ja podia ler).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cotacoes_pecas', 'cotacoes_pecas_respostas', 'pedidos_pecas'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
