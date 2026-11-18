import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { tempoRespostaMs } from '@/lib/tempo-resposta';
import { medianaHoras, respondeRapido, temHistorico, type DescricaoTraducoes } from '@/lib/oficina-publica';

// Dados do perfil publico de uma oficina, carregados NO SERVIDOR: o HTML ja
// sai com nome, endereco, servicos, avaliacoes e dados estruturados (antes a
// pagina era so "Carregando..." para buscadores e IAs, que nao executam
// JavaScript). `cache` evita buscar duas vezes (metadata + pagina).
//
// So campos publicos: o perfil do dono vem restrito a telefone - antes era
// profiles(*), que mandava ao navegador tambem o e-mail e outros dados pessoais.
//
// Selos (auditoria Fable 18/11, decisao do dono): tudo o que deriva de
// comportamento (hinnangud, ajuste de preco, "nova", volume) so com >= 3
// avaliacoes ou 3 servicos concluidos (lib/oficina-publica.ts). Unica
// excecao: "responde normalmente em 1 dia", com a MEDIANA do tempo entre o
// pedido (ou o cadastro da oficina, se depois) e o orcamento abaixo de 24 h.

export interface HorarioDia {
  aberto: boolean;
  inicio: string;
  fim: string;
}

export interface OficinaPublica {
  id: string;
  nome_fantasia: string;
  descricao: string | null;
  descricao_traducoes: DescricaoTraducoes | null;
  cnpj: string | null; // codigo de registro da empresa (Estonia: registrikood)
  endereco: string;
  complemento?: string | null;
  cidade: string;
  estado: string;
  cep: string;
  pais: string | null;
  latitude: number | null;
  longitude: number | null;
  especialidades: string[];
  seguradoras_convencionadas?: string[] | null;
  created_at: string;
  logo_url: string | null;
  horario_funcionamento: Partial<Record<'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom', HorarioDia>> | null;
  profile: { telefone: string | null } | null;
}

export interface AvaliacaoPublica {
  id: string;
  nota: number;
  nota_anterior: number | null;
  comentario: string | null;
  created_at: string;
  cliente: { nome: string } | null;
}

export interface PerfilOficina {
  oficina: OficinaPublica;
  avaliacoes: AvaliacaoPublica[];
  fotos: { id: string; foto_url: string; tipo: string }[];
  /** mediana do tempo de resposta em horas (null sem orcamento) - so para o selo "responde em 1 dia" */
  tempoMedianaResposta: number | null;
  /** selo "responde normalmente em 1 dia" (mediana < 24 h, >= 1 pedido orcado) */
  respondeRapido: boolean;
  /** % medio entre orcamento original e revisado (so mostrado com historico) */
  ajusteMedio: number | null;
  hasRevisions: boolean;
  totalServicosConcluidos: number;
  /** >= 3 avaliacoes ou 3 servicos concluidos: selos e bloco de avaliacoes aparecem */
  temHistorico: boolean;
  /** oficina de conta de teste: pagina com noindex */
  teste: boolean;
}

function abreviarNome(nome: string): string {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] || '';
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const carregarPerfilOficina = cache(async (id: string): Promise<PerfilOficina | null> => {
  if (!UUID.test(id)) return null;

  // So no servidor, com campos publicos escolhidos a dedo: com as regras de
  // acesso por relacao (migracao 028), a chave publica nao le mais perfis
  // nem orcamentos, que este perfil usa para telefone e estatisticas.
  const supabase = supabaseAdmin;

  const [oficinaRes, avaliacoesRes, fotosRes, orcamentosRes, servicosRes] = await Promise.all([
    supabase
      .from('oficinas')
      .select('id, nome_fantasia, descricao, descricao_traducoes, cnpj, endereco, complemento, cidade, estado, cep, pais, latitude, longitude, especialidades, seguradoras_convencionadas, created_at, logo_url, horario_funcionamento, ativa, profile:profiles(telefone, conta_teste)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('avaliacoes')
      .select('id, nota, nota_anterior, comentario, created_at, cliente:profiles!avaliacoes_cliente_id_fkey(nome)')
      .eq('oficina_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('oficina_fotos').select('id, foto_url, tipo').eq('oficina_id', id).order('created_at', { ascending: false }),
    // tempo de resposta: created_at do orcamento (a revisao reescreve a mesma linha, a data
    // e da primeira versao) menos created_at do pedido (ou o cadastro da oficina, se o pedido e anterior)
    supabase
      .from('orcamentos')
      .select('created_at, valor_total, valor_original, revisao_numero, solicitacao:solicitacoes(created_at)')
      .eq('oficina_id', id),
    // comissao_lancamento e restrito por RLS a propria oficina - para contar
    // "servicos concluidos" num perfil publico, conta orcamentos aceitos cuja
    // solicitacao ja foi concluida (ambas as tabelas sao de leitura publica).
    supabase
      .from('orcamentos')
      .select('id, solicitacao:solicitacoes!inner(status)', { count: 'exact', head: true })
      .eq('oficina_id', id)
      .eq('status', 'aceito')
      .eq('solicitacao.status', 'concluida'),
  ]);

  // Oficina inexistente ou desativada: 404 de verdade (antes era 200 com
  // "Carregando..." - um "soft 404" para os buscadores).
  const bruta = oficinaRes.data as (Omit<OficinaPublica, 'profile'> & { ativa: boolean; profile: { telefone: string | null; conta_teste?: boolean } | null }) | null;
  if (!bruta || bruta.ativa === false) return null;
  // conta de teste (05/11): o perfil abre pelo link (testes logados), mas fora do Google
  const teste = !!bruta.profile?.conta_teste;
  const { ativa: _ativa, profile, ...resto } = bruta;
  const oficina: OficinaPublica = { ...resto, descricao_traducoes: (resto.descricao_traducoes || null) as DescricaoTraducoes | null, profile: profile ? { telefone: profile.telefone } : null };

  // Mediana do tempo de resposta (do pedido do cliente, ou do cadastro da oficina
  // se ela entrou depois, ate o PRIMEIRO orcamento daquele pedido)
  const orcamentos = (orcamentosRes.data || []) as any[];
  const temposMs: number[] = [];
  for (const orc of orcamentos) {
    const pedidoEm = orc.solicitacao?.created_at;
    // (a revisao atualiza a mesma linha: created_at continua a ser o da primeira versao)
    if (!pedidoEm || !orc.created_at) continue;
    const diff = tempoRespostaMs(orc.created_at, pedidoEm, oficina.created_at);
    if (diff >= 0) temposMs.push(diff);
  }
  const tempoMedianaResposta = medianaHoras(temposMs);

  // Selo de ajuste de preco entre o orcamento original e o revisado
  const revisados = orcamentos.filter((o) => o.valor_original && o.revisao_numero > 0);
  let ajusteMedio: number | null = null;
  if (revisados.length) {
    let soma = 0;
    for (const o of revisados) {
      const orig = Number(o.valor_original);
      if (orig > 0) soma += ((Number(o.valor_total) - orig) / orig) * 100;
    }
    ajusteMedio = soma / revisados.length;
  }

  const avaliacoes = ((avaliacoesRes.data || []) as unknown as AvaliacaoPublica[]).map((a) => ({
    ...a,
    // Nome de quem avaliou abreviado ("Maria K."): minimizacao de dados, RGPD art. 5(1)(c)
    cliente: a.cliente ? { nome: abreviarNome(a.cliente.nome) } : null,
  }));
  const totalServicosConcluidos = servicosRes.count || 0;

  return {
    oficina,
    avaliacoes,
    fotos: (fotosRes.data || []) as PerfilOficina['fotos'],
    tempoMedianaResposta,
    respondeRapido: respondeRapido(tempoMedianaResposta),
    ajusteMedio,
    hasRevisions: revisados.length > 0,
    totalServicosConcluidos,
    temHistorico: temHistorico(avaliacoes.length, totalServicosConcluidos),
    teste,
  };
});
