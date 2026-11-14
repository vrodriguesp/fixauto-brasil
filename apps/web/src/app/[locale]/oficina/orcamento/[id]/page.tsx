'use client';

import TextoTraduzido, { useTraducoes, AvisoTraducao } from '@/components/ui/TextoTraduzido';
import { useState, useEffect, useRef } from 'react';
import { compressImage } from '@/lib/image-compress';
import CampoNumero from '@/components/forms/CampoNumero';
import SeguroDoPedido from '@/components/oficina/SeguroDoPedido';
import { EstimativaIA } from '@/components/ui/DamageAnalysis';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useOrcamentos } from '@/hooks/use-orcamentos';
import { useAuth } from '@/lib/auth-context';
import type { TipoItemOrcamento, AnaliseDano } from '@fixauto/shared';
import { formatCurrency, cleanDescricao, rotuloTipoPedido, INTL_LOCALE } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { supabase } from '@/lib/supabase';
import ProporNovaData from '@/components/oficina/ProporNovaData';
import { useTopoAoMudar } from '@/hooks/use-topo-ao-mudar';
import { useMostrarAlerta, rolarAteAqui } from '@/hooks/use-mostrar-alerta';
import { textoErroApi } from '@/lib/erro-api';
import { useEstadoQueVolta } from '@/hooks/use-estado-que-volta';
import { hojeLocal, janelaAindaVale, conflitoHorario, janelaDoSlot, turnoDaJanela, erroValidade, maiorData, somarDias, diaDoCalendario, formatarJanela, VALIDADE_FOLGA_DIAS, type HorarioSemana, type ContextoOficina } from '@/lib/turnos';
import { LinkHorarioPerfil } from '@/components/oficina/AvisoHorarioSlot';
import SeletorCheckin, { type LinhaCheckin } from '@/components/oficina/SeletorCheckin';
import InfoI from '@/components/ui/InfoI';

interface ItemForm {
  descricao: string;
  tipo: TipoItemOrcamento;
  valor_unitario: number;
  quantidade: number;
}

const PRAZO_PADRAO_DIAS = 1;
const TEMPO_PADRAO_HORAS = 2;

export default function EnviarOrcamentoPage() {
  const t = useTranslations('oficinaEnviarOrcamento');
  const tc = useTranslations('constants');
  const tErros = useTranslations('erros');
  const tDano = useTranslations('damageAnalysis');
  const tMud = useTranslations('agendaMudanca');
  // rotulo traduzido da gravidade da IA (antes aparecia a palavra interna, ex. "grave")
  const SEVERIDADE: Record<string, string> = { leve: 'severidadeLeve', moderado: 'severidadeModerado', grave: 'severidadeGrave', severo: 'severidadeSevero' };
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const { solicitacoes } = useSolicitacoes();
  const { create: createOrcamento, update: updateOrcamento } = useOrcamentos();
  const { oficina } = useAuth();
  const moeda = currencyForCountry(oficina?.pais);
  const solicitacao = solicitacoes.find((s) => s.id === params.id);

  // Check if workshop already has a quote for this solicitation
  const existingQuote = solicitacao?.orcamentos?.find(
    (o) => o.oficina_id === oficina?.id
  );
  const isRevision = !!existingQuote;
  // recusado pelo cliente (ou agendamento cancelado por ele): encerrado; so um orcamento NOVO, se
  // a oficina quiser e o pedido seguir aberto - chega ao cliente como novo (decisao do dono 08/11)
  const eraRecusado = existingQuote?.status === 'recusado';
  const ehRevisao = isRevision && !eraRecusado;
  // o cliente pediu novas datas (079): para so mandar datas, o cartao no pedido (nao conta como revisao)
  const tNd = useTranslations('oficinaNovasDatas');
  const [pedidoDatasPendente, setPedidoDatasPendente] = useState(false);
  useEffect(() => {
    if (!existingQuote?.id || !['enviado', 'visualizado'].includes(existingQuote.status)) { setPedidoDatasPendente(false); return; }
    supabase.from('orcamento_pedido_datas').select('id').eq('orcamento_id', existingQuote.id).eq('status', 'pendente').maybeSingle()
      .then(({ data }) => setPedidoDatasPendente(!!data));
  }, [existingQuote?.id, existingQuote?.status]);
  const [novoAposRecusa, setNovoAposRecusa] = useState(false);
  // orcamento ja aceito: vira PROPOSTA de revisao que o cliente aprova ou nao
  // (migracao 049, /api/orcamento-revisao) - nunca altera o aceito direto
  const modoRevisaoAceito = existingQuote?.status === 'aceito';
  const [motivoRevisao, setMotivoRevisao] = useState('');
  // revisao do aceito (teste do dono 07/11): primeiro a oficina escolhe O QUE
  // muda - a data de entrega (so antes do check-in) ou itens/valor -, uma coisa
  // por vez; antes as duas apareciam juntas e, depois de enviar a data, o
  // formulario do valor continuava aberto
  const [oQueMudar, setOQueMudar] = useEstadoQueVolta<'data' | 'valor'>(`orc-mudar:${params.id}`, null);
  const [temAgenda, setTemAgenda] = useState<boolean | null>(null);
  useTopoAoMudar(oQueMudar);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const [revisaoPendente, setRevisaoPendente] = useState<{ valor_novo: number; created_at: string; tipo?: string; nova_data_checkin?: string | null; novo_turno?: string | null; nova_hora?: string | null; nova_hora_fim?: string | null } | null>(null);
  const [erroRevisao, setErroRevisao] = useState('');
  // conta as tentativas: o mesmo erro duas vezes seguidas tambem leva a tela ao campo
  const [tentativaRevisao, setTentativaRevisao] = useState(0);
  useMostrarAlerta(erroRevisao && tentativaRevisao, motivoRef, true);
  // o cliente respondeu enquanto a pagina estava aberta: mostra isso (antes a pagina caia no
  // formulario de mudar o valor - dono 08/11)
  const [clienteRespondeu, setClienteRespondeu] = useState(false);
  const tinhaPendente = useRef(false);
  // proposta enviada nesta mesma pagina tambem conta como "esperando o cliente"
  useEffect(() => { if (revisaoPendente) tinhaPendente.current = true; }, [revisaoPendente]);
  useEffect(() => {
    if (!modoRevisaoAceito || !existingQuote?.id) return;
    let vivo = true;
    const ler = () => supabase.from('orcamento_revisoes').select('valor_novo, created_at, tipo, nova_data_checkin, novo_turno, nova_hora, nova_hora_fim').eq('orcamento_id', existingQuote.id).eq('status', 'pendente').maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        if (tinhaPendente.current && !data) setClienteRespondeu(true);
        tinhaPendente.current = !!data;
        setRevisaoPendente((data as any) || null);
      });
    ler();
    const tmr = setInterval(ler, 15000);
    return () => { vivo = false; clearInterval(tmr); };
  }, [modoRevisaoAceito, existingQuote?.id]);

  const [itens, setItens] = useState<ItemForm[]>([
    { descricao: '', tipo: 'mao_de_obra', valor_unitario: 0, quantidade: 1 },
  ]);
  // padrao de servico simples (antes 5 dias / 40 h: alto para troca de oleo, 05/11)
  const [prazoDias, setPrazoDias] = useState(PRAZO_PADRAO_DIAS);
  const [tempoExecucaoHoras, setTempoExecucaoHoras] = useState(TEMPO_PADRAO_HORAS);
  const [observacoes, setObservacoes] = useState('');
  // validade OBRIGATORIA e vazia no inicio (check-in v2, decisao 4): a oficina escolhe; minimo = ultima data de
  // check-in; o banco tambem garante (trigger 082). Antes nascia hoje + 30 pelo dia UTC do aparelho.
  const [validade, setValidade] = useState('');
  const [submitted, setSubmitted] = useState(false);
  useTopoAoMudar(submitted); // tela trocada inteira: abre no alto (dono 08/11)
  // garantia do servico (dias, a partir da entrega); '' = nao informada
  const [garantiaDias, setGarantiaDias] = useState<string>('');
  // prazo fora das opcoes prontas: a oficina digita os dias
  const [garantiaOutra, setGarantiaOutra] = useState(false);
  const garantiaPronta = garantiaDias === '' || [0, 30, 90, 180, 365, 730].includes(Number(garantiaDias));
  // orcamento feito em outro sistema: foto/PDF lido pela IA e (opcional) anexado
  const [docArquivo, setDocArquivo] = useState<File | null>(null);
  const [lendoDoc, setLendoDoc] = useState<'' | 'lendo' | 'ok' | 'erro' | 'ocupada' | 'grande'>('');
  const [prefilled, setPrefilled] = useState(false);
  const [analise, setAnalise] = useState<AnaliseDano | null>(null);
  // analise guardada na lingua de quem pediu primeiro: traduz o bloco todo
  const [iaOriginal, setIaOriginal] = useState(false);
  // observacoes da IA (versao 2, 14/11): pecas relacionadas e riscos ajudam a orcar
  const obsIA0 = ((analise?.raw_response as { observacoes?: unknown } | undefined)?.observacoes as string[] | undefined || []).filter((x) => typeof x === 'string' && x.trim());
  const nPecasIA = (analise?.pecas_afetadas || []).length;
  const trIA = useTraducoes(analise ? [analise.resumo || '', ...(analise.pecas_afetadas || []), ...obsIA0] : null, iaOriginal);
  const resumoIA = trIA.textos[0];
  const pecasIA = trIA.textos.slice(1, 1 + nPecasIA);
  const obsIA = trIA.textos.slice(1 + nPecasIA);

  // Fetch AI analysis if exists
  useEffect(() => {
    if (params.id) {
      supabase.from('analise_dano').select('*').eq('solicitacao_id', params.id).maybeSingle()
        .then(({ data }) => { if (data) setAnalise(data as AnaliseDano); });
    }
  }, [params.id]);

  // Commission handling - taxa efetiva considera o tier de fidelidade/volume
  // a comissao e sempre da oficina (o cliente nao paga nada a mais): sem opcao de repassar
  const comissaoModo = 'absorver' as const;
  const [comissaoInfo, setComissaoInfo] = useState<{ tipo?: 'percentual' | 'valor_fixo'; taxa: number; valorFixo?: number | null; origem: string } | null>(null);

  useEffect(() => {
    if (!oficina?.id) return;
    fetch(`/api/comissao-atual?oficinaId=${oficina.id}`)
      .then((res) => res.json())
      .then((data) => { if (data.taxa != null) setComissaoInfo(data); })
      .catch(() => {});
  }, [oficina?.id]);

  // Datas de check-in (check-in v2, decisoes finais 14/11 noite): o campo comeca VAZIO e e obrigatorio; a
  // oficina escolhe dia + faixa no mini calendario (dias passados e fechados desativados). As faixas vem do
  // perfil (recepcao de carros ou grade de 2 h pulando o almoco). A oficina pode corrigir o perfil numa aba
  // nova (link na folha / no erro): ao voltar para esta aba relemos o perfil, sem perder o que foi preenchido.
  const [perfilRelido, setPerfilRelido] = useState<ContextoOficina | null>(null);
  const horarioOficina = (perfilRelido?.horario ?? (oficina as any)?.horario_funcionamento) as HorarioSemana;
  const ctxOficina: ContextoOficina = perfilRelido ?? {
    horario: (oficina as any)?.horario_funcionamento, recepcao_inicio: (oficina as any)?.recepcao_inicio, recepcao_fim: (oficina as any)?.recepcao_fim,
    almoco_inicio: (oficina as any)?.almoco_inicio, almoco_fim: (oficina as any)?.almoco_fim,
  };
  const oficinaIdH = oficina?.id;
  useEffect(() => {
    if (!oficinaIdH) return;
    const reler = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.from('oficinas').select('horario_funcionamento, recepcao_inicio, recepcao_fim, almoco_inicio, almoco_fim').eq('id', oficinaIdH).maybeSingle()
        .then(({ data }) => { if (data) setPerfilRelido({ horario: data.horario_funcionamento as HorarioSemana, recepcao_inicio: data.recepcao_inicio, recepcao_fim: data.recepcao_fim, almoco_inicio: data.almoco_inicio, almoco_fim: data.almoco_fim }); });
    };
    document.addEventListener('visibilitychange', reler);
    return () => document.removeEventListener('visibilitychange', reler);
  }, [oficinaIdH]);
  const [slots, setSlots] = useState<LinhaCheckin[]>([]);
  const [erroHorario, setErroHorario] = useState(false);
  // data num dia em que a oficina esta fechada pelo proprio horario: bloqueia o envio (dono 14/11)
  const [erroDiaFechado, setErroDiaFechado] = useState(false);
  // nenhuma data de check-in: caixa vermelha, nao envia (decisao 1)
  const [erroSemCheckin, setErroSemCheckin] = useState(false);
  // validade vazia / antes da ultima data / no passado: vermelha ao enviar (decisao 4)
  const [erroVal, setErroVal] = useState<'vazia' | 'passado' | 'antes' | null>(null);
  const refCheckin = useRef<HTMLDivElement>(null);
  const refValidade = useRef<HTMLDivElement>(null);
  // o botao "enviar" sempre responde: enviando..., o que falta, ou o erro - ao lado do botao (item 34:
  // a oficina tocava e nada acontecia - botao desativado com total 0 e falha do servidor calada)
  const [enviandoOrc, setEnviandoOrc] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');

  // Pre-fill form with existing quote data for revisions
  useEffect(() => {
    if (existingQuote && !prefilled) {
      setPrefilled(true);
      if (existingQuote.itens && existingQuote.itens.length > 0) {
        setItens(
          existingQuote.itens.map((item: any) => ({
            descricao: item.descricao,
            tipo: item.tipo as TipoItemOrcamento,
            valor_unitario: item.valor_unitario,
            quantidade: item.quantidade,
          }))
        );
      }
      setPrazoDias(existingQuote.prazo_dias || PRAZO_PADRAO_DIAS);
      setTempoExecucaoHoras(existingQuote.tempo_execucao_horas || TEMPO_PADRAO_HORAS);

      // Parse commission prefix from observacoes
      const obsRaw = existingQuote.observacoes || '';
      const comissaoMatch = obsRaw.match(/^\[COMISSAO:(absorver|repassar):([\d.]+)\]/);
      if (comissaoMatch) {
        setObservacoes(obsRaw.replace(/^\[COMISSAO:[^\]]+\]\n?/, ''));
      } else {
        setObservacoes(obsRaw);
      }
      // revisao: validade e datas salvas vem preenchidas (o "vazio" vale so para orcamento novo - spec v2 2.11)
      setValidade(existingQuote.validade ? String(existingQuote.validade).slice(0, 10) : '');
      setGarantiaDias((existingQuote as any).garantia_dias != null ? String((existingQuote as any).garantia_dias) : '');
      if (existingQuote.disponibilidade && existingQuote.disponibilidade.length > 0) {
        // janela gravada; linha antiga (sem horas) = 08-12 / 13-17, que e o que o cliente viu
        setSlots(
          existingQuote.disponibilidade.map((s: any) => {
            const j = janelaDoSlot(s);
            return { data: s.data_checkin, hora_inicio: j.inicio, hora_fim: j.fim };
          }).sort((a: LinhaCheckin, b: LinhaCheckin) => `${a.data}${a.hora_inicio}`.localeCompare(`${b.data}${b.hora_inicio}`))
        );
      }
    }
  }, [existingQuote, prefilled]);

  const mudarSlots = (ls: LinhaCheckin[]) => {
    setErroHorario(false);
    setErroDiaFechado(false);
    if (ls.length) setErroSemCheckin(false);
    // a validade so fica vermelha de novo ao enviar (decisao 4); se a correcao ja resolveu, some
    if (erroVal && !erroValidade(validade, ls.map((s) => s.data), hojeLocal(undefined, (oficina as any)?.pais ?? null))) setErroVal(null);
    setSlots(ls);
  };

  const addItem = () => {
    setItens([...itens, { descricao: '', tipo: 'mao_de_obra', valor_unitario: 0, quantidade: 1 }]);
  };

  const removeItem = (index: number) => {
    if (itens.length > 1) {
      setItens(itens.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ItemForm, value: string | number) => {
    const newItens = itens.map((item, i) => {
      if (i !== index) return item;
      return { ...item, [field]: value };
    });
    setItens(newItens);
  };

  const refCamera = useRef<HTMLInputElement>(null);
  const refArquivo = useRef<HTMLInputElement>(null);
  const lerDocumento = async (original: File) => {
    setDocArquivo(original);
    setLendoDoc('lendo');
    const arq = original.type.startsWith('image/') ? await compressImage(original, { maxLado: 2400, qualidade: 0.85 }) : original;
    if (arq.size > 10 * 1024 * 1024) { setLendoDoc('grande'); return; }
    const fd = new FormData();
    fd.append('arquivo', arq);
    fd.append('idioma', locale);
    // nunca fica "lendo" para sempre: o servidor responde em ate ~50 s
    const r = await fetch('/api/ler-orcamento', { method: 'POST', body: fd, signal: AbortSignal.timeout(70_000) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { setLendoDoc(d.codigo === 'IA_OCUPADA' ? 'ocupada' : d.codigo === 'ARQUIVO_GRANDE' ? 'grande' : 'erro'); return; }
    setItens(d.itens.map((i: any) => ({ descricao: i.descricao, tipo: i.tipo, quantidade: i.quantidade, valor_unitario: i.valor_unitario })));
    if (d.prazo_dias) setPrazoDias(d.prazo_dias);
    if (d.garantia_dias) setGarantiaDias(String(d.garantia_dias));
    if (d.observacoes) setObservacoes((o) => (o ? `${o}
${d.observacoes}` : d.observacoes));
    setLendoDoc('ok');
  };

  const total = itens.reduce((acc, item) => acc + item.valor_unitario * item.quantidade, 0);

  // Commission computed values (after total) - taxa real da oficina (com
  // desconto por fidelidade/volume, se aplicavel), com 10% como fallback
  // enquanto a chamada a /api/comissao-atual nao volta
  // Valor fixo por servico (condicao do admin) ou percentual sobre o total
  const valorFixoComissao = comissaoInfo?.tipo === 'valor_fixo' ? Math.min(comissaoInfo.valorFixo || 0, total) : null;
  const comissaoValor = valorFixoComissao != null ? valorFixoComissao : total * (comissaoInfo ? comissaoInfo.taxa : 0.1);
  const COMISSAO_PERCENTUAL = total > 0 ? Math.round((comissaoValor / total) * 10000) / 100 : 0;
  const semComissao = !!comissaoInfo && comissaoValor === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modoRevisaoAceito && existingQuote) {
      setErroRevisao(''); setTentativaRevisao((n) => n + 1);
      if (motivoRevisao.trim().length < 5) { setErroRevisao(t('motivoRevisaoObrigatorio')); return; }
      const res = await fetch('/api/orcamento-revisao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orcamentoId: existingQuote.id, motivo: motivoRevisao, prazoDias,
          itens: itens.map((i) => ({ descricao: i.descricao, tipo: i.tipo, quantidade: i.quantidade, valor_unitario: i.valor_unitario })),
        }),
      }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      if (!res?.ok) { setErroRevisao(textoErroApi(tErros, res?.status || 500, d)); return; }
      setSubmitted(true);
      return;
    }
    if (enviandoOrc) return;
    setErroEnvio('');
    if (total === 0) { setErroEnvio(t('itemSemValor')); return; }
    // carro ja na oficina (em_andamento): o cartao das datas nao aparece e a oficina nao tem como corrigir
    // a data - nao valida (as datas salvas continuam sendo regravadas como antes; auditoria Fable R1)
    const datasVisiveis = solicitacao?.status !== 'em_andamento';
    const paisSub = (oficina as any)?.pais ?? null;
    const semCheckin = datasVisiveis && slots.length === 0;
    const passado = datasVisiveis && slots.some((s) => !janelaAindaVale(s.data, { inicio: s.hora_inicio, fim: s.hora_fim }, undefined, paisSub));
    const fechado = datasVisiveis && slots.some((s) => conflitoHorario(s.data, 'manha', horarioOficina) === 'fechado');
    // validade: obrigatoria; com o carro ja na oficina so "vazia" conta (as datas ficaram para tras)
    const ev = erroValidade(validade, datasVisiveis ? slots.map((s) => s.data) : [], hojeLocal(undefined, paisSub));
    const evConta = ev && (datasVisiveis || ev === 'vazia') ? ev : null;
    setErroSemCheckin(semCheckin); setErroHorario(passado); setErroDiaFechado(fechado); setErroVal(evConta);
    if (semCheckin || passado || fechado || evConta) {
      // rola ate o primeiro erro (de cima para baixo: validade fica acima das datas)
      const alvo = evConta ? refValidade.current : refCheckin.current;
      setTimeout(() => { alvo?.scrollIntoView({ block: 'center', behavior: 'smooth' }); alvo?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true }); }, 50);
      return;
    }

    const itensPayload = itens.map(item => ({
      descricao: item.descricao,
      tipo: item.tipo,
      valor_unitario: item.valor_unitario,
      quantidade: item.quantidade,
      valor_total: item.valor_unitario * item.quantidade,
    }));

    // janela gravada no envio (nunca recalculada); turno derivado do inicio (app antigo / e2e / 079)
    const slotsPayload = slots.filter(s => s.data).map(s => ({
      data_checkin: s.data,
      turno: turnoDaJanela({ inicio: s.hora_inicio, fim: s.hora_fim }),
      hora_inicio: s.hora_inicio,
      hora_fim: s.hora_fim,
      data_previsao_entrega: (() => {
        const d = new Date(s.data + 'T12:00:00');
        d.setDate(d.getDate() + prazoDias);
        return d.toISOString().split('T')[0];
      })(),
    }));

    // Build observacoes with commission prefix
    const comissaoPrefix = `[COMISSAO:${comissaoModo}:${COMISSAO_PERCENTUAL}]`;
    const obsComComissao = comissaoPrefix + (observacoes ? '\n' + observacoes : '');

    // Use commission-adjusted total when repassing to client
    const valorFinal = total;

    let result: { data?: any; error?: any };
    setEnviandoOrc(true);

    const garantia = garantiaDias === '' ? null : Number(garantiaDias);

    if (isRevision && existingQuote) {
      // Update existing quote (revision)
      result = await updateOrcamento(existingQuote.id, {
        solicitacao_id: params.id as string,
        valor_total: valorFinal,
        prazo_dias: prazoDias,
        tempo_execucao_horas: tempoExecucaoHoras,
        observacoes: obsComComissao,
        validade,
        valor_original: existingQuote.valor_original || existingQuote.valor_total,
        revisao_numero: (existingQuote.revisao_numero || 0) + 1,
        eraRecusado,
        garantia_dias: garantia,
        itens: itensPayload,
        slots: slotsPayload,
      });
    } else {
      // Create new quote
      result = await createOrcamento({
        solicitacao_id: params.id as string,
        valor_total: valorFinal,
        prazo_dias: prazoDias,
        tempo_execucao_horas: tempoExecucaoHoras,
        observacoes: obsComComissao,
        validade,
        garantia_dias: garantia,
        itens: itensPayload,
        slots: slotsPayload,
      });
    }

    setEnviandoOrc(false);
    if (result.error) {
      const e = result.error as { codigo?: string; status?: number };
      setErroEnvio(e.codigo || e.status ? textoErroApi(tErros, e.status || 500, { codigo: e.codigo }) : t('erroEnvioOrcamento'));
      return;
    }
    {
      // Notify client via email + WhatsApp (non-blocking)
      const orcId = result.data?.id;
      if (orcId) {
        fetch('/api/notificar-orcamento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orcamentoId: orcId }),
        }).catch(() => {});
      }

      setSubmitted(true);
      setTimeout(() => router.push('/oficina/pedidos?aba=respondidos'), 2000);
    }
  };

  useEffect(() => {
    if (!modoRevisaoAceito || !solicitacao?.id || !oficina?.id) return;
    supabase.from('agenda').select('id').eq('solicitacao_id', solicitacao.id).eq('oficina_id', oficina.id).eq('status', 'agendado').limit(1)
      .then(({ data }) => setTemAgenda(!!data?.length));
  }, [modoRevisaoAceito, solicitacao?.id, oficina?.id]);
  // itens mudados na revisao: a oficina ve o que mudou (o cliente ve o mesmo destaque)
  const chaveItem = (d: string) => (d || '').trim().toLowerCase();
  const originais: any[] = modoRevisaoAceito ? (existingQuote?.itens || []) : [];
  const estadoItem = (item: { descricao: string; tipo: string; valor_unitario: number; quantidade: number }) => {
    if (!modoRevisaoAceito || !item.descricao.trim()) return null;
    const o = originais.find((x) => chaveItem(x.descricao) === chaveItem(item.descricao));
    if (!o) return 'novo';
    return Number(o.valor_unitario) !== Number(item.valor_unitario) || Number(o.quantidade) !== Number(item.quantidade) || o.tipo !== item.tipo ? 'alterado' : null;
  };
  const removidos = originais.filter((o) => !itens.some((i) => chaveItem(i.descricao) === chaveItem(o.descricao)));
  // datas do check-in x horario da oficina (dono 14/11): dia FECHADO bloqueia o envio; periodo fora do
  // horario e periodo que acaba em < 2 h so avisam (os avisos ficam em cada linha do SeletorCheckin)
  const paisF = (oficina as any)?.pais ?? null;
  const temDiaFechado = slots.some((s) => s.data && conflitoHorario(s.data, 'manha', horarioOficina) === 'fechado');
  // uma data so (ou todas no mesmo dia): recomenda pelo menos 2 dias diferentes, sem bloquear (dono 14/11)
  const diasOferecidos = new Set(slots.filter((s) => s.data && janelaAindaVale(s.data, { inicio: s.hora_inicio, fim: s.hora_fim }, undefined, paisF)).map((s) => s.data)).size;
  // validade: minimo = ultima data de check-in (ou hoje); recomendado = ultima + 7 (so texto e botao, nunca sozinho)
  const hojeOf = hojeLocal(undefined, paisF);
  const ultimaData = maiorData(slots.map((s) => s.data));
  const validadeMin = ultimaData && ultimaData > hojeOf ? ultimaData : hojeOf;
  const validadeRecomendada = ultimaData ? somarDias(ultimaData, VALIDADE_FOLGA_DIAS) : '';
  const fmtCurta = (ymd: string) => diaDoCalendario(ymd, INTL_LOCALE[locale] || 'en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' });
  // o formulario do orcamento so aparece na revisao de itens/valor (ou sem agenda aberta: carro ja na oficina)
  const mostraForm = !modoRevisaoAceito || temAgenda === false || oQueMudar === 'valor';

  if (!solicitacao) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">{t('solicitacaoNaoEncontrada')}</p>
      </div>
    );
  }

  // carro entregue (ou pedido cancelado): o orcamento fica fechado, sem revisao
  // (teste do dono 31/10; o servidor tambem recusa - SERVICO_ENCERRADO)
  // pedido expirado (072): fechado ate o cliente reabrir
  const statusSol = solicitacao.status as string;
  if ((statusSol === 'concluida' || statusSol === 'cancelada' || statusSol === 'expirada') && !submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center" data-testid="orcamento-encerrado">
        <p className="text-gray-700 mb-6" role="status">{t(statusSol === 'concluida' ? 'orcamentoFechadoEntregue' : statusSol === 'expirada' ? 'orcamentoFechadoExpirado' : 'orcamentoFechadoCancelado')}</p>
        <Link href={`/oficina/pedidos/${solicitacao.id}`} className="btn-primary inline-block">{t('verPedido')}</Link>
      </div>
    );
  }

  if (eraRecusado && !novoAposRecusa && !submitted) {
    const aberto = statusSol === 'aberta' || statusSol === 'em_orcamento';
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center" data-testid="orcamento-recusado">
        <p className="text-gray-700 mb-3" role="status">{t('orcamentoRecusadoEncerrado')}</p>
        {aberto && <p className="text-sm text-gray-600 mb-6">{t('orcamentoNovoAjuda')}</p>}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {aberto && <button type="button" onClick={() => setNovoAposRecusa(true)} className="btn-primary" data-testid="enviar-orcamento-novo">{t('enviarOrcamentoNovo')}</button>}
          <Link href={`/oficina/pedidos/${solicitacao.id}`} className="btn-secondary">{t('verPedido')}</Link>
        </div>
      </div>
    );
  }
  if (clienteRespondeu && !submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center" data-testid="cliente-respondeu">
        <p className="text-gray-700 mb-6" role="status">{t('clienteRespondeuData')}</p>
        <Link href={`/oficina/pedidos/${solicitacao.id}`} className="btn-primary inline-block">{t('verPedido')}</Link>
      </div>
    );
  }

  // proposta de revisao ja enviada: espera a resposta do cliente
  if (modoRevisaoAceito && revisaoPendente && !submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-700 mb-6">{revisaoPendente.tipo === 'data'
          // proposta de nova data (076) esperando o cliente
          ? tMud('propostaPendente', { quando: `${diaDoCalendario(revisaoPendente.nova_data_checkin || '', INTL_LOCALE[locale] || 'en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}, ${revisaoPendente.nova_hora ? formatarJanela({ inicio: revisaoPendente.nova_hora.slice(0, 5), fim: (revisaoPendente.nova_hora_fim || revisaoPendente.nova_hora).slice(0, 5) }) : tMud(revisaoPendente.novo_turno === 'tarde' ? 'tarde' : 'manha')}` })
          : t('revisaoAguardandoCliente', { valor: formatCurrency(Number(revisaoPendente.valor_novo), moeda, locale) })}</p>
        <Link href={`/oficina/mensagens/${solicitacao.id}`} className="btn-primary inline-block">{t('abrirConversa')}</Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {modoRevisaoAceito ? t('revisaoEnviadaTitulo') : ehRevisao ? t('orcamentoRevisado') : t('orcamentoEnviado')}
        </h1>
        <p className="text-gray-600">
          {modoRevisaoAceito
            ? t('revisaoEnviadaTexto')
            : ehRevisao
            ? t('clienteNotificadoRevisao')
            : t('clienteNotificadoAceite')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('voltar')}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {modoRevisaoAceito ? t('proporRevisaoTitulo') : ehRevisao ? t('revisarOrcamento') : t('enviarOrcamento')}
      </h1>
      {!modoRevisaoAceito && pedidoDatasPendente && (
        <p role="note" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="dica-novas-datas">
          📅 {tNd('dicaModificar')}{' '}
          <Link href={`/oficina/pedidos/${solicitacao.id}`} className="font-medium underline">{tNd('dicaModificarLink')} ›</Link>
        </p>
      )}
      {modoRevisaoAceito && temAgenda === null && (
        <div className="mt-6 flex justify-center" role="status"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" /></div>
      )}
      {modoRevisaoAceito && temAgenda && oQueMudar === null && (
        <section className="mb-6 mt-4" data-testid="escolha-mudanca" aria-labelledby="escolha-titulo">
          <h2 id="escolha-titulo" className="text-lg font-semibold text-gray-900">{tMud('escolhaTitulo')}</h2>
          <p className="mt-1 mb-4 text-sm text-gray-600">{tMud('escolhaTexto')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setOQueMudar('data')} data-testid="opcao-mudar-data"
              className="card text-left border-2 border-gray-100 hover:border-primary-300 focus-visible:border-primary-500">
              <span className="block text-base font-semibold text-gray-900">📅 {tMud('opcaoData')}</span>
              <span className="mt-1 block text-sm text-gray-600">{tMud('opcaoDataTexto')}</span>
            </button>
            <button type="button" onClick={() => setOQueMudar('valor')} data-testid="opcao-mudar-valor"
              className="card text-left border-2 border-gray-100 hover:border-primary-300 focus-visible:border-primary-500">
              <span className="block text-base font-semibold text-gray-900">🧾 {tMud('opcaoValor')}</span>
              <span className="mt-1 block text-sm text-gray-600">{tMud('opcaoValorTexto')}</span>
            </button>
          </div>
        </section>
      )}
      {modoRevisaoAceito && temAgenda && oQueMudar !== null && (
        <button type="button" onClick={() => setOQueMudar(null)} className="mb-4 mt-2 text-sm font-medium text-primary-700 hover:underline" data-testid="escolher-outra">← {tMud('escolherOutra')}</button>
      )}
      {/* antes do check-in: propor nova data de entrega (076); enviada, a pagina passa a "esperando o cliente" */}
      {modoRevisaoAceito && oQueMudar === 'data' && existingQuote && oficina && (
        <ProporNovaData orcamentoId={existingQuote.id} solicitacaoId={solicitacao.id} oficinaId={oficina.id} pais={(oficina as any).pais}
          aoEnviar={(d) => setRevisaoPendente({ tipo: 'data', valor_novo: 0, created_at: new Date().toISOString(), nova_data_checkin: d.data, novo_turno: d.turno, nova_hora: d.hora_inicio, nova_hora_fim: d.hora_fim })} />
      )}
      {modoRevisaoAceito && mostraForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-900 mb-3">{t('proporRevisaoTexto')}</p>
          <label htmlFor="motivo-revisao" className="block text-sm font-medium text-gray-800 mb-1">{t('motivoRevisao')}</label>
          <textarea ref={motivoRef} id="motivo-revisao" className="input-field" rows={3} maxLength={1000} value={motivoRevisao}
            placeholder={t('motivoRevisaoPlaceholder')} onChange={(e) => setMotivoRevisao(e.target.value)} />
          {erroRevisao && <p role="alert" className="text-sm text-red-700 mt-2">{erroRevisao}</p>}
        </div>
      )}
      {mostraForm && (<>
      {ehRevisao && !modoRevisaoAceito && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
          <p className="text-sm text-amber-800">
            {t('jaEnviouOrcamento', { numero: ((existingQuote?.revisao_numero) || 0) + 1 })}
          </p>
        </div>
      )}
      <p className="text-gray-600 mb-6">
        {solicitacao.veiculo?.fipe_marca} {solicitacao.veiculo?.fipe_modelo} - {rotuloTipoPedido(tc, solicitacao.tipo, solicitacao.descricao)}
      </p>

      {/* Request summary */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <TextoTraduzido texto={cleanDescricao(solicitacao.descricao)} className="text-sm text-gray-600" />
        <p className="text-xs text-gray-500 mt-2">
          {/* antes do aceite a oficina nao le o nome (privacidade): so o local, sem "Cliente: |" */}
          {solicitacao.cliente?.nome ? `${t('clienteLabel')}: ${solicitacao.cliente.nome} | ${solicitacao.endereco || ''}` : solicitacao.endereco}
        </p>
      </div>

      {/* Quem paga o reparo (seguro?) */}
      <SeguroDoPedido sol={solicitacao as any} />

      {/* AI Insights */}
      {analise && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🤖</span>
            <h3 className="font-semibold text-indigo-900 text-sm">{t('analiseIA')}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              analise.severidade === 'leve' ? 'bg-green-100 text-green-700' :
              analise.severidade === 'moderado' ? 'bg-yellow-100 text-yellow-700' :
              analise.severidade === 'grave' ? 'bg-orange-100 text-orange-700' :
              'bg-red-100 text-red-700'
            }`}>{SEVERIDADE[analise.severidade] ? tDano(SEVERIDADE[analise.severidade]) : analise.severidade}</span>
          </div>
          <p className="text-sm text-indigo-800 mb-2 break-words">{resumoIA}</p>
          {analise.pecas_afetadas && analise.pecas_afetadas.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {pecasIA.map((p, i) => (
                <span key={i} className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded max-w-full break-words">{p}</span>
              ))}
            </div>
          )}
          {obsIA.length > 0 && (
            <ul className="list-disc pl-4 mb-2 space-y-0.5 text-xs text-indigo-800">
              {obsIA.map((o, i) => <li key={i} className="break-words">{o}</li>)}
            </ul>
          )}
          {analise.estimativa_custo && Number(analise.estimativa_custo.max) > 0 && (
            <EstimativaIA e={analise.estimativa_custo} moeda={moeda} compacto />
          )}
          <AvisoTraducao origem={trIA.origem} original={iaOriginal} alternar={() => setIaOriginal((o) => !o)} className="mt-2 !text-indigo-500" />
        </div>
      )}

      {/* noValidate: a validacao e nossa (caixa vermelha + texto do dono); o "min" da validade nao pode travar o envio calado */}
      <form onSubmit={handleSubmit} noValidate>
        {/* Orcamento feito em outro sistema: a IA preenche, a oficina confere */}
        <div className="card mb-6 border-2 border-dashed border-primary-200">
          <h2 className="text-base font-semibold text-gray-900 mb-1">{t('importarTitulo')}</h2>
          <p className="text-sm text-gray-600 mb-3">{t('importarTexto')}</p>
          {/* Dois botoes explicitos: no iPhone, o campo de arquivo escondido dentro
              de um rotulo as vezes nao devolvia a foto da camera e nada acontecia
              (teste do dono 09/10, ponto 7). Foto grande e reduzida antes de enviar. */}
          <input ref={refCamera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1}
            onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) lerDocumento(a); }} />
          <input ref={refArquivo} type="file" accept="image/*,application/pdf" className="sr-only" tabIndex={-1}
            onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) lerDocumento(a); }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={lendoDoc === 'lendo'} onClick={() => refCamera.current?.click()} className="btn-secondary !py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50">
              📷 {t('importarFoto')}
            </button>
            <button type="button" disabled={lendoDoc === 'lendo'} onClick={() => refArquivo.current?.click()} className="btn-secondary !py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50">
              📄 {t('importarArquivo')}
            </button>
          </div>
          {lendoDoc === 'lendo' && <p className="text-sm text-primary-700 mt-2" role="status">⏳ {t('importarLendo')}</p>}
          {docArquivo && <p className="text-xs text-gray-500 mt-2 break-all">{docArquivo.name}</p>}
          {lendoDoc === 'ok' && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2" role="status">{t('importarConfira')}</p>}
          {lendoDoc === 'erro' && <p className="text-sm text-red-700 mt-2" role="alert">{t('importarErro')}</p>}
          {lendoDoc === 'ocupada' && <p className="text-sm text-red-700 mt-2" role="alert">{t('importarOcupada')}</p>}
          {lendoDoc === 'grande' && <p className="text-sm text-red-700 mt-2" role="alert">{t('importarGrande')}</p>}
        </div>

        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('itensOrcamento')}</h2>
          {removidos.length > 0 && (
            <p data-testid="itens-removidos" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {tMud('itensRemovidos', { lista: removidos.map((o) => o.descricao).join(', ') })}
            </p>
          )}

          <div className="space-y-4">
            {itens.map((item, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">
                    {t('itemNumero', { numero: index + 1 })}
                    {estadoItem(item) && (
                      <span data-testid={`item-${estadoItem(item)}`} className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${estadoItem(item) === 'novo' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
                        {tMud(estadoItem(item) === 'novo' ? 'itemNovo' : 'itemAlterado')}
                      </span>
                    )}
                  </span>
                  {itens.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      {t('remover')}
                    </button>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      className="input-field"
                      placeholder={t('placeholderDescricaoItem')}
                      value={item.descricao}
                      onChange={(e) => updateItem(index, 'descricao', e.target.value)}
                    />
                  </div>
                  <div>
                    <select
                      className="input-field"
                      value={item.tipo}
                      onChange={(e) => updateItem(index, 'tipo', e.target.value)}
                    >
                      <option value="mao_de_obra">{t('maoDeObra')}</option>
                      <option value="peca">{t('peca')}</option>
                      <option value="material">{t('material')}</option>
                      <option value="outro">{t('outro')}</option>
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <CampoNumero
                        className="input-field"
                        placeholder={t('placeholderValor')}
                        aria-label={t('placeholderValor')}
                        decimal
                        vazioQuandoZero
                        value={item.valor_unitario}
                        onChange={(n) => updateItem(index, 'valor_unitario', n)}
                      />
                    </div>
                    <div className="w-20">
                      <CampoNumero
                        className="input-field"
                        placeholder={t('placeholderQtd')}
                        aria-label={t('placeholderQtd')}
                        min={1}
                        value={item.quantidade}
                        onChange={(n) => updateItem(index, 'quantidade', n)}
                      />
                    </div>
                  </div>
                </div>
                {item.valor_unitario > 0 && (
                  <p className="text-sm text-gray-500 mt-2 text-right">
                    {t('subtotal')}: {formatCurrency(item.valor_unitario * item.quantidade, moeda, locale)}
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors"
          >
            {t('adicionarItem')}
          </button>

          {/* Total */}
          <div className="flex justify-between items-center mt-6 pt-4 border-t">
            <span className="text-lg font-semibold text-gray-900">{t('total')}</span>
            <span className="text-2xl font-bold text-gray-900">{formatCurrency(total, moeda, locale)}</span>
          </div>

          {/* Sem comissao (fase de fundadores ou oferta individual): nada a absorver/repassar */}
          {total > 0 && semComissao && (
            <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                {t('semComissaoOrcamento')}
              </div>
            </div>
          )}

          {/* Commission section */}
          {total > 0 && comissaoInfo && !semComissao && (
            <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-blue-800">{t('comissaoBipfix')}</span>
                </div>
                <p className="text-sm text-blue-700">
                  {t('comissaoDaPlataforma')}{' '}
                  {valorFixoComissao == null && <><strong>{COMISSAO_PERCENTUAL}%</strong> = </>}
                  <strong>{formatCurrency(comissaoValor, moeda, locale)}</strong>
                </p>
              </div>

              <p className="text-sm text-gray-600">{t('comissaoPagaNoFim', { valor: formatCurrency(comissaoValor, moeda, locale), total: formatCurrency(total, moeda, locale) })}</p>
            </div>
          )}
        </div>

        {/* Prazo & Execucao */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('prazoExecucao')}</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <label htmlFor="cacb1-101" className="block text-sm font-medium text-gray-700">
                  {t('prazoTotalDias')}
                </label>
                <InfoI rotulo={t('infoRotulo', { campo: t('prazoTotalDias') })} texto={t('info_prazoTotalDias')} testid="info-prazo" />
              </div>
              <CampoNumero id="cacb1-101"
                className="input-field"
                min={1}
                value={prazoDias}
                onChange={setPrazoDias}
                aria-describedby="cacb1-101-ajuda"
              />
              <p id="cacb1-101-ajuda" className="text-xs text-gray-500 mt-1">{t('prazoTotalDiasAjuda')}</p>
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <label htmlFor="cacb1-102" className="block text-sm font-medium text-gray-700">
                  {t('tempoExecucaoHoras')}
                </label>
                <InfoI rotulo={t('infoRotulo', { campo: t('tempoExecucaoHoras') })} texto={t('info_tempoExecucaoHoras')} testid="info-tempo" />
              </div>
              <CampoNumero id="cacb1-102"
                className="input-field"
                min={1}
                value={tempoExecucaoHoras}
                onChange={setTempoExecucaoHoras}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('diasUteis', { count: Math.ceil(tempoExecucaoHoras / 8) })}
              </p>
            </div>
            <div ref={refValidade} data-testid="campo-validade">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <label htmlFor="cacb1-103" className="block text-sm font-medium text-gray-700">
                  {t('validadeOrcamento')} <span className="text-red-600" aria-hidden="true">*</span>
                </label>
                <InfoI rotulo={t('infoRotulo', { campo: t('validadeOrcamento') })} texto={t('info_validadeOrcamento')} testid="info-validade" />
              </div>
              <input id="cacb1-103"
                type="date"
                aria-required="true"
                className={`input-field ${erroVal ? '!border-red-400 bg-red-50' : ''}`}
                aria-invalid={!!erroVal || undefined}
                aria-describedby={erroVal ? 'erro-validade' : ultimaData ? 'dica-validade' : undefined}
                min={validadeMin}
                value={validade}
                onChange={(e) => { setValidade(e.target.value); if (erroVal && !erroValidade(e.target.value, solicitacao.status !== 'em_andamento' ? slots.map((s) => s.data) : [], hojeOf)) setErroVal(null); }}
              />
              {erroVal ? (
                <div id="erro-validade" role="alert" data-testid="erro-validade" data-tipo={erroVal} className="mt-1 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                  <p>⛔ {erroVal === 'antes'
                    ? t('validadeAntesErro', { ultima: fmtCurta(ultimaData), recomendada: fmtCurta(validadeRecomendada), dias: VALIDADE_FOLGA_DIAS })
                    : erroVal === 'passado' ? t('validadePassadoErro')
                      : ultimaData ? t('validadeVaziaErroComData', { ultima: fmtCurta(ultimaData), recomendada: fmtCurta(validadeRecomendada), dias: VALIDADE_FOLGA_DIAS })
                        : t('validadeVaziaErro')}</p>
                  {validadeRecomendada && (
                    <button type="button" data-testid="usar-validade-recomendada" onClick={() => { setValidade(validadeRecomendada); setErroVal(null); }}
                      className="mt-1.5 min-h-[40px] rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-800 hover:bg-red-100">{t('validadeUsar', { data: fmtCurta(validadeRecomendada) })}</button>
                  )}
                </div>
              ) : ultimaData ? (
                <p id="dica-validade" className="text-xs text-gray-500 mt-1" data-testid="dica-validade">{t('validadeDica', { ultima: fmtCurta(ultimaData), recomendada: fmtCurta(validadeRecomendada) })}</p>
              ) : null}
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <label htmlFor="orc-garantia" className="block text-sm font-medium text-gray-700">{t('garantia')}</label>
                <InfoI rotulo={t('infoRotulo', { campo: t('garantia') })} texto={t('info_garantia')} testid="info-garantia" />
              </div>
              <select id="orc-garantia" className="input-field" value={garantiaOutra || !garantiaPronta ? 'outra' : garantiaDias}
                onChange={(e) => {
                  if (e.target.value === 'outra') { setGarantiaOutra(true); if (garantiaPronta) setGarantiaDias(''); }
                  else { setGarantiaOutra(false); setGarantiaDias(e.target.value); }
                }}>
                <option value="">{t('garantiaNaoInformada')}</option>
                <option value="0">{t('garantiaSem')}</option>
                {[30, 90, 180, 365, 730].map((d) => <option key={d} value={d}>{t(`garantia_${d}`)}</option>)}
                <option value="outra">{t('garantiaOutra')}</option>
              </select>
              {(garantiaOutra || !garantiaPronta) && (
                <input id="orc-garantia-dias" type="number" inputMode="numeric" min={1} max={3650} step={1} className="input-field mt-2"
                  aria-label={t('garantiaDiasCampo')} placeholder={t('garantiaDiasCampo')} value={garantiaDias}
                  onChange={(e) => setGarantiaDias(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              )}
              <p className="text-xs text-gray-500 mt-1">{t('garantiaAjuda')}</p>
            </div>
          </div>
          {/* muitos dias para pouco trabalho: quase sempre e a validade posta no prazo
              (1o orcamento real, 03/11: 30 dias para 2 h - o cliente le "conserto: 30 dias") */}
          {prazoDias >= 10 && tempoExecucaoHoras <= prazoDias * 2 && (
            <p role="status" data-testid="aviso-prazo-longo" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {t('prazoLongoAviso', { dias: prazoDias, horas: tempoExecucaoHoras })}
            </p>
          )}
        </div>

        {/* Disponibilidade (na proposta de revisao a data ja esta marcada) */}
        {modoRevisaoAceito ? null : solicitacao.status === 'em_andamento' ? (
          <div className="card mb-6">
            <div className="bg-blue-50 rounded-lg p-4 flex items-center gap-3">
              <span className="text-2xl">🔧</span>
              <div>
                <p className="font-semibold text-blue-800">{t('veiculoJaNaOficina')}</p>
                <p className="text-sm text-blue-600">{t('checkinJaRealizado')}</p>
              </div>
            </div>
          </div>
        ) : (
          <div ref={refCheckin} className={`card mb-6 ${erroSemCheckin ? 'ring-2 ring-red-300' : ''}`} data-testid="cartao-checkin">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">{t('disponibilidadeCheckin')} <span className="text-red-600" aria-hidden="true">*</span></h2>
              <InfoI rotulo={t('infoRotulo', { campo: t('disponibilidadeCheckin') })} texto={t('info_checkin')} testid="info-checkin" />
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {t('ofereceDatas')}
            </p>

            {erroHorario && <p className="text-sm text-red-700 mb-3" role="alert" data-testid="erro-horario-passado">{t('horarioPassado')}</p>}
            <SeletorCheckin linhas={slots} aoMudar={mudarSlots} ctx={ctxOficina} pais={paisF} prazoDias={prazoDias} erro={erroSemCheckin} testid="ck" />
            {erroSemCheckin && <p role="alert" className="mt-2 text-sm font-medium text-red-700" data-testid="erro-sem-checkin">⛔ {t('erroSemCheckin')}</p>}
            {diasOferecidos < 2 && (
              <p role="status" data-testid="dica-mais-datas" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">💡 {t('dicaMaisDatas')}</p>
            )}
          </div>
        )}

        {/* Observacoes */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('observacoes')}</h2>
          <div className="mt-4">
            <label htmlFor="cacb1-104" className="block text-sm font-medium text-gray-700 mb-1">
              {t('observacoesOpcional')}
            </label>
            <textarea id="cacb1-104"
              className="input-field min-h-[80px]"
              placeholder={t('placeholderObservacoes')}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>

        {erroDiaFechado && temDiaFechado && (
          <div ref={rolarAteAqui} role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="erro-dia-fechado">
            <p>{t('erroDiaFechadoEnvio')}</p>
            <LinkHorarioPerfil testid="link-horario-envio" />
          </div>
        )}
        {erroEnvio && <p ref={rolarAteAqui} role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="erro-envio-orcamento">{erroEnvio}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            {t('cancelar')}
          </button>
          <button type="submit" className="btn-success disabled:opacity-60" disabled={enviandoOrc} aria-busy={enviandoOrc} data-testid="enviar-orcamento">
            {enviandoOrc ? t('enviandoOrcamento') : <>{modoRevisaoAceito ? t('enviarRevisao') : ehRevisao ? t('atualizarOrcamento') : t('enviarOrcamento')} - {formatCurrency(total, moeda, locale)}</>}
          </button>
        </div>
      </form>
      </>)}
    </div>
  );
}
