// Consultas ao banco feitas pelo SERVIDOR nunca vem do cache do Next.js. O Next 14 guarda as
// respostas de fetch (o Supabase usa fetch) e devolvia dado velho mesmo em rota "force-dynamic":
// o outro motorista registrado "sumia" do acidente porque a 1a consulta (antes do registro)
// ficava guardada (teste 09/11). Todo cliente Supabase do servidor usa este fetch.
export const fetchSemCache: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });
