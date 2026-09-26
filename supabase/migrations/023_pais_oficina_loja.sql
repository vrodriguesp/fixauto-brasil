-- Piloto multi-pais (Brasil + Estonia + resto da Europa): ate agora nao
-- havia nenhum jeito de saber em que pais uma oficina/loja esta, entao a
-- moeda mostrada em orcamentos/comissao era decidida pelo IDIOMA da
-- interface de quem estava olhando a tela (usuario em pt via BRL, resto
-- via EUR) - errado pra qualquer combinacao onde idioma != pais real (ex:
-- oficina em Portugal, que fala portugues mas usa Euro). A moeda certa e
-- a do PAIS DA OFICINA/LOJA que emitiu o preco, nao a do leitor da tela.
-- Guarda o codigo ISO 3166-1 alpha-2 (BR, EE, PT, IT...), resolvido via
-- geocodificacao (Nominatim) no momento do cadastro.
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS pais TEXT;
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS pais TEXT;

-- Backfill do que ja existe: todo cadastro anterior a esta migration foi
-- feito antes do piloto na Estonia, entao e seguro assumir Brasil.
UPDATE oficinas SET pais = 'BR' WHERE pais IS NULL;
UPDATE lojas_pecas SET pais = 'BR' WHERE pais IS NULL;
