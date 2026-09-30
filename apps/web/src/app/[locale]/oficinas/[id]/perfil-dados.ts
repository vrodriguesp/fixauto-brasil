import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Dados do perfil publico de uma oficina, carregados NO SERVIDOR: o HTML ja
// sai com nome, endereco, servicos, avaliacoes e dados estruturados (antes a
// pagina era so "Carregando..." para buscadores e IAs, que nao executam
// JavaScript). `cache` evita buscar duas vezes (metadata + pagina).
//
// So campos publicos: o perfil do dono vem restrito a telefone - antes era
// profiles(*), que mandava ao navegador tambem o e-mail e outros dados pessoais.

export interface HorarioDia {
  aberto: boolean;
  inicio: string;
  fim: string;
}

export interface OficinaPublica {
  id: string;
  nome_fantasia: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  pais: string | null;
  latitude: number | null;
  longitude: number | null;
  especialidades: string[];
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
  tempoMedioResposta: number | null; // horas
  ajusteMedio: number | null; // % medio entre orcamento original e revisado
  hasRevisions: boolean;
  totalServicosConcluidos: number;
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
      .select('id, nome_fantasia, endereco, cidade, estado, cep, pais, latitude, longitude, especialidades, created_at, logo_url, horario_funcionamento, ativa, profile:profiles(telefone)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('avaliacoes')
      .select('id, nota, nota_anterior, comentario, created_at, cliente:profiles!avaliacoes_cliente_id_fkey(nome)')
      .eq('oficina_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('oficina_fotos').select('id, foto_url, tipo').eq('oficina_id', id).order('created_at', { ascending: false }),
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
  const bruta = oficinaRes.data as (OficinaPublica & { ativa: boolean }) | null;
  if (!bruta || bruta.ativa === false) return null;
  const { ativa: _ativa, ...oficina } = bruta;

  // Tempo medio de resposta (do pedido do cliente ate o orcamento)
  const orcamentos = (orcamentosRes.data || []) as any[];
  let totalMs = 0;
  let validos = 0;
  for (const orc of orcamentos) {
    const pedidoEm = orc.solicitacao?.created_at;
    if (pedidoEm && orc.created_at) {
      const diff = new Date(orc.created_at).getTime() - new Date(pedidoEm).getTime();
      if (diff >= 0) {
        totalMs += diff;
        validos++;
      }
    }
  }

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

  return {
    oficina,
    // Nome de quem avaliou abreviado ("Maria K."): minimizacao de dados, RGPD art. 5(1)(c)
    avaliacoes: ((avaliacoesRes.data || []) as unknown as AvaliacaoPublica[]).map((a) => ({
      ...a,
      cliente: a.cliente ? { nome: abreviarNome(a.cliente.nome) } : null,
    })),
    fotos: (fotosRes.data || []) as PerfilOficina['fotos'],
    tempoMedioResposta: validos ? totalMs / validos / 3_600_000 : null,
    ajusteMedio,
    hasRevisions: revisados.length > 0,
    totalServicosConcluidos: servicosRes.count || 0,
  };
});
