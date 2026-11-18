import { randomUUID } from 'node:crypto';
import { FOTOS_POR_PEDIDO, STATUS_FOTOS_EDITAVEIS } from '@fixauto/shared';
import { supabaseAdmin } from './supabase-admin';
import { ErroValidacao } from './validacao';
import { tratarImagem } from './imagem-servidor';
import { quemJaRecebeu } from './avisar-oficinas-pedido';
import { notifPedidoFotos } from './notif-i18n';
import { emTodasAsLinguas } from './notif-textos';

// mesmo formato de endereco que components/midia/MidiaPrivada.tsx (sem importar o cliente do navegador)
const MARCA = '/storage/v1/object/public/damage-photos/';
const caminhoPrivado = (url: string | null | undefined) => {
  const i = url ? url.indexOf(MARCA) : -1;
  return i >= 0 ? decodeURIComponent(url!.slice(i + MARCA.length).split('?')[0]) : null;
};

// Fotos adicionadas ao pedido DEPOIS do envio (lote A; auditoria Fable 18/11, decisoes do dono):
// - so o dono do pedido, com o pedido em aberta/em_orcamento (expirada: reabre antes; aceita: nao);
// - ate FOTOS_POR_PEDIDO no total; o lote inteiro e recusado se passar (nada gravado pela metade);
// - cada foto passa pelo servidor: assinatura de bytes + reencode JPEG sem EXIF/GPS;
// - o motorista apaga so as fotos que adicionou (origem = 'adicionada'), enquanto o pedido esta aberto;
// - as oficinas que ja orcaram ou ja foram avisadas do pedido recebem UM aviso por rajada (30 min):
//   painel + push pelo gatilho 066 (sem e-mail, sem SMS); conta de teste nao recebe push (lib/push.ts).
// - a analise de IA nao e disparada aqui: a rota analisar-dano refaz sozinha quando os ids das fotos mudam.

export const JANELA_DEDUPE_MS = 30 * 60 * 1000;
export const FOTOS_POR_HORA = 20;

export type Pedido = { id: string; numero: number | null; status: string; cliente_id: string };

export async function carregarPedidoDoDono(solicitacaoId: string, userId: string): Promise<Pedido> {
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id, numero, status, cliente_id').eq('id', solicitacaoId).maybeSingle();
  if (!sol) throw new ErroValidacao('pedido não encontrado', 'NAO_ENCONTRADO');
  if (sol.cliente_id !== userId) throw new ErroValidacao('acesso negado', 'SEM_ACESSO');
  return sol as Pedido;
}

export const statusPermiteFotos = (status: string) => (STATUS_FOTOS_EDITAVEIS as readonly string[]).includes(status);

export type FotoGravada = { id: string; solicitacao_id: string; foto_url: string; origem: string; created_at: string; bytes: number | null; largura: number | null; altura: number | null };

/** Grava as fotos (todas ou nenhuma) em solicitacoes/<id>/ e devolve as linhas novas. */
export async function adicionarFotos(sol: Pedido, arquivos: File[]): Promise<{ fotos: FotoGravada[]; total: number }> {
  if (!statusPermiteFotos(sol.status)) throw new ErroValidacao('pedido não aceita fotos neste status', 'FOTO_STATUS');
  if (!arquivos.length) throw new ErroValidacao('nenhuma foto', 'CAMPO_OBRIGATORIO');
  const { count } = await supabaseAdmin.from('solicitacao_fotos').select('id', { count: 'exact', head: true }).eq('solicitacao_id', sol.id);
  const atuais = count || 0;
  if (atuais + arquivos.length > FOTOS_POR_PEDIDO) throw new ErroValidacao(`no máximo ${FOTOS_POR_PEDIDO} fotos por pedido`, 'FOTOS_PEDIDO_MAX');

  // trata tudo antes de subir qualquer coisa: um arquivo invalido recusa o lote inteiro
  const tratadas = [];
  for (const f of arquivos) tratadas.push(await tratarImagem(Buffer.from(await f.arrayBuffer())));

  const subidas: string[] = [];
  const linhas: Omit<FotoGravada, 'id' | 'created_at'>[] = [];
  try {
    for (const img of tratadas) {
      const caminho = `solicitacoes/${sol.id}/${randomUUID()}.${img.extensao}`;
      const { error } = await supabaseAdmin.storage.from('damage-photos').upload(caminho, img.buffer, { contentType: img.tipo });
      if (error) throw new Error(error.message);
      subidas.push(caminho);
      linhas.push({
        solicitacao_id: sol.id, foto_url: supabaseAdmin.storage.from('damage-photos').getPublicUrl(caminho).data.publicUrl,
        origem: 'adicionada', bytes: img.bytes, largura: img.largura, altura: img.altura,
      });
    }
    const { data, error } = await supabaseAdmin.from('solicitacao_fotos').insert(linhas).select('id, solicitacao_id, foto_url, origem, created_at, bytes, largura, altura');
    if (error) throw new Error(error.message);
    return { fotos: (data || []) as FotoGravada[], total: atuais + linhas.length };
  } catch (e) {
    if (subidas.length) await supabaseAdmin.storage.from('damage-photos').remove(subidas).then(() => {}, () => {});
    throw e;
  }
}

/** Apaga uma foto que o motorista adicionou (nunca as da criacao, nunca de outro pedido). */
export async function apagarFotoAdicionada(sol: Pedido, fotoId: string): Promise<void> {
  if (!statusPermiteFotos(sol.status)) throw new ErroValidacao('pedido não aceita mudanças neste status', 'FOTO_STATUS');
  const { data: foto } = await supabaseAdmin.from('solicitacao_fotos').select('id, foto_url, origem').eq('id', fotoId).eq('solicitacao_id', sol.id).maybeSingle();
  if (!foto) throw new ErroValidacao('foto não encontrada', 'NAO_ENCONTRADO');
  if (foto.origem !== 'adicionada') throw new ErroValidacao('só fotos adicionadas depois do envio podem ser apagadas', 'FOTO_NAO_APAGAVEL');
  await removerFoto(foto);
}

/** Remove a linha e o objeto do storage (usado pelo motorista e pelo admin). */
export async function removerFoto(foto: { id: string; foto_url: string }): Promise<void> {
  const { error } = await supabaseAdmin.from('solicitacao_fotos').delete().eq('id', foto.id);
  if (error) throw new Error(error.message);
  const caminho = caminhoPrivado(foto.foto_url);
  if (caminho) await supabaseAdmin.storage.from('damage-photos').remove([caminho]).then(() => {}, () => {});
}

/**
 * Aviso 'pedido_fotos' as oficinas que ja orcaram ou ja receberam este pedido (mesma consulta que
 * avisar-oficinas-pedido usa para nao repetir). Quem clicou "sem interesse" nao recebe. Um aviso
 * nao lido do mesmo pedido nos ultimos 30 min e ATUALIZADO (contagem somada) em vez de inserido:
 * o gatilho 066 so dispara push no INSERT, logo uma rajada de fotos = um push.
 * Devolve quantos avisos foram inseridos e quantos atualizados.
 */
export async function avisarOficinasFotos(sol: Pedido, quantidade: number): Promise<{ inseridos: number; atualizados: number }> {
  const j = await quemJaRecebeu(sol.id);
  const perfis = new Set<string>(j.perfisAvisados);
  // oficinas que orcaram: profile do dono (orcamentos -> oficinas.profile_id)
  const oficinasOrcaram = Array.from(j.orcaram);
  if (oficinasOrcaram.length) {
    const { data: ofs } = await supabaseAdmin.from('oficinas').select('id, profile_id').in('id', oficinasOrcaram);
    for (const o of (ofs || []) as { id: string; profile_id: string }[]) perfis.add(o.profile_id);
  }
  // "sem interesse" (e sem orcamento): nao recebe as fotos
  const dispensaramSemOrcamento = Array.from(j.dispensaram).filter((id) => !j.orcaram.has(id));
  if (dispensaramSemOrcamento.length) {
    const { data: ofs } = await supabaseAdmin.from('oficinas').select('profile_id').in('id', dispensaramSemOrcamento);
    for (const o of (ofs || []) as { profile_id: string }[]) perfis.delete(o.profile_id);
  }
  if (!perfis.size) return { inseridos: 0, atualizados: 0 };

  const ids = Array.from(perfis);
  const [{ data: donos }, { data: recentes }] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, idioma').in('id', ids),
    supabaseAdmin.from('notificacoes').select('id, profile_id, dados').eq('tipo', 'pedido_fotos').eq('dados->>solicitacao_id', sol.id)
      .in('profile_id', ids).eq('lida', false).gte('created_at', new Date(Date.now() - JANELA_DEDUPE_MS).toISOString()),
  ]);
  const idiomaDe = new Map((donos || []).map((p: any) => [p.id as string, (p.idioma as string | null) ?? null]));
  const recenteDe = new Map((recentes || []).map((n: any) => [n.profile_id as string, n]));
  const numero = String(sol.numero ?? '');
  const linhas: any[] = [];
  let atualizados = 0;
  for (const pid of ids) {
    const r = recenteDe.get(pid);
    if (r) {
      const total = Number(r.dados?.quantidade || 0) + quantidade;
      const n = notifPedidoFotos(idiomaDe.get(pid), numero, total);
      const { error } = await supabaseAdmin.from('notificacoes').update({
        titulo: n.titulo, mensagem: n.mensagem,
        dados: { ...(r.dados || {}), quantidade: total, textos: emTodasAsLinguas((l) => notifPedidoFotos(l, numero, total)) },
      }).eq('id', r.id);
      if (!error) { atualizados++; continue; }
    }
    const n = notifPedidoFotos(idiomaDe.get(pid), numero, quantidade);
    linhas.push({
      profile_id: pid, tipo: 'pedido_fotos', titulo: n.titulo, mensagem: n.mensagem,
      dados: { solicitacao_id: sol.id, quantidade, textos: emTodasAsLinguas((l) => notifPedidoFotos(l, numero, quantidade)) },
    });
  }
  if (linhas.length) {
    const { error } = await supabaseAdmin.from('notificacoes').insert(linhas);
    if (error) { console.error('[fotos-pedido] aviso', error.message); return { inseridos: 0, atualizados }; }
  }
  return { inseridos: linhas.length, atualizados };
}
