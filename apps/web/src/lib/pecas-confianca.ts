import { supabaseAdmin } from './supabase-admin';
import { enviarEmail } from './email';
import { escapeHtml, fmt } from './email-i18n';
import { linkNeutroPecas } from './site-url';
import { emTodasAsLinguas } from './notif-textos';
import { interruptorPecasV3Global } from './pecas-v3';
import { recalcularComissaoPecasConfig } from './comissao-pecas';
import { taxaEfetivaPecas } from './comissao-regras';
import { textoEmailL3, type EMAIL_L3 } from './pecas-confianca-textos';
import { enviarPushNavegador } from './push-navegador';

// Lote 3 de pecas ("confianca", 17/11; Documentos/Analises/Pecas_lote3_2026-11-17, migracao 093):
// regras comuns das rotas novas (recebi, problema, cancelar, depois do cancelamento, avaliacao,
// pendentes do P-7, lembretes). Tudo PELO DADO: pedido sem v3 = pedido de hoje (NAO_V3 nas rotas).
// Ordem das recusas (contrato sec. 2): NAO_ENCONTRADO 404 -> ACESSO_NEGADO 403 (inclui a equipe:
// so a dona decide, D-6) -> NAO_V3 409 -> estado. Quem nao e parte nunca descobre o estado.

export const PROBLEMAS = ['nao_entregou', 'peca_errada', 'avariada', 'outro'] as const;
export const MOTIVOS_FORNECEDOR = ['sem_estoque', 'prazo', 'compradora_pediu', 'outro'] as const;
export const MOTIVOS_COMPRADORA = ['comprei_outro', 'carro_saiu', 'erro_pedido', 'outro'] as const;
export const CONDICOES = ['nova', 'sobra_nova', 'usada_propria', 'recondicionada'] as const;
export const DIA_MS = 86400000;
export const JANELA_CONTATO_MS = 30 * DIA_MS;
export const P7_DIAS = 3;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SEM_CACHE = { 'Cache-Control': 'no-store' };

type Perfil = { email?: string | null; nome?: string | null; idioma?: string | null; conta_teste?: boolean | null } | null;
type Parte = { id: string; profile_id: string | null; nome_fantasia: string | null; cnpj?: string | null; pais?: string | null; profile?: Perfil };
export type PedidoL3 = {
  id: string; cotacao_id: string; resposta_id: string; oficina_id: string; fornecedor_tipo: 'loja' | 'oficina';
  loja_id: string | null; oficina_fornecedora_id: string | null; preco_total: number; status: string; created_at: string;
  v3: boolean | null; recebido_em: string | null; problema: string | null; problema_em: string | null; problema_texto: string | null;
  cancelado_por: string | null; cancelado_motivo: string | null; cancelado_texto: string | null; cancelado_em: string | null;
  entregue_em: string | null; contato_visivel_ate: string | null; lembretes_feedback: number; pos_cancelamento: string | null; nova_cotacao_id: string | null;
  cotacao: { id: string; peca_descricao: string | null; status: string; expira_em: string | null; oficina_id: string } | null;
  compradora: Parte | null; loja: Parte | null; oficina_fornecedora: Parte | null;
};

const CAMPOS_PARTE = 'id, profile_id, nome_fantasia, cnpj, pais';
export const SELECT_PEDIDO_L3 = `*,
  cotacao:cotacoes_pecas!pedidos_pecas_cotacao_id_fkey(id, peca_descricao, status, expira_em, oficina_id),
  compradora:oficinas!pedidos_pecas_oficina_id_fkey(${CAMPOS_PARTE}, profile:profiles!oficinas_profile_id_fkey(email, nome, idioma, conta_teste)),
  loja:lojas_pecas(${CAMPOS_PARTE}, profile:profiles(email, nome, idioma, conta_teste)),
  oficina_fornecedora:oficinas!pedidos_pecas_oficina_fornecedora_id_fkey(${CAMPOS_PARTE}, profile:profiles!oficinas_profile_id_fkey(email, nome, idioma, conta_teste))`;

export async function carregarPedido(id: unknown): Promise<PedidoL3 | null> {
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  const { data, error } = await supabaseAdmin.from('pedidos_pecas').select(SELECT_PEDIDO_L3).eq('id', id).maybeSingle();
  if (error) { console.error('[pecas-confianca] pedido:', error.message); return null; }
  return (data as unknown as PedidoL3) || null;
}

export const fornecedorDe = (p: PedidoL3): Parte | null => (p.fornecedor_tipo === 'loja' ? p.loja : p.oficina_fornecedora);
export const fornecedorIdDe = (p: Pick<PedidoL3, 'fornecedor_tipo' | 'loja_id' | 'oficina_fornecedora_id'>) => (p.fornecedor_tipo === 'loja' ? p.loja_id : p.oficina_fornecedora_id);
export const peca = (p: PedidoL3) => p.cotacao?.peca_descricao || '-';

/** lado de quem chama: so os DONOS (a equipe da compradora le, mas nao decide - D-6) */
export function ladoDe(p: PedidoL3, userId: string): 'compradora' | 'fornecedor' | null {
  if (p.compradora?.profile_id === userId) return 'compradora';
  if (fornecedorDe(p)?.profile_id === userId) return 'fornecedor';
  return null;
}

/** cancelamento que conta contra o fornecedor ("nao entregou", ou ele cancelou sem ser a pedido da compradora) */
export const contaContraFornecedor = (p: Pick<PedidoL3, 'status' | 'cancelado_por' | 'cancelado_motivo'>) =>
  p.status === 'cancelado' && (p.cancelado_motivo === 'nao_entregou' || (p.cancelado_por === 'fornecedor' && p.cancelado_motivo !== 'compradora_pediu'));

/** ha o que avaliar: entregue/recebido/com problema (nao cancelado) ou cancelado contra o fornecedor */
export const avaliavel = (p: Pick<PedidoL3, 'status' | 'cancelado_por' | 'cancelado_motivo' | 'entregue_em' | 'recebido_em' | 'problema'>) =>
  (p.status !== 'cancelado' && (!!p.entregue_em || !!p.recebido_em || !!p.problema)) || contaContraFornecedor(p);

/** P-20: codigo de registro normalizado (so letras e digitos, maiusculas); vazio nunca casa */
export const registroNormalizado = (s: string | null | undefined) => String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
export const mesmoRegistro = (a: string | null | undefined, b: string | null | undefined) => {
  const x = registroNormalizado(a), y = registroNormalizado(b);
  return !!x && x === y;
};
export const pedidoMesmoRegistro = (p: PedidoL3) => mesmoRegistro(p.compradora?.cnpj, fornecedorDe(p)?.cnpj);

/** contato (telefone, e-mail) no texto livre: e-mail, ou >= 7 digitos seguidos ignorando espacos, tracos, pontos e parenteses */
export function contatoNoTexto(s: string | null | undefined): boolean {
  const t = String(s || '');
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(t)) return true;
  for (const m of t.match(/\+?\d[\d\s.\-()]*\d/g) || []) if ((m.match(/\d/g) || []).length >= 7) return true;
  return false;
}

export const erro = (status: number, codigo: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error: codigo, codigo, ...extra }, { status, headers: SEM_CACHE });
export const ok = (corpo: Record<string, unknown> = {}) => Response.json({ ok: true, ...corpo }, { headers: SEM_CACHE });

/** paridade teste x real (091): conta de teste so avisa conta de teste */
export const mesmoTipoConta = (a: Perfil, b: Perfil) => !!a?.conta_teste === !!b?.conta_teste;

/** a tela/aviso novo vale para a compradora? (global OU conta de teste) */
export async function v3AtivoPara(perfil: Perfil): Promise<boolean> {
  return !!perfil?.conta_teste || (await interruptorPecasV3Global());
}

export const linkFornecedor = (tipo: 'loja' | 'oficina') => (tipo === 'loja' ? '/loja/pedidos' : '/oficina/pecas?aba=vender');
export const linkPedidoCompradora = (pedidoId: string) => `/oficina/pecas?pedido=${pedidoId}`;

/** sino com os textos nas 6 linguas (dados.textos) e a lingua da conta em titulo/mensagem */
export async function sino(profileId: string | null | undefined, idioma: string | null | undefined, tipo: string, gerar: (l: string) => { titulo: string; mensagem: string }, dados: Record<string, unknown>, push?: { link: string }) {
  if (!profileId) return;
  const n = gerar(idioma || 'pt');
  const { error } = await supabaseAdmin.from('notificacoes').insert({ profile_id: profileId, tipo, titulo: n.titulo, mensagem: n.mensagem, dados: { ...dados, textos: emTodasAsLinguas((l) => gerar(l)) } });
  if (error) console.error(`[pecas-confianca] sino ${tipo}:`, error.message);
  // 3c (D-8): aviso no navegador so nos eventos escolhidos pelo dono; fire-and-forget
  if (push) enviarPushNavegador(profileId, { titulo: n.titulo, mensagem: n.mensagem, link: push.link }).catch(() => {});
}

/** sino a todos os admins ativos (D-4: "nao entregou" avisa o admin) */
export async function sinoAdmins(tipo: string, titulo: string, mensagem: string, dados: Record<string, unknown>) {
  const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('tipo', 'admin').eq('ativo', true);
  for (const a of (admins as { id: string }[]) || []) {
    await supabaseAdmin.from('notificacoes').insert({ profile_id: a.id, tipo, titulo, mensagem, dados });
  }
}

/** e-mail do lote 3: cabecalho, saudacao, texto, botao com link neutro (/v/...) */
export async function emailL3(p: { tipo: keyof typeof EMAIL_L3; para: string | null | undefined; nome?: string | null; idioma?: string | null; vars: Record<string, string | number>; linkInterno: string; extra?: boolean; responderPara?: string }): Promise<boolean> {
  if (!p.para) return false;
  const { s, saudacao } = textoEmailL3(p.tipo, p.idioma);
  const esc = Object.fromEntries(Object.entries(p.vars).map(([k, v]) => [k, escapeHtml(String(v))]));
  const extra = (p.extra && s.extra ? `<p style="color: #374151;">${fmt(s.extra, esc)}</p>` : '')
    + (s.rodape ? `<p style="color: #374151;">${s.rodape}</p>` : '');
  const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">${s.headerTag}</p>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>${fmt(saudacao, { name: escapeHtml(p.nome || '') })}</p>
            <p>${fmt(s.intro, esc)}</p>
            ${extra}
            <p style="margin-top: 24px;">
              <a href="${linkNeutroPecas(p.idioma, p.linkInterno)}"
                 style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                ${s.cta}
              </a>
            </p>
          </div>
        </div>
      `;
  return enviarEmail({ para: p.para, assunto: fmt(s.subject, p.vars as Record<string, string>), html, ...(p.responderPara ? { responderPara: p.responderPara } : {}) }).catch(() => false);
}

/** comissao da plataforma na entrega (mesma regra do marcar-pedido-peca-entregue; 0% nao lanca; 1 vez por pedido) */
export async function lancarComissaoSeFalta(p: { id: string; fornecedor_tipo: 'loja' | 'oficina'; loja_id: string | null; oficina_fornecedora_id: string | null; preco_total: number }) {
  const fornecedorId = fornecedorIdDe(p);
  if (!fornecedorId) return;
  const { data: jaLancado } = await supabaseAdmin.from('comissao_pecas_lancamento').select('id').eq('pedido_id', p.id).maybeSingle();
  if (jaLancado) return;
  const { taxa } = await taxaEfetivaPecas(supabaseAdmin, p.fornecedor_tipo, fornecedorId);
  if (!(taxa > 0)) return;
  const { error } = await supabaseAdmin.from('comissao_pecas_lancamento').insert({
    fornecedor_tipo: p.fornecedor_tipo, fornecedor_id: fornecedorId, pedido_id: p.id, valor_pedido: p.preco_total,
    taxa_aplicada: taxa, valor_comissao: Math.round(p.preco_total * taxa * 100) / 100, status: 'pendente',
  });
  if (error) console.error('[pecas-confianca] comissao:', error.message);
  else await recalcularComissaoPecasConfig(supabaseAdmin, p.fornecedor_tipo, fornecedorId);
}

// ---------------- P-7: pendentes ----------------
export type Pendente = { id: string; cotacaoId: string; peca: string; fornecedorNome: string; estado: 'entregue' | 'recebido' | 'problema' | 'cancelado'; referencia: string; falta: 'retorno' | 'avaliacao'; bloqueia: boolean };

/** data de referencia do P-7 (entregue, recebido, problema ou cancelamento) */
export const referenciaP7 = (p: Pick<PedidoL3, 'entregue_em' | 'recebido_em' | 'problema_em' | 'cancelado_em'>) => p.entregue_em || p.recebido_em || p.problema_em || p.cancelado_em;

/**
 * Pedidos v3 da oficina que ainda pedem retorno/avaliacao (inclui os ainda dentro dos 3 dias, para o aviso
 * amarelo). Vazio quando o global esta desligado e a dona nao e de teste. `bloqueado` vem da funcao do
 * banco (a mesma da RLS do INSERT), chamada pela service role.
 */
export async function pendentesDaOficina(oficinaId: string): Promise<{ bloqueado: boolean; desde: string | null; pedidos: Pendente[] }> {
  const vazio = { bloqueado: false, desde: null, pedidos: [] as Pendente[] };
  const { data: of } = await supabaseAdmin.from('oficinas').select('id, cnpj, profile:profiles!oficinas_profile_id_fkey(conta_teste)').eq('id', oficinaId).maybeSingle();
  if (!of) return vazio;
  if (!(await v3AtivoPara((of as any).profile))) return vazio;
  const { data: peds, error } = await supabaseAdmin.from('pedidos_pecas')
    .select(`id, cotacao_id, status, fornecedor_tipo, loja_id, oficina_fornecedora_id, recebido_em, problema, problema_em, cancelado_por, cancelado_motivo, cancelado_em, entregue_em, lembretes_feedback,
      cotacao:cotacoes_pecas!pedidos_pecas_cotacao_id_fkey(peca_descricao),
      loja:lojas_pecas(nome_fantasia, cnpj),
      oficina_fornecedora:oficinas!pedidos_pecas_oficina_fornecedora_id_fkey(nome_fantasia, cnpj)`)
    .eq('oficina_id', oficinaId).eq('v3', true)
    .order('created_at', { ascending: true }).limit(200);
  if (error) { console.error('[pecas-confianca] pendentes:', error.message); return vazio; }
  const lista = ((peds as any[]) || []).filter((p) => avaliavel(p));
  if (!lista.length) return vazio;
  const { data: avs } = await supabaseAdmin.from('fornecedores_avaliacoes').select('pedido_id').in('pedido_id', lista.map((p) => p.id));
  const avaliados = new Set(((avs as any[]) || []).map((a) => a.pedido_id));
  const limite = Date.now() - P7_DIAS * DIA_MS;
  const pedidos: Pendente[] = [];
  for (const p of lista) {
    if (avaliados.has(p.id)) continue;
    const forn = p.fornecedor_tipo === 'loja' ? p.loja : p.oficina_fornecedora;
    if (mesmoRegistro((of as any).cnpj, forn?.cnpj)) continue; // P-20: nao ha avaliacao possivel
    const ref = referenciaP7(p) || p.cancelado_em || new Date().toISOString();
    const estado: Pendente['estado'] = p.status === 'cancelado' ? 'cancelado' : p.problema ? 'problema' : p.recebido_em ? 'recebido' : 'entregue';
    const falta: Pendente['falta'] = p.status !== 'cancelado' && !p.recebido_em && !p.problema ? 'retorno' : 'avaliacao';
    pedidos.push({ id: p.id, cotacaoId: p.cotacao_id, peca: p.cotacao?.peca_descricao || '-', fornecedorNome: forn?.nome_fantasia || '-', estado, referencia: ref, falta, bloqueia: Date.parse(ref) < limite && Number(p.lembretes_feedback) >= 1 });
  }
  const { data: bloq } = await supabaseAdmin.rpc('oficina_feedback_pecas_pendente', { p_oficina: oficinaId });
  const bloqueado = bloq === true;
  const refs = pedidos.filter((x) => x.bloqueia).map((x) => Date.parse(x.referencia) + P7_DIAS * DIA_MS).sort((a, b) => a - b);
  return { bloqueado, desde: bloqueado && refs.length ? new Date(refs[0]).toISOString() : null, pedidos };
}

/** oficina da pessoa (dona primeiro; senao a da equipe) */
export async function oficinaDaPessoa(userId: string): Promise<{ id: string; dona: boolean } | null> {
  const { data: dona } = await supabaseAdmin.from('oficinas').select('id').eq('profile_id', userId).limit(1);
  if (dona?.length) return { id: dona[0].id, dona: true };
  const { data: f } = await supabaseAdmin.from('funcionarios').select('oficina_id').eq('profile_id', userId).eq('ativo', true).limit(1);
  return f?.length ? { id: (f[0] as any).oficina_id, dona: false } : null;
}

/** a pessoa e funcionaria (equipe) da oficina compradora deste pedido? */
export async function equipeDaCompradora(p: PedidoL3, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('funcionarios').select('oficina_id').eq('profile_id', userId).eq('oficina_id', p.oficina_id).eq('ativo', true).limit(1);
  return !!data?.length;
}

/** a avaliacao e o fornecedor dela, se quem chama e o DONO desse fornecedor (loja ou oficina que vende) */
export async function avaliacaoDoFornecedor(id: unknown, userId: string): Promise<{ av: any } | { status: number; codigo: string }> {
  if (typeof id !== 'string' || !UUID.test(id)) return { status: 404, codigo: 'NAO_ENCONTRADO' };
  const { data: av } = await supabaseAdmin.from('fornecedores_avaliacoes').select('id, pedido_id, fornecedor_tipo, fornecedor_id, resposta').eq('id', id).maybeSingle();
  if (!av) return { status: 404, codigo: 'NAO_ENCONTRADO' };
  const { data: dono } = av.fornecedor_tipo === 'loja'
    ? await supabaseAdmin.from('lojas_pecas').select('id').eq('id', av.fornecedor_id).eq('profile_id', userId).maybeSingle()
    : await supabaseAdmin.from('oficinas').select('id').eq('id', av.fornecedor_id).eq('profile_id', userId).maybeSingle();
  if (!dono) return { status: 403, codigo: 'ACESSO_NEGADO' };
  return { av };
}
