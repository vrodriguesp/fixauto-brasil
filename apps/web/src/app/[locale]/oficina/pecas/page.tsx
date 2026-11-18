'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { exemploVeiculo } from '@/lib/exemplos';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, timeAgo, distanciaKm } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import type { CotacaoPeca, CotacaoPecaResposta } from '@fixauto/shared';
import { Link } from '@/i18n/navigation';
import DetalhesPedidoPeca from '@/components/pecas/DetalhesPedidoPeca';
import { compressImage } from '@/lib/image-compress';
import { usePecasV3, usePlacasDoFornecedor } from '@/hooks/use-pecas-v3';
import { UNIDADES_PECA, TETO_REABERTURAS, lerQuantidade, numeroDaQuantidade, normalizarPlaca, placaValida, diasParaExpirar } from '@/lib/pecas-formato';
import { totalDaOferta } from '@/lib/pecas-iva';
import { NaoTenhoCartao, CamposRespostaV3, camposOfertaV3, textoIvaOferta } from '@/components/pecas/FornecedorV3';
import { RecebiProblema, CancelarPedidoV3, CanceladoInfo, AvaliarForm, PosCancelamento, BannerP7, NotaOferta, ModalAvaliacoes, AvaliacoesDoFornecedor, ResumoProprio, lerResumo, chaveCondicao, chaveProblema, CONDICOES, type PedidoV3, type DadosP7, type PendenteP7, type ResumoFornecedor } from '@/components/pecas/ConfiancaV3';

interface CotacaoComRespostas extends CotacaoPeca {
  respostas: (CotacaoPecaResposta & {
    loja: { nome_fantasia: string } | null;
    oficina_fornecedora: { nome_fantasia: string } | null;
  })[];
  // lote 3: pedidos_pecas(*) - as colunas do ciclo novo (v3, recebido_em, cancelado_*...) vem junto
  pedidos?: PedidoV3[];
}

// A1 (16/11): conversa de um fornecedor sobre um pedido (com ou sem oferta)
interface ConversaResumo { cotacaoId: string; tipo: 'loja' | 'oficina'; fornecedorId: string; nome: string; naoLidas: number }
// A3 (16/11): contato da outra parte, so depois da confirmacao (/api/contato-pedido-peca)
interface ContatoPedido { nome: string | null; telefone: string | null; endereco: string | null }
const chaveConversa = (cotacaoId: string, tipo: string, fornecedorId: string | null | undefined) => `${cotacaoId}:${tipo}:${fornecedorId || ''}`;

interface CotacaoDeOutraOficina extends Omit<CotacaoPeca, 'oficina'> {
  oficina: { nome_fantasia: string; cidade: string; estado: string; latitude: number; longitude: number } | null;
  minhaResposta?: { id: string; preco: number; prazo_dias: number } | null;
}

// lote 1 de pecas (17/11): campos novos do formulario so com o interruptor (tipo, unidade, placa, "enviar a");
// lote 2: urgencia (padrao "sem pressa" = so o resumo de 2 h; a tela de hoje grava NULL = e-mail imediato)
const FORM_VAZIO = { peca_descricao: '', fipe_marca: '', fipe_modelo: '', fipe_ano: '', quantidade: '1', observacao: '', tipo: 'carro' as 'carro' | 'sem_carro', unidade: 'un', placa: '', ocultarPlaca: false, alvo: 'todos' as 'todos' | 'so_lojas', urgencia: 'sem_pressa' as 'hoje' | 'amanha' | 'sem_pressa' };
const URGENCIAS = [['hoje', 'hoje', 'hoje'], ['amanha', 'amanha', 'amanha'], ['sem_pressa', 'semPressa', 'sem-pressa']] as const;
const chaveUrgencia = (u: string) => (u === 'sem_pressa' ? 'semPressa' : u);

// D-5 "pedir de novo" (?repetir=<cotacao>): avisa a pagina quando o parametro muda na barra
// (voltar/avancar do navegador). Componente separado, dentro de Suspense, para o useSearchParams
// nao mudar a renderizacao da pagina.
function VigiaRepetir({ aoMudar }: { aoMudar: (repetir: string | null) => void }) {
  const repetir = useSearchParams().get('repetir');
  useEffect(() => { aoMudar(repetir); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repetir]);
  return null;
}

export default function OficinaPecasPage() {
  const t = useTranslations('oficinaPecas');
  const tp = useTranslations('pecas');
  const locale = useLocale();
  const { oficina, user, refreshProfile } = useAuth();
  // lote 1 (17/11): tela nova so com o interruptor (global ou conta de teste); null = ainda nao sabe,
  // e o formulario e os cartoes esperam (nada da tela de hoje aparece para depois trocar)
  const v3 = usePecasV3();
  const qtdTexto = (c: { quantidade: number; unidade?: string | null }) => `${numeroDaQuantidade(c.quantidade, locale)} ${tp(`unidades.${c.unidade || 'un'}`)}`;
  // aba no endereco (?aba=vender): ao voltar da conversa com uma oficina a
  // pagina reabre na mesma aba (antes voltava sempre para "Comprar")
  const [tab, setTabState] = useState<'comprar' | 'vender'>('comprar');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('aba') === 'vender') setTabState('vender'); }, []);
  const setTab = (aba: 'comprar' | 'vender') => {
    setTabState(aba);
    try { const u = new URL(window.location.href); if (aba === 'vender') u.searchParams.set('aba', 'vender'); else u.searchParams.delete('aba'); window.history.replaceState(window.history.state, '', u.toString()); } catch { /* sem URL: so a aba */ }
  };
  // editar / cancelar um pedido de peca ainda aberto
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ peca_descricao: '', quantidade: '1', observacao: '' });
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  // === Comprar ===
  const [cotacoes, setCotacoes] = useState<CotacaoComRespostas[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  // fotos da peca (ate 4), enviadas depois de criar o pedido
  const [fotosPeca, setFotosPeca] = useState<File[]>([]);
  const [conversas, setConversas] = useState<Record<string, ConversaResumo>>({});
  const [contatos, setContatos] = useState<Record<string, ContatoPedido>>({});
  const [erroConfirmar, setErroConfirmar] = useState<{ cotacaoId: string; msg: string } | null>(null);
  // INSERT recusado (oficina inativa, 091): erro na tela e o formulario fica como estava (com e sem interruptor)
  const [erroCriar, setErroCriar] = useState<string | null>(null);
  // lote 1: placa das proprias cotacoes (a compradora le a tabela pela RLS), reabrir a vencida
  const [placasMinhas, setPlacasMinhas] = useState<Record<string, string>>({});
  const [reabrindoId, setReabrindoId] = useState<string | null>(null);
  const [erroReabrir, setErroReabrir] = useState<{ cotacaoId: string; msg: string } | null>(null);
  // lote 2: "N fornecedores nao tem" por cotacao (a compradora le as dispensas pela RLS)
  const [naoTem, setNaoTem] = useState<Record<string, { n: number; motivos: Record<string, number> }>>({});
  // lote 3 (so com o interruptor): P-7 (pendentes de retorno/avaliacao), avaliacoes ja feitas, formularios
  // fechados com "Depois" nesta carga, nota dos fornecedores das ofertas, lista de avaliacoes aberta
  const [p7, setP7] = useState<DadosP7 | null>(null);
  const [avaliados, setAvaliados] = useState<Set<string>>(new Set());
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [enviadas, setEnviadas] = useState<Set<string>>(new Set());
  const [resumos, setResumos] = useState<Record<string, ResumoFornecedor | null>>({});
  const [modalForn, setModalForn] = useState<{ tipo: 'loja' | 'oficina'; id: string; nome: string } | null>(null);
  // D-5 "pedir de novo": pedido cancelado que deu origem ao formulario pre-preenchido
  const [repetirDe, setRepetirDe] = useState<string | null>(null);
  // formulario aberto pelo ?repetir= (o voltar do navegador o desfaz) e o ultimo valor visto na barra
  const formDoRepetir = useRef(false);
  const repetirNaBarra = useRef<string | null | undefined>(undefined);
  const resumosPedidos = useRef(new Set<string>());
  const focoInicial = useRef(false);

  const buscarContatos = async (pedidoIds: string[]) => {
    if (!pedidoIds.length) return;
    const r = await fetch('/api/contato-pedido-peca', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoIds }) }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (j?.contatos) setContatos((antes) => ({ ...antes, ...j.contatos }));
  };

  const fetchCotacoes = async () => {
    if (!oficina) return;
    // sem setLoading(true): o esqueleto so na 1a carga; nas recargas do tempo real a
    // tela trocava pelo esqueleto e o formulario aberto perdia o foco
    const { data } = await supabase
      .from('cotacoes_pecas')
      .select('*, respostas:cotacoes_pecas_respostas(*, loja:lojas_pecas(nome_fantasia, pais), oficina_fornecedora:oficinas!cotacoes_pecas_respostas_oficina_fornecedora_id_fkey(nome_fantasia, pais)), pedidos:pedidos_pecas(*)')
      .eq('oficina_id', oficina.id)
      .order('created_at', { ascending: false });
    const lista = ((data as any[]) || []) as CotacaoComRespostas[];
    setCotacoes(lista);
    setLoading(false);

    // A1: conversas dos fornecedores (inclusive pergunta antes de oferta), com nao lidas
    const ids = lista.map((c) => c.id);
    if (ids.length) {
      const { data: msgs } = await supabase
        .from('cotacoes_pecas_mensagens')
        .select('cotacao_id, fornecedor_tipo, fornecedor_id, remetente_id, lida')
        .in('cotacao_id', ids);
      const mapa: Record<string, ConversaResumo> = {};
      for (const m of (msgs as any[]) || []) {
        const k = chaveConversa(m.cotacao_id, m.fornecedor_tipo, m.fornecedor_id);
        mapa[k] = mapa[k] || { cotacaoId: m.cotacao_id, tipo: m.fornecedor_tipo, fornecedorId: m.fornecedor_id, nome: '', naoLidas: 0 };
        if (!m.lida && m.remetente_id !== user?.id) mapa[k].naoLidas++;
      }
      const lojaIds = Array.from(new Set(Object.values(mapa).filter((c) => c.tipo === 'loja').map((c) => c.fornecedorId)));
      const ofIds = Array.from(new Set(Object.values(mapa).filter((c) => c.tipo === 'oficina').map((c) => c.fornecedorId)));
      const [{ data: ljs }, { data: ofs }] = await Promise.all([
        lojaIds.length ? supabase.from('lojas_pecas').select('id, nome_fantasia').in('id', lojaIds) : Promise.resolve({ data: [] as any[] }),
        ofIds.length ? supabase.from('oficinas').select('id, nome_fantasia').in('id', ofIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const nomes = new Map<string, string>([...((ljs as any[]) || []), ...((ofs as any[]) || [])].map((x) => [x.id, x.nome_fantasia]));
      for (const c of Object.values(mapa)) c.nome = nomes.get(c.fornecedorId) || '';
      setConversas(mapa);
    } else setConversas({});

    // A3: contato do fornecedor escolhido
    buscarContatos(lista.flatMap((c) => (c.pedidos || []).map((p) => p.id)));
  };

  useEffect(() => { fetchCotacoes(); }, [oficina]);

  // lote 1: a placa das cotacoes com carro (tabela propria, so a compradora le)
  useEffect(() => {
    if (!v3) return;
    const ids = cotacoes.filter((c) => c.tipo !== 'sem_carro').map((c) => c.id);
    if (!ids.length) return;
    supabase.from('cotacoes_pecas_placa').select('cotacao_id, placa').in('cotacao_id', ids)
      .then(({ data }) => setPlacasMinhas(Object.fromEntries(((data as any[]) || []).map((p) => [p.cotacao_id, p.placa]))));
  }, [v3, cotacoes]);

  // lote 2: quantos fornecedores disseram "nao tenho" (e por que), por cotacao
  useEffect(() => {
    if (!v3) return;
    const ids = cotacoes.filter((c) => ['aberta', 'respondida', 'expirada'].includes(c.status)).map((c) => c.id);
    if (!ids.length) { setNaoTem({}); return; }
    supabase.from('cotacoes_pecas_dispensas').select('cotacao_id, motivo').in('cotacao_id', ids).then(({ data }) => {
      const mapa: Record<string, { n: number; motivos: Record<string, number> }> = {};
      for (const d of (data as any[]) || []) {
        const m = (mapa[d.cotacao_id] = mapa[d.cotacao_id] || { n: 0, motivos: {} });
        m.n++;
        if (d.motivo) m.motivos[d.motivo] = (m.motivos[d.motivo] || 0) + 1;
      }
      setNaoTem(mapa);
    });
  }, [v3, cotacoes]);

  // lote 3: P-7 e avaliacoes ja feitas (so com a tela nova); a rota decide pelo dado (global OU teste)
  const carregarP7 = async () => {
    const r = await fetch('/api/pedido-peca/pendentes', { cache: 'no-store' }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (j && Array.isArray(j.pedidos)) setP7(j as DadosP7);
  };
  useEffect(() => {
    if (!v3 || !oficina) return;
    const espera = setTimeout(() => {
      carregarP7();
      const ids = cotacoes.flatMap((c) => (c.pedidos || []).filter((p) => p.v3).map((p) => p.id));
      if (ids.length) supabase.from('fornecedores_avaliacoes').select('pedido_id').in('pedido_id', ids.slice(0, 200)).then(({ data }) => setAvaliados(new Set(((data as any[]) || []).map((a) => a.pedido_id))));
      // nota dos fornecedores das ofertas (1 vez por fornecedor nesta pagina)
      const fornecedores = Array.from(new Set(cotacoes.flatMap((c) => (c.respostas || []).map((r) => `${r.fornecedor_tipo}:${r.loja_id || r.oficina_fornecedora_id}`))))
        .filter((k) => !resumosPedidos.current.has(k)).slice(0, 40);
      fornecedores.forEach((k) => resumosPedidos.current.add(k));
      Promise.all(fornecedores.map(async (k) => { const [tipo, id] = k.split(':'); return [k, await lerResumo(tipo as 'loja' | 'oficina', id)] as const; }))
        .then((lista) => { if (lista.length) setResumos((antes) => ({ ...antes, ...Object.fromEntries(lista) })); });
    }, 250);
    return () => clearTimeout(espera);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v3, cotacoes, oficina]);
  const recarregarTudo = async () => { await fetchCotacoes(); if (v3) await carregarP7(); };

  // lote 3: link dos e-mails (?pedido=<id>) abre o cartao daquele pedido; "pedir de novo" (?repetir=<cotacao>)
  // abre o formulario pre-preenchido com os dados da cotacao de origem
  const preencherDe = (c: CotacaoComRespostas) => {
    setForm({ ...FORM_VAZIO, peca_descricao: c.peca_descricao || '', fipe_marca: c.fipe_marca || '', fipe_modelo: c.fipe_modelo || '', fipe_ano: c.fipe_ano ? String(c.fipe_ano) : '',
      quantidade: String(c.quantidade || 1), observacao: c.observacao || '', tipo: c.tipo === 'sem_carro' ? 'sem_carro' : 'carro', unidade: c.unidade || 'un',
      placa: placasMinhas[c.id] || '', ocultarPlaca: c.enviar_placa === false, alvo: c.alvo === 'so_lojas' ? 'so_lojas' : 'todos',
      urgencia: c.urgencia === 'hoje' || c.urgencia === 'amanha' ? c.urgencia : 'sem_pressa' });
    const cancelado = (c.pedidos || []).find((p) => p.v3 && p.status === 'cancelado' && !p.pos_cancelamento);
    setRepetirDe(cancelado?.id || null);
    formDoRepetir.current = true;
    setErroCriar(null);
    setShowForm(true);
    setTimeout(() => document.getElementById('c8551-1')?.scrollIntoView({ block: 'center' }), 50);
  };
  const irAoPedido = (pedidoId: string) => {
    setFechados((f) => { const n = new Set(f); n.delete(pedidoId); return n; });
    setTimeout(() => document.getElementById(`pedido-${pedidoId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  };
  useEffect(() => {
    if (!v3 || focoInicial.current || !cotacoes.length) return;
    focoInicial.current = true;
    const busca = new URLSearchParams(window.location.search);
    const pedidoId = busca.get('pedido');
    if (pedidoId && /^[0-9a-f-]{36}$/i.test(pedidoId)) irAoPedido(pedidoId);
    const repetir = busca.get('repetir');
    const origem = repetir ? cotacoes.find((c) => c.id === repetir) : null;
    if (origem) preencherDe(origem);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v3, cotacoes]);
  // voltar/avancar: sem ?repetir= na barra, o formulario pre-preenchido e o vinculo com o pedido
  // cancelado somem (antes, um envio depois do voltar ainda gravava a escolha D-5 no pedido)
  const repetirMudou = (repetir: string | null) => {
    const antes = repetirNaBarra.current;
    repetirNaBarra.current = repetir;
    if (antes === undefined || antes === repetir) return; // 1a leitura: o efeito de cima cuida do link
    if (!repetir) {
      if (!formDoRepetir.current) return;
      formDoRepetir.current = false;
      setRepetirDe(null);
      setForm(FORM_VAZIO);
      setFotosPeca([]);
      setErroCriar(null);
      setShowForm(false);
      return;
    }
    const origem = cotacoes.find((c) => c.id === repetir);
    if (v3 && origem) preencherDe(origem);
  };
  const pedirDeNovo = (c: CotacaoComRespostas) => {
    // estado sem os campos internos do Next (__NA): so assim o roteador registra a URL nova e o useSearchParams
    // (VigiaRepetir) a enxerga - com __NA o Next trata a chamada como dele e ignora (app-router.js)
    try { const u = new URL(window.location.href); u.searchParams.set('repetir', c.id); window.history.pushState({}, '', u.toString()); } catch { /* so o formulario */ }
    setTab('comprar');
    preencherDe(c);
  };

  // lote 2: "pedir peca" a partir do pedido do motorista (?solicitacao=<id>): carro e placa do pedido,
  // lidos com a RLS da oficina (so abre preenchido se ela ve o pedido); nada e gravado na cotacao
  useEffect(() => {
    if (!v3 || !oficina) return;
    const solicitacaoId = new URLSearchParams(window.location.search).get('solicitacao');
    if (!solicitacaoId || !/^[0-9a-f-]{36}$/i.test(solicitacaoId)) return;
    supabase.from('solicitacoes').select('id, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano, placa)').eq('id', solicitacaoId).maybeSingle().then(({ data }) => {
      const v = (data as any)?.veiculo;
      if (!v) return;
      setForm((f) => ({ ...f, tipo: 'carro', fipe_marca: v.fipe_marca || '', fipe_modelo: v.fipe_modelo || '', fipe_ano: v.fipe_ano ? String(v.fipe_ano) : '', placa: v.placa ? normalizarPlaca(v.placa) : '' }));
      setShowForm(true);
    });
  }, [v3, oficina]);

  const handleCriar = async () => {
    if (!oficina || !form.peca_descricao) return;
    setErroCriar(null);
    // com o interruptor: tipo, unidade, "enviar a" e placa; desligado = o INSERT de hoje
    const comCarro = !v3 || form.tipo === 'carro';
    const placa = v3 && comCarro ? normalizarPlaca(form.placa) : '';
    if (placa && !placaValida(placa)) { setErroCriar(tp('placaInvalida')); return; }
    setSaving(true);
    const { data: nova } = await supabase.from('cotacoes_pecas').insert({
      oficina_id: oficina.id,
      peca_descricao: form.peca_descricao,
      fipe_marca: comCarro ? form.fipe_marca || null : null,
      fipe_modelo: comCarro ? form.fipe_modelo || null : null,
      fipe_ano: comCarro ? form.fipe_ano || null : null,
      quantidade: v3 ? lerQuantidade(form.quantidade) : parseInt(form.quantidade) || 1,
      observacao: form.observacao.trim() || null,
      ...(v3 ? { tipo: form.tipo, unidade: form.unidade, alvo: form.alvo, enviar_placa: !form.ocultarPlaca, urgencia: form.urgencia } : {}),
    }).select().single();

    // recusado pelo banco (ex.: oficina inativa): antes limpava o formulario em silencio
    if (!nova) {
      setErroCriar(tp('erroCriar'));
      setSaving(false);
      // lote 3: recusa do P-7 (42501) reabre o aviso com os pedidos a avaliar
      if (v3) carregarP7();
      return;
    }

    // lote 3 (D-5): "pedir de novo" - o pedido cancelado guarda a escolha e a cotacao nova (so a rota grava)
    if (v3 && repetirDe) {
      // so a dona grava a escolha (D-6) e so com a avaliacao do cancelado feita (Fable 4.6: antes o
      // ?repetir= digitado na barra mandava e a rota recusava em silencio com AVALIACAO_PENDENTE)
      const pendente = !!p7?.pedidos.some((x) => x.id === repetirDe) && !enviadas.has(repetirDe);
      if (oficina.profile_id === user?.id && !pendente) {
        const r = await fetch('/api/pedido-peca/depois-do-cancelamento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoId: repetirDe, escolha: 'nova_cotacao', novaCotacaoId: nova.id }) }).catch(() => null);
        if (r && !r.ok) console.warn('[pecas] escolha do pedido cancelado nao gravada', r.status);
      }
      setRepetirDe(null);
    }
    // lote 3.2: o ?repetir= sai da barra em TODO envio (antes so quando havia pedido cancelado a vincular; sem
    // ele - escolha ja feita, cotacao sem cancelado - ficava na barra e um F5 reabria o formulario preenchido)
    formDoRepetir.current = false;
    try { const u = new URL(window.location.href); if (u.searchParams.has('repetir')) { u.searchParams.delete('repetir'); window.history.replaceState({}, '', u.toString()); } } catch { /* segue */ }

    // placa: so na tabela da compradora (nunca em cotacoes_pecas, que vai no tempo real a todos os parceiros)
    if (placa) await supabase.from('cotacoes_pecas_placa').insert({ cotacao_id: nova.id, placa });

    // fotos: pasta publica da propria oficina (a regra de envio ja permite)
    if (nova && fotosPeca.length) {
      const urls: string[] = [];
      for (const original of fotosPeca.slice(0, 4)) {
        const foto = await compressImage(original);
        const caminho = `oficinas/${oficina.id}/pecas/${nova.id}/${crypto.randomUUID()}.jpg`;
        const { error: eUp } = await supabase.storage.from('publico').upload(caminho, foto, { contentType: foto.type || 'image/jpeg' });
        if (!eUp) urls.push(supabase.storage.from('publico').getPublicUrl(caminho).data.publicUrl);
      }
      if (urls.length) await supabase.from('cotacoes_pecas').update({ fotos: urls }).eq('id', nova.id);
    }

    // Avisa (sino + e-mail) as lojas de pecas do pais e as oficinas vizinhas que
    // vendem sobra (B3, 16/11: antes so as oficinas, e so com coordenadas)
    if (nova) {
      fetch('/api/notificar-fornecedores-cotacao-peca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotacaoId: nova.id }),
      }).catch(() => {});
    }

    formDoRepetir.current = false;
    setForm(FORM_VAZIO);
    setFotosPeca([]);
    setShowForm(false);
    setSaving(false);
    await fetchCotacoes();
  };

  const handleConfirmarPedido = async (
    cotacao: CotacaoComRespostas,
    resposta: CotacaoComRespostas['respostas'][number]
  ) => {
    if (!oficina) return;
    const nomeFornecedor = resposta.loja?.nome_fantasia || resposta.oficina_fornecedora?.nome_fantasia || t('fornecedorFallback');
    if (!confirm(t('confirmarPedido', { peca: cotacao.peca_descricao, preco: formatCurrency(resposta.preco, currencyForCountry(resposta.loja?.pais || resposta.oficina_fornecedora?.pais), locale), fornecedor: nomeFornecedor }))) return;
    setConfirmandoId(resposta.id);
    setErroConfirmar(null);

    // B2 (16/11): a rota de servidor grava o pedido (valor total), fecha a cotacao e
    // avisa quem ganhou (loja OU oficina - para a oficina o aviso dava 403) e quem perdeu
    const r = await fetch('/api/confirmar-pedido-peca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respostaId: resposta.id }),
    }).catch(() => null);
    if (!r?.ok) {
      const j = r ? await r.json().catch(() => null) : null;
      setErroConfirmar({ cotacaoId: cotacao.id, msg: j?.codigo === 'JA_FECHADA' ? t('pedidoJaFechado') : j?.codigo === 'FEEDBACK_PENDENTE' ? tp('p7.confirmarBloqueado') : t('erroConfirmarPedido') });
      // lote 3: P-7 que escapou da tela (outra aba) reabre o aviso
      if (j?.codigo === 'FEEDBACK_PENDENTE') carregarP7();
    }

    setConfirmandoId(null);
    await fetchCotacoes();
  };

  // lote 1: cotacao vencida (7 dias) volta por mais 7 dias, ate 3 vezes, sem novo aviso as lojas
  const handleReabrir = async (cotacao: CotacaoComRespostas) => {
    setReabrindoId(cotacao.id);
    setErroReabrir(null);
    const r = await fetch('/api/cotacao-peca/reabrir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cotacaoId: cotacao.id }),
    }).catch(() => null);
    if (!r?.ok) {
      const j = r ? await r.json().catch(() => null) : null;
      setErroReabrir({ cotacaoId: cotacao.id, msg: j?.codigo === 'TETO_REABERTURAS' ? tp('reabrirTeto', { n: TETO_REABERTURAS }) : tp('erroReabrir') });
    }
    setReabrindoId(null);
    await fetchCotacoes();
  };

  // === Vender (oficina como fornecedora de excedente) ===
  const [vendePecas, setVendePecas] = useState(false);
  const [savingVende, setSavingVende] = useState(false);
  const [cotacoesVizinhas, setCotacoesVizinhas] = useState<CotacaoDeOutraOficina[]>([]);
  const [loadingVender, setLoadingVender] = useState(false);
  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [respostaForm, setRespostaForm] = useState({ preco: '', prazo_dias: '2', observacao: '' });
  const [savingResposta, setSavingResposta] = useState(false);
  const [pedidosFornecedora, setPedidosFornecedora] = useState<any[]>([]);
  const [marcandoEntregueId, setMarcandoEntregueId] = useState<string | null>(null);
  // oferta recusada pelo banco: erro no formulario, que continua aberto (com e sem interruptor)
  const [erroResposta, setErroResposta] = useState<string | null>(null);
  // lote 2: quantidade ofertada e "peca usada" (regime de margem) no formulario de resposta
  const [respQtd, setRespQtd] = useState('');
  const [respUsada, setRespUsada] = useState(false);
  // lote 3 (3b, P-23): condicao da peca ofertada ('' = nao informada, oferta de hoje)
  const [respCondicao, setRespCondicao] = useState('');
  const [resumoProprio, setResumoProprio] = useState<ResumoFornecedor | null>(null);
  // lote 1: placa das cotacoes das vizinhas, so pela rota do servidor (regra ao vivo)
  const placasVizinhas = usePlacasDoFornecedor(cotacoesVizinhas, v3);

  const fetchPedidosFornecedora = async () => {
    if (!oficina) return;
    const { data } = await supabase
      .from('pedidos_pecas')
      .select('*, cotacao:cotacoes_pecas!pedidos_pecas_cotacao_id_fkey(peca_descricao), oficina:oficinas!pedidos_pecas_oficina_id_fkey(nome_fantasia, cidade, estado)')
      .eq('fornecedor_tipo', 'oficina')
      .eq('oficina_fornecedora_id', oficina.id)
      .order('created_at', { ascending: false });
    setPedidosFornecedora((data as any[]) || []);
    // contato da oficina compradora (telefone e endereco), so dos pedidos ja confirmados
    buscarContatos(((data as any[]) || []).map((p) => p.id));
  };

  const handleMarcarEntregueFornecedor = async (pedidoId: string) => {
    setMarcandoEntregueId(pedidoId);
    await fetch('/api/marcar-pedido-peca-entregue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId }),
    });
    setMarcandoEntregueId(null);
    await fetchPedidosFornecedora();
  };

  useEffect(() => {
    if (oficina) setVendePecas(!!oficina.vende_pecas);
  }, [oficina]);

  const fetchCotacoesVizinhas = async () => {
    if (!oficina || !oficina.latitude || !oficina.longitude) return;
    setLoadingVender(true);
    const [{ data: abertas }, { data: minhasRespostas }, { data: minhasDispensas }] = await Promise.all([
      supabase
        .from('cotacoes_pecas')
        .select('*, oficina:oficinas!cotacoes_pecas_oficina_id_fkey(nome_fantasia, cidade, estado, latitude, longitude, pais)')
        // recebe ofertas ate a oficina escolher uma (fechada): antes so 'aberta', e a
        // 1a resposta (que muda para 'respondida') escondia o pedido das outras lojas
        .in('status', ['aberta', 'respondida'])
        .neq('oficina_id', oficina.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('cotacoes_pecas_respostas')
        .select('id, cotacao_id, preco, prazo_dias')
        .eq('fornecedor_tipo', 'oficina')
        .eq('oficina_fornecedora_id', oficina.id),
      // lote 2: as que esta oficina disse "nao tenho" saem da lista (so existem com o interruptor)
      supabase
        .from('cotacoes_pecas_dispensas')
        .select('cotacao_id')
        .eq('fornecedor_tipo', 'oficina')
        .eq('fornecedor_id', oficina.id),
    ]);

    const respostaPorCotacao = new Map((minhasRespostas || []).map((r) => [r.cotacao_id, r]));
    const dispensadas = new Set(((minhasDispensas as any[]) || []).map((d) => d.cotacao_id));
    const raio = oficina.raio_atendimento_km || 30;
    // lote 3 (3b, N-6): alcance 'pais' = o pais inteiro, sem distancia; NULL/'raio' = raio de hoje
    const doPais = oficina.pecas_alcance === 'pais';
    const proximas = ((abertas as any[]) || [])
      .filter((c) => {
        const o = c.oficina;
        if (dispensadas.has(c.id)) return false;
        if (doPais) return !!o && (!o.pais || !oficina.pais || o.pais === oficina.pais);
        if (!o?.latitude || !o?.longitude) return false;
        return distanciaKm(oficina.latitude, oficina.longitude, o.latitude, o.longitude) <= raio;
      })
      .map((c) => ({ ...c, minhaResposta: respostaPorCotacao.get(c.id) || null }));
    setCotacoesVizinhas(proximas);
    setLoadingVender(false);
  };

  useEffect(() => {
    // M15 (16/11): os pedidos ja ganhos como fornecedora aparecem mesmo com o
    // interruptor desligado (desligar so para de receber pedidos novos)
    if (tab === 'vender') fetchPedidosFornecedora();
    if (tab === 'vender' && vendePecas) fetchCotacoesVizinhas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, vendePecas, oficina]);

  // tempo real (migracao 059): pedido de oficina vizinha, oferta de loja e
  // pedido confirmado aparecem sem recarregar a pagina
  useEffect(() => {
    if (!oficina) return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const recarregar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => {
        fetchCotacoes();
        if (tab === 'vender') fetchPedidosFornecedora();
        if (tab === 'vender' && vendePecas) fetchCotacoesVizinhas();
      }, 500);
    };
    const canal = supabase.channel(`pecas-${oficina.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotacoes_pecas' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotacoes_pecas_respostas' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_pecas' }, recarregar)
      // A1: pergunta nova de um fornecedor aparece no cartao do pedido
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cotacoes_pecas_mensagens' }, recarregar)
      .subscribe();
    return () => { if (espera) clearTimeout(espera); supabase.removeChannel(canal); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oficina, tab, vendePecas]);

  const salvarEdicao = async (id: string) => {
    if (!editForm.peca_descricao.trim()) return;
    setSalvandoEdicao(true);
    await supabase.from('cotacoes_pecas').update({
      peca_descricao: editForm.peca_descricao.trim(),
      // com o interruptor a quantidade tem casas decimais (4,5 l); sem ele, inteira como hoje
      quantidade: v3 ? lerQuantidade(editForm.quantidade) : Math.max(1, parseInt(editForm.quantidade) || 1),
      observacao: editForm.observacao.trim() || null,
    }).eq('id', id).in('status', ['aberta', 'respondida']);
    setSalvandoEdicao(false);
    setEditandoId(null);
    await fetchCotacoes();
  };
  const cancelarPedido = async (id: string) => {
    setSalvandoEdicao(true);
    await supabase.from('cotacoes_pecas').update({ status: 'cancelada' }).eq('id', id).in('status', ['aberta', 'respondida']);
    setSalvandoEdicao(false);
    setCancelandoId(null);
    await fetchCotacoes();
  };

  const handleToggleVendePecas = async () => {
    if (!oficina) return;
    setSavingVende(true);
    const novoValor = !vendePecas;
    await supabase.from('oficinas').update({ vende_pecas: novoValor }).eq('id', oficina.id);
    setVendePecas(novoValor);
    await refreshProfile();
    setSavingVende(false);
  };

  const handleResponderComoOficina = async (cotacaoId: string) => {
    if (!oficina || !respostaForm.preco) return;
    setSavingResposta(true);
    setErroResposta(null);
    const cot = cotacoesVizinhas.find((c) => c.id === cotacaoId);
    const { error } = await supabase.from('cotacoes_pecas_respostas').insert({
      cotacao_id: cotacaoId,
      fornecedor_tipo: 'oficina',
      oficina_fornecedora_id: oficina.id,
      preco: parseFloat(respostaForm.preco),
      prazo_dias: parseInt(respostaForm.prazo_dias) || 1,
      observacao: respostaForm.observacao || null,
      // lote 2: quantidade ofertada (NULL = a pedida) e retrato do IVA do perfil da oficina
      ...(v3 && cot ? camposOfertaV3(respQtd, Number(cot.quantidade), oficina, respUsada) : {}),
      // lote 3 (3b): condicao da peca so com o interruptor e so quando escolhida
      ...(v3 && respCondicao ? { condicao: respCondicao } : {}),
    });

    // recusada pelo banco (preco 0, prazo fora da faixa...): antes o formulario fechava em silencio
    if (error) {
      setErroResposta(cotacaoId);
      setSavingResposta(false);
      return;
    }

    if (!error) {
      // Marca a cotacao como respondida e notifica a oficina compradora
      // (in-app + email), centralizado na rota server-side.
      await fetch('/api/marcar-cotacao-respondida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotacaoId }),
      }).catch(() => {});
    }

    setRespondendoId(null);
    setRespostaForm({ preco: '', prazo_dias: '2', observacao: '' });
    setSavingResposta(false);
    await fetchCotacoesVizinhas();
  };

  // lote 2: "nao tenho" pela aba Vender (INSERT direto pela RLS; so o dono da oficina que vende)
  const naoTenhoComoOficina = async (cotacaoId: string, motivo: string | null) => {
    if (!oficina || !user) return false;
    const { error } = await supabase.from('cotacoes_pecas_dispensas').insert({ cotacao_id: cotacaoId, fornecedor_tipo: 'oficina', fornecedor_id: oficina.id, profile_id: user.id, motivo, origem: 'painel' });
    if (error) return false;
    await fetchCotacoesVizinhas();
    return true;
  };
  const abrirRespostaComoOficina = (c: CotacaoDeOutraOficina) => {
    setRespondendoId(c.id);
    setErroResposta(null);
    setRespQtd(String(Number(c.quantidade) || 1));
    setRespUsada(false);
    setRespCondicao('');
  };

  // lote 3: "Sua nota como fornecedora" na aba Vender (so com o interruptor)
  useEffect(() => {
    if (!v3 || !oficina || tab !== 'vender') return;
    lerResumo('oficina', oficina.id).then(setResumoProprio);
  }, [v3, oficina, tab]);

  if (loading || !oficina) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('titulo')}</h1>
        <p className="text-gray-600 mt-1">{t('subtitulo')}</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        <button onClick={() => setTab('comprar')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'comprar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          {t('tabComprar')}
        </button>
        <button onClick={() => setTab('vender')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'vender' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          {t('tabVenderExcedente')}
        </button>
      </div>

      {/* lote 3 (P-7): aviso amarelo antes do bloqueio / bloqueio vermelho, uma linha por pedido (as duas abas) */}
      <Suspense fallback={null}><VigiaRepetir aoMudar={repetirMudou} /></Suspense>
      {v3 && <BannerP7 dados={p7} podeAvaliar={!!oficina && oficina.profile_id === user?.id} aoAvaliar={(x: PendenteP7) => { setTab('comprar'); irAoPedido(x.id); }} />}

      {tab === 'comprar' ? (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowForm(true)} className="btn-primary">{t('novaCotacao')}</button>
          </div>

          {showForm && (
            <div className="card mb-6">
              <h2 className="font-semibold text-gray-900 mb-4">{t('solicitarCotacaoPeca')}</h2>
              {v3 === null ? (
                // interruptor ainda sem resposta: nem o formulario de hoje nem o novo
                <div className="animate-pulse space-y-3" aria-busy="true">
                  <div className="h-10 bg-gray-200 rounded-lg" />
                  <div className="h-10 bg-gray-200 rounded-lg" />
                  <div className="h-24 bg-gray-200 rounded-lg" />
                </div>
              ) : (
              <>
              <div className="space-y-4">
                {v3 && (
                  <fieldset>
                    <legend className="block text-sm font-medium text-gray-700 mb-1">{tp('tipo')}</legend>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                        <input type="radio" name="cotacao-tipo" data-testid="cotacao-tipo-carro" checked={form.tipo === 'carro'} onChange={() => setForm({ ...form, tipo: 'carro' })} />
                        {tp('tipoCarro')}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                        <input type="radio" name="cotacao-tipo" data-testid="cotacao-tipo-sem-carro" checked={form.tipo === 'sem_carro'} onChange={() => setForm({ ...form, tipo: 'sem_carro' })} />
                        {tp('tipoSemCarro')}
                      </label>
                    </div>
                  </fieldset>
                )}
                <div>
                  <label htmlFor="c8551-1" className="block text-sm font-medium text-gray-700 mb-1">{t('oQueVocePrecisa')}</label>
                  <input id="c8551-1" type="text" className="input-field" placeholder={t('placeholderFarol')} value={form.peca_descricao} onChange={(e) => setForm({ ...form, peca_descricao: e.target.value })} />
                </div>
                {(!v3 || form.tipo === 'carro') && (
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="c8551-2" className="block text-sm font-medium text-gray-700 mb-1">{t('marca')}</label>
                    <input id="c8551-2" type="text" className="input-field" placeholder={exemploVeiculo(locale).marca} value={form.fipe_marca} onChange={(e) => setForm({ ...form, fipe_marca: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c8551-3" className="block text-sm font-medium text-gray-700 mb-1">{t('modelo')}</label>
                    <input id="c8551-3" type="text" className="input-field" placeholder={exemploVeiculo(locale).modelo} value={form.fipe_modelo} onChange={(e) => setForm({ ...form, fipe_modelo: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c8551-4" className="block text-sm font-medium text-gray-700 mb-1">{t('ano')}</label>
                    <input id="c8551-4" type="text" className="input-field" placeholder="2020" value={form.fipe_ano} onChange={(e) => setForm({ ...form, fipe_ano: e.target.value })} />
                  </div>
                </div>
                )}
                {v3 ? (
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <label htmlFor="c8551-5" className="block text-sm font-medium text-gray-700 mb-1">{t('quantidade')}</label>
                      <input id="c8551-5" data-testid="cotacao-quantidade" type="text" inputMode="decimal" className="input-field !w-28" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value.replace(/[^\d.,]/g, '') })} />
                    </div>
                    <div>
                      <label htmlFor="cotacao-unidade" className="block text-sm font-medium text-gray-700 mb-1">{tp('unidade')}</label>
                      <select id="cotacao-unidade" data-testid="cotacao-unidade" className="input-field !w-auto pr-8" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })}>
                        {UNIDADES_PECA.map((u) => <option key={u} value={u}>{tp(`unidadesNome.${u}`)}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                <div>
                  <label htmlFor="c8551-5" className="block text-sm font-medium text-gray-700 mb-1">{t('quantidade')}</label>
                  <input id="c8551-5" type="number" className="input-field !w-24" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
                </div>
                )}
                {/* placa: campo proprio (tabela so da compradora), nunca no texto nem no e-mail */}
                {v3 && form.tipo === 'carro' && (
                  <div className="space-y-2">
                    <div>
                      <label htmlFor="cotacao-placa" className="block text-sm font-medium text-gray-700 mb-1">{tp('placa')}</label>
                      <input id="cotacao-placa" data-testid="cotacao-placa" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={16} className="input-field !w-44 uppercase" value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })}
                        onBlur={() => setForm((f) => ({ ...f, placa: normalizarPlaca(f.placa) }))} />
                      <p data-testid="cotacao-placa-dica" className="text-xs text-gray-500 mt-1">{tp('placaDica')}</p>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-gray-800">
                      <input type="checkbox" data-testid="cotacao-ocultar-placa" className="mt-0.5" checked={form.ocultarPlaca} onChange={(e) => setForm({ ...form, ocultarPlaca: e.target.checked })} />
                      <span>
                        {tp('ocultarPlaca')}
                        <span data-testid="cotacao-ocultar-placa-ajuda" className="block text-xs text-gray-500">{tp('ocultarPlacaAjuda')}</span>
                      </span>
                    </label>
                  </div>
                )}
                {v3 && (
                  <fieldset>
                    <legend className="block text-sm font-medium text-gray-700 mb-1">{tp('enviarA')}</legend>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                        <input type="radio" name="cotacao-alvo" data-testid="cotacao-alvo-todos" checked={form.alvo === 'todos'} onChange={() => setForm({ ...form, alvo: 'todos' })} />
                        {tp('alvoTodos')}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                        <input type="radio" name="cotacao-alvo" data-testid="cotacao-alvo-so-lojas" checked={form.alvo === 'so_lojas'} onChange={() => setForm({ ...form, alvo: 'so_lojas' })} />
                        {tp('alvoSoLojas')}
                      </label>
                    </div>
                  </fieldset>
                )}
                {/* lote 2: urgencia - hoje/amanha = e-mail na hora as lojas; sem pressa = resumo de 2 h */}
                {v3 && (
                  <fieldset>
                    <legend className="block text-sm font-medium text-gray-700 mb-1">{tp('urgencia')}</legend>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {URGENCIAS.map(([valor, chave, id]) => (
                        <label key={valor} className="inline-flex items-center gap-2 text-sm text-gray-800">
                          <input type="radio" name="cotacao-urgencia" data-testid={`cotacao-urgencia-${id}`} checked={form.urgencia === valor} onChange={() => setForm({ ...form, urgencia: valor })} />
                          {tp(`urgencias.${chave}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="sm:col-span-2">
                  <label htmlFor="peca-detalhes" className="block text-sm font-medium text-gray-700 mb-1">{t('detalhesLabel')}</label>
                  <textarea id="peca-detalhes" className="input-field min-h-[90px]" maxLength={1000} placeholder={t('detalhesPlaceholder')} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="peca-fotos" className="block text-sm font-medium text-gray-700 mb-1">{t('fotosLabel')}</label>
                  <input id="peca-fotos" type="file" accept="image/*" multiple className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700"
                    onChange={(e) => setFotosPeca(Array.from(e.target.files || []).slice(0, 4))} />
                  <p className="text-xs text-gray-500 mt-1">{t('fotosAjuda')}{fotosPeca.length ? ` (${fotosPeca.length})` : ''}</p>
                </div>
              </div>
              {v3 && <p data-testid="cotacao-validade-aviso" className="mt-4 text-sm text-gray-600">{tp('vale7Dias')}</p>}
              {v3 && p7?.bloqueado && (
                <p role="alert" data-testid="p7-criar-bloqueado" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{tp('p7.criarBloqueado')}</p>
              )}
              {erroCriar && (
                <p role="alert" data-testid="cotacao-erro-criar" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{erroCriar}</p>
              )}
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowForm(false); setErroCriar(null); }} className="btn-secondary">{t('cancelar')}</button>
                <button onClick={handleCriar} disabled={saving || !form.peca_descricao || (v3 === true && !!p7?.bloqueado)} className="btn-primary disabled:opacity-50">
                  {saving ? t('enviando') : t('enviarCotacao')}
                </button>
              </div>
              </>
              )}
            </div>
          )}

          {v3 === null ? (
            <div className="animate-pulse h-32 bg-gray-200 rounded-xl" />
          ) : cotacoes.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500">{t('nenhumaCotacaoAinda')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cotacoes.map((c) => {
                // A3 (16/11): pedido confirmado desta cotacao (oferta escolhida, entregue ou nao)
                // lote 3: com a tela nova e pedido v3, o pedido VIVO mais recente (o cancelado nao e mais o
                // escolhido; numa cotacao reaberta pode haver um 2o pedido). Sem isso, o de hoje (pedidos[0]).
                const pedidosC = (c.pedidos || []) as PedidoV3[];
                const cardNovo = v3 === true && pedidosC.some((p) => p.v3);
                const ordenados = cardNovo ? [...pedidosC].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) : pedidosC;
                const pedido = cardNovo ? (ordenados.find((p) => p.status !== 'cancelado') || null) : (pedidosC[0] || null);
                const entregue = pedido?.status === 'entregue';
                const falhou = (respostaId: string) => cardNovo && pedidosC.some((p) => p.status === 'cancelado' && p.resposta_id === respostaId);
                const pendenteDe = (pedidoId: string) => p7?.pedidos.find((x) => x.id === pedidoId) || null;
                const vencida = c.status === 'expirada' || (!!c.expira_em && Date.parse(c.expira_em) <= Date.now());
                // blocos do ciclo novo: o pedido vivo + cancelados que ainda pedem avaliacao ou a escolha do D-5
                const precisaAcao = (p: PedidoV3) => !!p.v3 && p.status === 'cancelado' && (!!pendenteDe(p.id) || (!p.pos_cancelamento && !pedido && p7 !== null));
                const blocos = cardNovo ? [...(pedido?.v3 ? [pedido] : []), ...ordenados.filter((p) => p !== pedido && precisaAcao(p))] : [];
                const ultimoCancelado = cardNovo && !pedido && !blocos.length ? ordenados.find((p) => p.v3 && p.status === 'cancelado') || null : null;
                const contato = pedido ? contatos[pedido.id] : undefined;
                // D-6: so a dona age no ciclo v3 (a rota recusa a equipe com 403); a equipe ve so o estado
                const dona = oficina.profile_id === user?.id;
                // A1: conversas de fornecedores que ainda nao mandaram oferta
                const comOferta = new Set((c.respostas || []).map((r) => chaveConversa(c.id, r.fornecedor_tipo, r.loja_id || r.oficina_fornecedora_id)));
                const semOferta = Object.entries(conversas).filter(([k, v]) => v.cotacaoId === c.id && !comOferta.has(k)).map(([, v]) => v);
                return (
                <div key={c.id} className="card" data-testid="cotacao-peca">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{c.peca_descricao}</p>
                      {v3 ? (
                        <>
                          <p className="text-sm text-gray-500">
                            {c.tipo === 'sem_carro'
                              ? <span data-testid="cotacao-sem-carro" className="mr-1.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 align-middle">{tp('semCarro')}</span>
                              : (c.fipe_marca || c.fipe_modelo) && <>{c.fipe_marca} {c.fipe_modelo} {c.fipe_ano} · </>}
                            {t('qtd')}: <span data-testid="cotacao-quantidade-valor">{qtdTexto(c)}</span>
                          </p>
                          {c.tipo !== 'sem_carro' && placasMinhas[c.id] && (
                            <p className="text-sm text-gray-500">{tp('placa')}: <span data-testid="cotacao-placa-valor" className="font-mono">{placasMinhas[c.id]}</span></p>
                          )}
                          {c.urgencia && <p className="text-sm text-gray-500">{tp('urgencia')}: {tp(`urgencias.${chaveUrgencia(c.urgencia)}`)}</p>}
                          {naoTem[c.id]?.n > 0 && (
                            <p data-testid="cotacao-nao-tem-contagem" className="text-sm text-gray-500">
                              {tp('naoTemContagem', { n: naoTem[c.id].n })}
                              {Object.keys(naoTem[c.id].motivos).length > 0 && ` (${Object.entries(naoTem[c.id].motivos).map(([m, q]) => `${tp(`naoTenhoMotivos.${m === 'sem_estoque' ? 'semEstoque' : m === 'nao_trabalho' ? 'naoTrabalho' : 'outro'}`)}: ${q}`).join(', ')})`}
                            </p>
                          )}
                        </>
                      ) : (c.fipe_marca || c.fipe_modelo) && (
                        <p className="text-sm text-gray-500">{c.fipe_marca} {c.fipe_modelo} {c.fipe_ano} · {t('qtd')}: {c.quantidade}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {/* 'expirada' (lote 1) tambem sem o interruptor: nunca como "cancelada" */}
                      <span data-testid="cotacao-status" className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.status === 'fechada' ? 'bg-green-100 text-green-700' :
                        c.status === 'respondida' ? 'bg-blue-100 text-blue-700' :
                        c.status === 'cancelada' || c.status === 'expirada' ? 'bg-gray-100 text-gray-600' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {c.status === 'aberta' ? t('aguardandoRespostas') : c.status === 'respondida' ? t('respondida') : c.status === 'fechada' ? (cardNovo && !pedido ? t('cancelada') : entregue ? t('entregue') : t('pedidoConfirmado')) : c.status === 'expirada' ? tp('expirada') : t('cancelada')}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">{timeAgo(c.created_at, locale)}</p>
                      {v3 && ['aberta', 'respondida'].includes(c.status) && (
                        <p data-testid="cotacao-expira-em" className="text-xs text-gray-500 mt-0.5">{tp('expiraEm', { dias: diasParaExpirar(c.expira_em) })}</p>
                      )}
                    </div>
                  </div>

                  {/* M9 (16/11): detalhes e fotos tambem no cartao da propria compradora */}
                  {editandoId !== c.id && (c.observacao || (c.fotos && c.fotos.length > 0)) && (
                    <div className="mb-3 -mt-2"><DetalhesPedidoPeca observacao={c.observacao} fotos={c.fotos} /></div>
                  )}
                  {erroConfirmar?.cotacaoId === c.id && (
                    <p role="alert" className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{erroConfirmar.msg}</p>
                  )}
                  {/* lote 1: vencida (7 dias) -> reabrir por mais 7 dias, ate 3 vezes. Lote 2: tambem sem o
                      interruptor (o global foi desligado depois de vencer): senao ela ficava presa */}
                  {c.status === 'expirada' && (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {(c.reaberta_vezes || 0) < TETO_REABERTURAS ? (
                        <button type="button" data-testid="cotacao-reabrir" disabled={reabrindoId === c.id} onClick={() => handleReabrir(c)}
                          className="px-3 py-1.5 text-sm rounded-lg border border-primary-300 text-primary-700 hover:bg-primary-50 disabled:opacity-50">
                          ↻ {reabrindoId === c.id ? tp('reabrindo') : tp('reabrir')}
                        </button>
                      ) : (
                        <p className="text-sm text-gray-600">{tp('reabrirTeto', { n: TETO_REABERTURAS })}</p>
                      )}
                    </div>
                  )}
                  {erroReabrir?.cotacaoId === c.id && (
                    <p role="alert" className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{erroReabrir.msg}</p>
                  )}
                  {['aberta', 'respondida'].includes(c.status) && editandoId !== c.id && (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <button type="button" onClick={() => { setCancelandoId(null); setEditandoId(c.id); setEditForm({ peca_descricao: c.peca_descricao || '', quantidade: String(c.quantidade || 1), observacao: (c as any).observacao || '' }); }}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">✏️ {t('editarPedido')}</button>
                      {cancelandoId === c.id ? (
                        <span className="inline-flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-red-700">{t('confirmarCancelarPedido')}</span>
                          <button type="button" disabled={salvandoEdicao} onClick={() => cancelarPedido(c.id)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{t('simCancelar')}</button>
                          <button type="button" onClick={() => setCancelandoId(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700">{t('naoManter')}</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setCancelandoId(c.id)} className="px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50">✕ {t('cancelarPedido')}</button>
                      )}
                    </div>
                  )}
                  {editandoId === c.id && (
                    <div className="mb-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <label className="block">
                        <span className="block text-sm font-medium text-gray-700 mb-1">{t('oQueVocePrecisa')}</span>
                        <input className="input-field" value={editForm.peca_descricao} onChange={(e) => setEditForm({ ...editForm, peca_descricao: e.target.value })} />
                      </label>
                      <label className="block">
                        <span className="block text-sm font-medium text-gray-700 mb-1">{t('quantidade')}</span>
                        {v3 ? (
                          <input className="input-field !w-28" inputMode="decimal" value={editForm.quantidade} onChange={(e) => setEditForm({ ...editForm, quantidade: e.target.value.replace(/[^\d.,]/g, '') })} />
                        ) : (
                          <input className="input-field !w-28" inputMode="numeric" value={editForm.quantidade} onChange={(e) => setEditForm({ ...editForm, quantidade: e.target.value.replace(/\D/g, '') })} />
                        )}
                      </label>
                      <label className="block">
                        <span className="block text-sm font-medium text-gray-700 mb-1">{t('detalhesLabel')}</span>
                        <textarea className="input-field" rows={2} value={editForm.observacao} onChange={(e) => setEditForm({ ...editForm, observacao: e.target.value })} />
                      </label>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditandoId(null)} className="btn-secondary">{t('cancelar')}</button>
                        <button type="button" disabled={salvandoEdicao || !editForm.peca_descricao.trim()} onClick={() => salvarEdicao(c.id)} className="btn-primary disabled:opacity-50">{t('salvarPedido')}</button>
                      </div>
                    </div>
                  )}

                  {c.respostas && c.respostas.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      {/* lote 2 (so com o interruptor): "sem pressa" = a mais barata primeiro (pelo total da quantidade
                          ofertada); hoje/amanha = a mais rapida primeiro e, no empate, a mais barata (N-9 / proposta v3 sec. 3) */}
                      {(v3 ? [...c.respostas].sort((a, b) => {
                        const ta = totalDaOferta(a.preco, Number(a.quantidade_ofertada ?? c.quantidade));
                        const tb = totalDaOferta(b.preco, Number(b.quantidade_ofertada ?? c.quantidade));
                        if (c.urgencia === 'sem_pressa') return ta - tb;
                        return (Number(a.prazo_dias ?? 99) - Number(b.prazo_dias ?? 99)) || (ta - tb);
                      }) : c.respostas).map((r) => {
                        const escolhida = !!pedido && pedido.resposta_id === r.id;
                        const qtdOferta = Number(r.quantidade_ofertada ?? c.quantidade) || 1;
                        const moedaOferta = currencyForCountry(r.loja?.pais || r.oficina_fornecedora?.pais);
                        const totalOferta = totalDaOferta(r.preco, qtdOferta);
                        const ivaOferta = v3 ? textoIvaOferta(tp, r, totalOferta, moedaOferta, locale) : null;
                        const naoLidas = conversas[chaveConversa(c.id, r.fornecedor_tipo, r.loja_id || r.oficina_fornecedora_id)]?.naoLidas || 0;
                        return (
                        <div key={r.id} data-testid={escolhida ? 'oferta-escolhida' : 'oferta'} className={`rounded-lg p-3 ${escolhida ? 'bg-green-50 border border-green-300' : 'bg-gray-50'} ${pedido && !escolhida ? 'opacity-60' : ''}`}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {r.loja?.nome_fantasia || r.oficina_fornecedora?.nome_fantasia}
                              {r.fornecedor_tipo === 'oficina' && (
                                <span className="ml-1.5 text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full align-middle">{t('oficinaTag')}</span>
                              )}
                              {escolhida && (
                                <span className="ml-1.5 inline-block whitespace-nowrap text-[10px] font-semibold text-green-800 bg-green-200 px-1.5 py-0.5 rounded-full align-middle">✓ {t('ofertaEscolhida')}</span>
                              )}
                            </p>
                            {/* lote 3: nota do fornecedor (a partir de 3 avaliacoes; antes "novo") e a condicao da peca */}
                            {v3 && (
                              <NotaOferta resumo={resumos[`${r.fornecedor_tipo}:${r.loja_id || r.oficina_fornecedora_id}`]}
                                aoVer={() => setModalForn({ tipo: r.fornecedor_tipo as 'loja' | 'oficina', id: (r.loja_id || r.oficina_fornecedora_id) as string, nome: r.loja?.nome_fantasia || r.oficina_fornecedora?.nome_fantasia || '' })} />
                            )}
                            {v3 && r.condicao && <p data-testid="oferta-condicao" className="text-xs text-gray-600">{tp('condicao')}: {tp(`condicoes.${chaveCondicao(r.condicao)}`)}</p>}
                            {v3 ? (
                              // lote 1: total da quantidade na unidade (preco unitario x 4,5 l); lote 2: pela
                              // quantidade OFERTADA, com a linha do IVA e "oferta parcial"
                              <>
                                <p className="text-sm text-gray-600">
                                  {formatCurrency(r.preco, moedaOferta, locale)} × {qtdTexto({ quantidade: qtdOferta, unidade: c.unidade })} = <span data-testid="oferta-total" className="font-semibold text-gray-900">{formatCurrency(totalOferta, moedaOferta, locale)}</span> · {t('prazoDias', { dias: r.prazo_dias })}
                                </p>
                                {ivaOferta && <p data-testid="oferta-iva" className="text-xs text-gray-500">{ivaOferta}</p>}
                                {r.quantidade_ofertada != null && Number(r.quantidade_ofertada) < Number(c.quantidade) && (
                                  <p data-testid="oferta-parcial" className="text-xs font-medium text-amber-800">{tp('ofertaParcial', { ofertada: qtdTexto({ quantidade: Number(r.quantidade_ofertada), unidade: c.unidade }), pedida: qtdTexto(c) })}</p>
                                )}
                              </>
                            ) : (
                            <p className="text-sm text-gray-600">
                              {formatCurrency(r.preco, currencyForCountry(r.loja?.pais || r.oficina_fornecedora?.pais), locale)} {c.quantidade > 1 && `x ${c.quantidade} = ${formatCurrency(r.preco * c.quantidade, currencyForCountry(r.loja?.pais || r.oficina_fornecedora?.pais), locale)}`} · {t('prazoDias', { dias: r.prazo_dias })}
                            </p>
                            )}
                            {r.observacao && <p className="text-xs text-gray-500 mt-0.5">{r.observacao}</p>}
                          </div>
                          <div className="flex items-center justify-end gap-3 flex-shrink-0">
                            <Link href={`/oficina/pecas/conversa/${r.id}`} className="text-xs font-medium text-primary-600 hover:underline inline-flex items-center gap-1">
                              {t('conversar')}
                              {naoLidas > 0 && <span className="min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white" aria-label={t('mensagensNaoLidas', { n: naoLidas })}>{naoLidas}</span>}
                            </Link>
                            {c.status !== 'fechada' && c.status !== 'expirada' && !falhou(r.id) && (
                              v3 && p7?.bloqueado ? (
                                // lote 3 (P-7, D-7): confirmar fica bloqueado ate avaliar
                                <button type="button" data-testid="p7-confirmar-bloqueado" disabled aria-disabled="true" className="btn-primary !py-1.5 !px-3 text-sm opacity-50 cursor-not-allowed">
                                  {tp('p7.confirmarBloqueado')}
                                </button>
                              ) : (
                              <button
                                onClick={() => handleConfirmarPedido(c, r)}
                                disabled={confirmandoId === r.id}
                                className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50"
                              >
                                {confirmandoId === r.id ? t('confirmando') : t('confirmarPedidoBtn')}
                              </button>
                              )
                            )}
                          </div>
                        </div>
                        {/* A3: telefone e endereco do fornecedor so depois da confirmacao */}
                        {escolhida && contato && (contato.telefone || contato.endereco) && (
                          <div className="mt-2 border-t border-green-200 pt-2 text-sm text-gray-700 space-y-0.5" data-testid="contato-fornecedor">
                            <p className="text-xs font-semibold text-green-800">{t('contatoFornecedor')}</p>
                            {contato.telefone && <p>{t('telefoneLabel')}: <a href={`tel:${contato.telefone.replace(/[^\d+]/g, '')}`} className="text-primary-700 underline">{contato.telefone}</a></p>}
                            {contato.endereco && <p>{t('enderecoLabel')}: {contato.endereco}</p>}
                          </div>
                        )}
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* lote 3: ciclo do pedido v3 (recebi/problema, cancelar, avaliar, depois do cancelamento) */}
                  {blocos.map((p) => {
                    const pend = pendenteDe(p.id);
                    const faltaAvaliacao = pend?.falta === 'avaliacao' && !enviadas.has(p.id);
                    const semRetorno = p.status === 'confirmado' || (p.status === 'entregue' && !p.recebido_em && !p.problema);
                    return (
                      <div key={p.id} id={`pedido-${p.id}`} className="border-t pt-2 mt-3 scroll-mt-24">
                        {p.recebido_em && <p className="text-sm text-gray-600">{tp('recebidoEm', { data: formatDate(p.recebido_em, locale) })}</p>}
                        {p.problema && p.status !== 'cancelado' && <p className="text-sm text-amber-800">{tp('problemaInfo', { problema: tp(`problemas.${chaveProblema(p.problema)}`) })}</p>}
                        {p.status === 'cancelado' && <CanceladoInfo pedido={p} />}
                        {dona && semRetorno && <RecebiProblema pedidoId={p.id} aoTerminar={recarregarTudo} />}
                        {dona && p.status === 'confirmado' && <CancelarPedidoV3 pedidoId={p.id} lado="compradora" aoTerminar={recarregarTudo} />}
                        {dona && faltaAvaliacao && (fechados.has(p.id) ? (
                          <button type="button" data-testid="pedido-falta-avaliar" onClick={() => setFechados((f) => { const n = new Set(f); n.delete(p.id); return n; })}
                            className="mt-3 px-3 py-1.5 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100">★ {tp('faltaAvaliar')}</button>
                        ) : (
                          <AvaliarForm pedidoId={p.id} aoFechar={() => setFechados((f) => new Set(f).add(p.id))}
                            aoEnviar={() => { setEnviadas((e) => new Set(e).add(p.id)); setAvaliados((a) => new Set(a).add(p.id)); recarregarTudo(); }} />
                        ))}
                        {(enviadas.has(p.id) || (avaliados.has(p.id) && !pend)) && <p data-testid="avaliacao-enviada" className="mt-2 text-sm text-green-700">✓ {tp('avaliacao.enviada')}</p>}
                        {dona && p.status === 'cancelado' && !p.pos_cancelamento && !pedido && p7 !== null && !(pend && !enviadas.has(p.id)) && (
                          <PosCancelamento pedidoId={p.id} vencida={vencida} semOutrasOfertas={!(c.respostas || []).some((r) => !falhou(r.id))} aoReaberta={recarregarTudo} aoPedirDeNovo={() => pedirDeNovo(c)} />
                        )}
                      </div>
                    );
                  })}
                  {ultimoCancelado && <CanceladoInfo pedido={ultimoCancelado} />}

                  {/* A1 (16/11): pergunta de fornecedor antes de mandar oferta */}
                  {semOferta.length > 0 && (
                    <div className="border-t pt-3 mt-3" data-testid="perguntas-fornecedores">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('perguntasFornecedores')}</p>
                      <div className="space-y-2">
                        {semOferta.map((cv) => (
                          <Link
                            key={`${cv.tipo}:${cv.fornecedorId}`}
                            href={`/oficina/pecas/conversa/nova?cotacaoId=${c.id}&fornecedorTipo=${cv.tipo}&fornecedorId=${cv.fornecedorId}&pecaDescricao=${encodeURIComponent(c.peca_descricao || '')}`}
                            className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 hover:bg-gray-100"
                          >
                            <span className="text-sm font-medium text-gray-900 min-w-0 truncate">
                              {cv.nome || t('fornecedorFallback')}
                              {cv.tipo === 'oficina' && <span className="ml-1.5 text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full align-middle">{t('oficinaTag')}</span>}
                            </span>
                            <span className="flex items-center gap-2 flex-shrink-0 text-xs font-medium text-primary-600">
                              {cv.naoLidas > 0 && <span className="min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white" aria-label={t('mensagensNaoLidas', { n: cv.naoLidas })}>{cv.naoLidas}</span>}
                              {t('abrirConversa')}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900">{t('venderPecasExcedentes')}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {t('ativeParaReceberAvisos', { raio: oficina.raio_atendimento_km || 30 })}
              </p>
            </div>
            <button
              onClick={handleToggleVendePecas}
              disabled={savingVende}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${vendePecas ? 'bg-primary-600' : 'bg-gray-300'} disabled:opacity-50`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${vendePecas ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {!vendePecas && (
            <div className="card text-center py-12 mb-6">
              <p className="text-gray-500">{t('ativeOpcaoAcima')}</p>
            </div>
          )}
          {/* M15 (16/11): fora do interruptor - desligar nao esconde os pedidos ja ganhos */}
          {pedidosFornecedora.length > 0 && (
            <div className="card mb-6" data-testid="pedidos-como-fornecedora">
              <h2 className="font-semibold text-gray-900 mb-3">{t('meusPedidosComoFornecedora')}</h2>
              <div className="space-y-2">
                {pedidosFornecedora.map((p) => (
                  <div key={p.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 bg-gray-50 rounded-lg p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{p.cotacao?.peca_descricao}</p>
                      <p className="text-xs text-gray-500">
                        {p.oficina?.nome_fantasia} · {formatCurrency(p.preco_total, currencyForCountry(oficina?.pais), locale)} · {formatDate(p.created_at, locale)}
                      </p>
                      {v3 && p.v3 && p.recebido_em && <p className="text-xs text-gray-600 mt-0.5">{tp('recebidoEm', { data: formatDate(p.recebido_em, locale) })}</p>}
                      {v3 && p.v3 && p.problema && p.status !== 'cancelado' && <p className="text-xs text-amber-800 mt-0.5">{tp('problemaInfo', { problema: tp(`problemas.${chaveProblema(p.problema)}`) })}</p>}
                      {v3 && p.v3 && p.status === 'cancelado' && <CanceladoInfo pedido={p} />}
                      {v3 && p.v3 && p.status === 'confirmado' && oficina.profile_id === user?.id && <CancelarPedidoV3 pedidoId={p.id} lado="fornecedor" aoTerminar={fetchPedidosFornecedora} />}
                      {(contatos[p.id]?.telefone || contatos[p.id]?.endereco) && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          {contatos[p.id]?.telefone && <a href={`tel:${contatos[p.id].telefone!.replace(/[^\d+]/g, '')}`} className="text-primary-700 underline">{contatos[p.id].telefone}</a>}
                          {contatos[p.id]?.telefone && contatos[p.id]?.endereco && ' · '}
                          {contatos[p.id]?.endereco}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-3 flex-shrink-0">
                      <Link href={`/oficina/pecas/conversa/${p.resposta_id}`} className="text-xs text-primary-600 hover:underline font-medium">
                        {t('conversar')}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'entregue' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {p.status === 'entregue' ? t('entregue') : t('confirmado')}
                      </span>
                      {p.status === 'confirmado' && (
                        <button onClick={() => handleMarcarEntregueFornecedor(p.id)} disabled={marcandoEntregueId === p.id} className="text-xs text-primary-600 hover:underline font-medium disabled:opacity-50">
                          {marcandoEntregueId === p.id ? t('marcando') : t('marcarEntregue')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* lote 3: "Sua nota como fornecedora" + avaliacoes (responder 1x, pedir revisao) - so com a tela nova */}
          {v3 && (vendePecas || (resumoProprio?.total || 0) > 0) && (
            <div className="card mb-6">
              <h2 className="font-semibold text-gray-900 mb-2">{tp('suaNotaFornecedora')}</h2>
              <ResumoProprio resumo={resumoProprio} testid="fornecedora-nota" />
              {(resumoProprio?.total || 0) > 0 && (
                <div className="mt-3">
                  <AvaliacoesDoFornecedor tipo="oficina" id={oficina.id} podeAgir={oficina.profile_id === user?.id} aoMudar={() => lerResumo('oficina', oficina.id).then(setResumoProprio)} />
                </div>
              )}
            </div>
          )}

          {/* "Minha comissao como fornecedora" escondido da oficina (dono 03/11):
              sem cobranca hoje, so assustava quem esta entrando */}

          {vendePecas && (loadingVender || v3 === null ? (
            <div className="animate-pulse h-32 bg-gray-200 rounded-xl" />
          ) : cotacoesVizinhas.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500">{t('nenhumaCotacaoAbertaVizinhas')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cotacoesVizinhas.map((c) => {
                const km = c.oficina ? Math.round(distanciaKm(oficina.latitude, oficina.longitude, c.oficina.latitude, c.oficina.longitude)) : null;
                return (
                  <div key={c.id} className="card">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{c.peca_descricao}</p>
                        <p className="text-sm text-gray-500">
                          {c.oficina?.nome_fantasia} - {c.oficina?.cidade}, {c.oficina?.estado} {km != null && `· ${km}km`}
                        </p>
                        {v3 && c.tipo === 'sem_carro' ? (
                          <p className="text-sm"><span data-testid="cotacao-sem-carro" className="inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">{tp('semCarro')}</span></p>
                        ) : (c.fipe_marca || c.fipe_modelo) && (
                          <p className="text-sm text-gray-500">{t('veiculoLabel')}: {c.fipe_marca} {c.fipe_modelo} {c.fipe_ano}</p>
                        )}
                        {v3 && c.enviar_placa !== false && placasVizinhas[c.id] && (
                          <p className="text-sm text-gray-500">{tp('placa')}: <span data-testid="cotacao-placa-valor" className="font-mono">{placasVizinhas[c.id]}</span></p>
                        )}
                        <p className="text-sm text-gray-500">{t('quantidadeLabel')}: {v3 ? <span data-testid="cotacao-quantidade-valor">{qtdTexto(c)}</span> : c.quantidade}</p>
                        {v3 && c.urgencia && <p className="text-sm text-gray-500">{tp('urgencia')}: {tp(`urgencias.${chaveUrgencia(c.urgencia)}`)}</p>}
                        <DetalhesPedidoPeca observacao={c.observacao} fotos={c.fotos} />
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-400">{timeAgo(c.created_at, locale)}</span>
                        {!c.minhaResposta && (
                          <Link
                            href={`/oficina/pecas/conversa/nova?cotacaoId=${c.id}&compradoraNome=${encodeURIComponent(c.oficina?.nome_fantasia || t('oficinaFallback'))}&pecaDescricao=${encodeURIComponent(c.peca_descricao || '')}`}
                            className="text-xs font-medium text-primary-600 hover:underline whitespace-nowrap"
                          >
                            {t('tirarDuvida')}
                          </Link>
                        )}
                      </div>
                    </div>

                    {c.minhaResposta ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                        <p className="text-sm text-green-800">
                          {t('vocesRespondeu', { preco: formatCurrency(c.minhaResposta.preco, currencyForCountry(oficina?.pais), locale), dias: c.minhaResposta.prazo_dias })}
                        </p>
                      </div>
                    ) : respondendoId === c.id ? (
                      <div className="mt-3 space-y-3 border-t pt-3">
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="c8551-6" className="block text-xs font-medium text-gray-700 mb-1">{t('precoReais')}</label>
                            <input id="c8551-6" type="number" step="0.01" className="input-field !py-1.5" value={respostaForm.preco} onChange={(e) => setRespostaForm({ ...respostaForm, preco: e.target.value })} />
                          </div>
                          <div>
                            <label htmlFor="c8551-7" className="block text-xs font-medium text-gray-700 mb-1">{t('prazoDiasLabel')}</label>
                            <input id="c8551-7" type="number" className="input-field !py-1.5" value={respostaForm.prazo_dias} onChange={(e) => setRespostaForm({ ...respostaForm, prazo_dias: e.target.value })} />
                          </div>
                        </div>
                        <input type="text" className="input-field !py-1.5" placeholder={t('placeholderObservacaoOpcional')} value={respostaForm.observacao} onChange={(e) => setRespostaForm({ ...respostaForm, observacao: e.target.value })} />
                        {v3 && (
                          <CamposRespostaV3 quantidadePedida={Number(c.quantidade) || 1} unidade={c.unidade} quantidade={respQtd} setQuantidade={setRespQtd}
                            usada={respUsada} setUsada={setRespUsada} preco={respostaForm.preco} perfil={oficina} moeda={currencyForCountry(oficina?.pais)} />
                        )}
                        {v3 && (
                          <fieldset>
                            <legend className="block text-xs font-medium text-gray-700 mb-1">{tp('condicao')}</legend>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                              {CONDICOES.map(([valor, chave]) => (
                                <label key={valor} className="inline-flex items-center gap-1.5 text-sm text-gray-800">
                                  <input type="radio" name={`resposta-condicao-${c.id}`} data-testid={`resposta-condicao-${valor}`} checked={respCondicao === valor} onChange={() => setRespCondicao(valor)} />
                                  {tp(`condicoes.${chave}`)}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        )}
                        {erroResposta === c.id && (
                          <p role="alert" data-testid="resposta-erro" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{tp('respostaErro')}</p>
                        )}
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setRespondendoId(null); setErroResposta(null); }} className="btn-secondary !py-1.5 !px-3 text-sm">{t('cancelar')}</button>
                          <button onClick={() => handleResponderComoOficina(c.id)} disabled={savingResposta || !respostaForm.preco} className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50">
                            {savingResposta ? t('enviando') : t('enviarResposta')}
                          </button>
                        </div>
                      </div>
                    ) : v3 && oficina.profile_id === user?.id ? (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <button onClick={() => abrirRespostaComoOficina(c)} className="btn-primary !py-1.5 !px-3 text-sm">
                          {t('responderCotacao')}
                        </button>
                        <NaoTenhoCartao aoConfirmar={(motivo) => naoTenhoComoOficina(c.id, motivo)} />
                      </div>
                    ) : (
                      <button onClick={() => abrirRespostaComoOficina(c)} className="btn-primary !py-1.5 !px-3 text-sm mt-2">
                        {t('responderCotacao')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
      {v3 && modalForn && <ModalAvaliacoes tipo={modalForn.tipo} id={modalForn.id} nome={modalForn.nome} aoFechar={() => setModalForn(null)} />}
    </div>
  );
}
