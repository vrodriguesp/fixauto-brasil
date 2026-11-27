import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image, Linking, RefreshControl, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useFocusEffect, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatDate, currencyForCountry } from '@fixauto/shared';
import { tDias } from '../../i18n';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { useAvisos } from '../../lib/avisos';
import { TextoTraduzido } from '../../lib/traducao';
import { limparDescricao } from '../../lib/texto';
import { rotuloTipoOficina } from '../../lib/rotulo-pedido';
import { orcamentoVencido } from '../../lib/orcamento-validade';
import { urlAssinada } from '../../lib/midia';
import { formatarJanela, janelaDoSlot, janelaDaAgenda, semQuebra } from '../../lib/turnos';
import { fusoDoPais } from '../../lib/fuso';
import { confirmar } from '../../lib/confirmar';
import SemRede from '../../components/SemRede';
import { abrirNoSite, urlPedidoNoSite, urlOrcamentoNoSite } from '../../lib/links-site';
import { ehAcidente, type Dispensa } from '../../lib/caixa-pedidos';

// motivos de "nao tenho interesse" (migracao 070; mesmos do site, components/oficina/DispensarPedido.tsx)
const MOTIVOS_DISPENSA = ['nao_faz', 'faz_parte', 'sem_agenda', 'longe', 'outro'] as const;
const ABERTO = ['aberta', 'em_orcamento'];

// Pedido visto pela OFICINA (27/11): espelho de apps/web/src/app/[locale]/oficina/pedidos/[id]/page.tsx.
// Nome, rua e telefone do cliente so depois do aceite (102/086); antes: "Cliente · codigo" e a area (~1 km).
export default function PedidoOficinaScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { oficina, funcionario } = useAuth();
  const { chegou } = useAvisos();
  const [sol, setSol] = useState<any | null | undefined>(undefined);
  const [fotos, setFotos] = useState<{ id: string; url: string; origem?: string | null }[]>([]);
  const [telefone, setTelefone] = useState<string | null>(null);
  const [dispensa, setDispensa] = useState<Dispensa | null>(null);
  const [pedemDatas, setPedemDatas] = useState(false);
  const [agenda, setAgenda] = useState<{ inicio: string; ate: string | null } | null>(null);
  const [puxando, setPuxando] = useState(false);
  const [semRede, setSemRede] = useState(false);

  const carregar = useCallback(async () => {
    if (!id || !oficina) return;
    const { data, error } = await supabase.from('solicitacoes')
      .select('*, veiculo:veiculos(*), fotos:solicitacao_fotos(id, foto_url, origem, created_at), convites:pedido_convites(oficina_id, origem), privado:solicitacoes_privado(endereco), orcamentos(*, itens:orcamento_itens(*), disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*))')
      .eq('id', id).maybeSingle();
    // erro de leitura (sem rede) nao e "pedido nao encontrado" (M6): mantem a tela e oferece tentar de novo
    if (error) { setSemRede(true); setPuxando(false); return; }
    setSemRede(false);
    if (!data) { setSol(null); setPuxando(false); return; }
    const s: any = data;
    // nome/codigo do cliente (resumo por pedido, 102) e telefone so com orcamento aceito (contato_clientes, 086)
    const [{ data: resumo }, { data: contato }, { data: disp }, { data: datas }, { data: ag }] = await Promise.all([
      supabase.rpc('resumo_clientes_pedidos', { p_sols: [s.id] }),
      supabase.rpc('contato_clientes', { p_sols: [s.id] }),
      supabase.from('pedido_dispensas').select('solicitacao_id, motivo, comentario, created_at').eq('solicitacao_id', s.id).eq('oficina_id', oficina.id).maybeSingle(),
      supabase.from('orcamento_pedido_datas').select('id').eq('solicitacao_id', s.id).eq('oficina_id', oficina.id).eq('status', 'pendente').limit(1),
      supabase.from('agenda').select('data_inicio, checkin_ate').eq('solicitacao_id', s.id).eq('oficina_id', oficina.id).in('status', ['agendado', 'em_andamento']).limit(1).maybeSingle(),
    ]);
    const r = ((resumo as any[]) || [])[0];
    const c = ((contato as any[]) || [])[0];
    s.cliente = r ? { ...r, telefone: c?.telefone ?? null } : (c ? { telefone: c.telefone } : null);
    const priv = Array.isArray(s.privado) ? s.privado[0] : s.privado;
    if (priv?.endereco) s.endereco = priv.endereco;
    setSol(s);
    setDispensa((disp as Dispensa) || null);
    setPedemDatas(((datas as any[]) || []).length > 0);
    setAgenda(ag ? { inicio: (ag as any).data_inicio, ate: (ag as any).checkin_ate ?? null } : null);
    // telefone: do contato liberado, do acidente "podem me ligar" (074) ou o que o motorista enviou (081)
    let tel: string | null = c?.telefone || null;
    if (!tel && s.emergencia_id) { const { data: ta } = await supabase.rpc('telefone_acidente', { p_sol: s.id }); tel = (ta as string) || null; }
    if (!tel) { const { data: te } = await supabase.from('telefone_compartilhado').select('telefone').eq('solicitacao_id', s.id).eq('oficina_id', oficina.id).maybeSingle(); tel = (te as any)?.telefone || null; }
    setTelefone(tel);
    const lista: { id: string; url: string; origem?: string | null }[] = [];
    for (const f of (s.fotos || []) as any[]) { const u = await urlAssinada(f.foto_url); if (u) lista.push({ id: f.id, url: u, origem: f.origem }); }
    setFotos(lista);
    setPuxando(false);
    // a oficina abriu o pedido: deixa de ser "novo" na caixa (pedido_vistos, como no site)
    supabase.from('pedido_vistos').upsert({ solicitacao_id: s.id, oficina_id: oficina.id }, { onConflict: 'solicitacao_id,oficina_id', ignoreDuplicates: true }).then(() => {});
  }, [id, oficina?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => { if (chegou) carregar(); }, [chegou]); // eslint-disable-line react-hooks/exhaustive-deps

  const moeda = currencyForCountry(oficina?.pais ?? null);
  const fuso = fusoDoPais(oficina?.pais ?? null);
  const fmtDiaAg = useMemo(() => new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: fuso }), [i18n.language, fuso]);
  const fmtDia = useMemo(() => new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }), [i18n.language]);

  if (sol === undefined && semRede) return <SemRede aoTentar={carregar} />;
  if (sol === undefined) return <View className="flex-1 items-center justify-center bg-white"><ActivityIndicator color="#2563eb" /></View>;
  if (sol === null) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-6">
        <Text className="text-gray-700 text-center">{t('oficina.pedidoNaoEncontrado')}</Text>
      </View>
    );
  }

  const v = sol.veiculo;
  const meu = (sol.orcamentos || []).find((o: any) => o.oficina_id === oficina?.id);
  const aceito = meu?.status === 'aceito';
  const emAndamento = sol.status === 'em_andamento';
  const liberado = aceito || emAndamento || sol.status === 'concluida';
  const vencido = !!meu && ['enviado', 'visualizado'].includes(meu.status) && orcamentoVencido(meu.validade, oficina?.pais);
  // perdido = o cliente escolheu outra oficina (ou o carro ja esta la): fechado para mim (M13)
  const perdido = ['aceita', 'em_andamento'].includes(sol.status) && !aceito;
  const fechado = ['concluida', 'cancelada', 'expirada'].includes(sol.status) || perdido;
  const convidada = !!oficina && !!sol.convites?.some((c: any) => c.oficina_id === oficina.id && c.origem !== 'tipo_alterado');
  const acidente = ehAcidente(sol);
  const slot = meu?.disponibilidade?.find((d: any) => d.id === meu.disponibilidade_escolhida_id);
  const chegada = agenda ? t('oficina.chegaEm', { dia: fmtDiaAg.format(new Date(agenda.inicio)), periodo: formatarJanela(janelaDaAgenda(agenda.inicio, agenda.ate, oficina?.pais ?? null)) })
    : slot ? t('oficina.chegaEm', { dia: fmtDia.format(new Date(`${slot.data_checkin}T12:00:00Z`)), periodo: formatarJanela(janelaDoSlot(slot)) }) : '';
  const abrirConversa = () => router.push({ pathname: '/conversa/[id]', params: { id: sol.id, oficina: oficina!.id } });
  // botao principal: orcar (sem orcamento) / alterar (enviado, recusado, vencido) / revisao do aceito = site (v2)
  // equipe nao orca (a RLS so deixa a conta da dona): sem o botao (revisao Fable S4)
  const podeOrcar = !fechado && (!meu || !aceito) && !emAndamento && !funcionario;

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={puxando} onRefresh={() => { setPuxando(true); carregar(); }} />}>
      <Stack.Screen options={{ title: sol.numero ? t('constants.numeroPedido', { n: sol.numero }) : t('oficina.pedidoTitulo') }} />
      <View className="flex-row items-center gap-2 flex-wrap">
        {acidente ? <Text className="text-xs font-bold text-white bg-red-600 rounded px-1.5 py-0.5">🚨 {t('oficina.acidente')}</Text> : null}
        <Text className="text-xs font-semibold text-gray-700 bg-gray-200 rounded-full px-2 py-0.5">{t(`constants.statusSolicitacao.${sol.status}`, { defaultValue: sol.status })}</Text>
        <Text className={`text-xs font-semibold rounded-full px-2 py-0.5 ${sol.urgencia === 'alta' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>{t('oficina.urgencia')}: {t(`constants.urgencias.${sol.urgencia}`, { defaultValue: sol.urgencia })}</Text>
      </View>
      <Text className="text-2xl font-bold text-gray-900 mt-2">{v?.fipe_marca ? `${v.fipe_marca} ${v.fipe_modelo || ''}`.trim() : rotuloTipoOficina(t, sol.tipo, sol.descricao)}</Text>
      <Text className="text-gray-600">{rotuloTipoOficina(t, sol.tipo, sol.descricao)}{v?.fipe_ano ? ` · ${v.fipe_ano}` : ''}{v?.placa ? ` · ${v.placa}` : ''}</Text>
      {convidada ? (
        <View className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <Text className="text-xs font-semibold text-indigo-900">📨 {t('oficina.convidada')}</Text>
          <Text className="text-sm text-indigo-950 mt-1">{t('oficina.convidadaTexto')}</Text>
        </View>
      ) : null}

      {/* acoes principais: orcar e conversar */}
      <View className="flex-row gap-2 mt-4">
        {podeOrcar ? (
          <Pressable onPress={() => router.push(`/orcamento/${sol.id}`)} accessibilityRole="button" testID="btn-orcar"
            className={`flex-1 rounded-xl min-h-[48px] items-center justify-center ${meu ? 'border border-primary-600 bg-white' : 'bg-primary-600'}`}>
            <Text className={`font-semibold text-base ${meu ? 'text-primary-700' : 'text-white'}`}>{meu ? t('oficina.modificarOrcamento') : t('oficina.fazerOrcamento')}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={abrirConversa} accessibilityRole="button" testID="btn-mensagem" className="flex-1 rounded-xl min-h-[48px] items-center justify-center bg-primary-50 border border-primary-200 flex-row gap-2">
          <Ionicons name="chatbubble-outline" size={18} color="#1d4ed8" />
          <Text className="font-semibold text-primary-700">{t('oficina.mensagem')}</Text>
        </Pressable>
      </View>

      {/* cliente aceitou: chegada e contato */}
      {aceito ? (
        <View className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <Text className="font-semibold text-emerald-900">✔ {t('oficina.clienteAceitou')}</Text>
          {chegada ? <Text className="text-emerald-900 mt-1">{semQuebra(chegada)}</Text> : null}
        </View>
      ) : null}
      {pedemDatas && meu && ['enviado', 'visualizado'].includes(meu.status) ? (
        <View className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4" testID="selo-novas-datas">
          <Text className="font-semibold text-amber-900">📅 {t('oficina.novasDatasPedidas')}</Text>
          <Text className="text-sm text-amber-900 mt-1">{t('oficina.novasDatasPedidasTexto')}</Text>
          <Pressable onPress={() => abrirNoSite(urlPedidoNoSite(i18n.language, sol.id))} accessibilityRole="button" testID="abrir-no-site-datas" className="mt-2 self-start border border-amber-700 rounded-lg px-3 py-2"><Text className="text-amber-900 font-semibold">{t('oficina.abrirNoSite')}</Text></Pressable>
        </View>
      ) : null}

      {/* meu orcamento */}
      {meu ? (
        <View className="mt-4 bg-white rounded-xl border-2 border-primary-100 p-4" testID="meu-orcamento">
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold text-gray-900">{t('oficina.seuOrcamento')}</Text>
            <Text className={`text-xs font-semibold rounded-full px-2 py-0.5 ${vencido ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>{vencido ? t('oficina.statusOrcamento.expirado') : t(`oficina.statusOrcamento.${meu.status}`, { defaultValue: meu.status })}</Text>
          </View>
          {meu.status === 'recusado' && meu.recusado_motivo ? <Text className="mt-2 text-sm text-gray-800 bg-gray-50 rounded-lg p-2">{t('oficina.recusaMotivo', { motivo: t(`oficina.recusaMotivos.${meu.recusado_motivo}`, { defaultValue: meu.recusado_motivo }) })}</Text> : null}
          {/* vencido com o pedido ainda aberto: "altere" (botao acima); pedido fechado/vencido: so explica (M4) */}
          {vencido && !fechado ? <Text className="mt-2 text-sm text-red-800 bg-red-50 rounded-lg p-2">{t('oficina.orcamentoVencidoTexto', { data: formatDate(meu.validade, i18n.language) })}</Text> : null}
          {fechado && !aceito ? <Text className="mt-2 text-sm text-gray-700 bg-gray-50 rounded-lg p-2" testID="pedido-fechado">{t(perdido ? 'oficina.outraOficina' : 'oficina.bloqueado_fechado')}</Text> : null}
          <Text className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(Number(meu.valor_total), moeda, i18n.language)}</Text>
          <Text className="text-sm text-gray-600">{tDias(t, 'oficina.prazoDias', Number(meu.prazo_dias))} · {t('oficina.validadeAte', { data: formatDate(meu.validade, i18n.language) })}</Text>
          {(meu.itens || []).length ? (
            <View className="mt-3 border-t border-gray-100 pt-2">
              {meu.itens.map((it: any) => (
                <View key={it.id} className="flex-row justify-between gap-3 py-1">
                  <Text className="text-sm text-gray-700 flex-1">{it.quantidade > 1 ? `${it.quantidade}× ` : ''}{it.descricao}</Text>
                  <Text className="text-sm text-gray-900">{formatCurrency(Number(it.valor_total), moeda, i18n.language)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {(meu.disponibilidade || []).length ? (
            <View className="mt-2 border-t border-gray-100 pt-2">
              <Text className="text-xs font-semibold text-gray-700 mb-1">{t('oficina.datasOferecidas')}</Text>
              {meu.disponibilidade.map((d: any) => (
                <Text key={d.id} className={`text-sm ${d.id === meu.disponibilidade_escolhida_id ? 'text-emerald-800 font-semibold' : 'text-gray-700'}`}>{fmtDia.format(new Date(`${d.data_checkin}T12:00:00Z`))} · {formatarJanela(janelaDoSlot(d))}{d.id === meu.disponibilidade_escolhida_id ? ' ✔' : ''}</Text>
              ))}
            </View>
          ) : null}
          {limparDescricao(meu.observacoes) ? <Text className="text-sm text-gray-600 mt-3">{limparDescricao(meu.observacoes)}</Text> : null}
          {aceito && !fechado ? (
            <View className="mt-3">
              <Text className="text-xs text-gray-500">{t('oficina.revisaoNoSite')}</Text>
              <Pressable onPress={() => abrirNoSite(urlOrcamentoNoSite(i18n.language, sol.id))} accessibilityRole="button" testID="abrir-no-site-revisao" className="mt-2 self-start border border-primary-600 rounded-lg px-3 py-2"><Text className="text-primary-700 font-semibold">{t('oficina.abrirNoSite')}</Text></Pressable>
            </View>
          ) : null}
          {sol.status === 'concluida' && aceito ? <Text className="text-sm text-gray-600 mt-3">{t('oficina.orcamentoFechadoEntregue')}</Text> : null}
        </View>
      ) : null}

      {/* "nao tenho interesse" (070) */}
      {!meu && oficina && ABERTO.includes(sol.status) && funcionario?.cargo !== 'mecanico' ? (
        <Dispensar solicitacaoId={sol.id} oficinaId={oficina.id} dispensa={dispensa} aoMudar={carregar} />
      ) : null}

      {/* o que o motorista pediu */}
      <View className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
        <Text className="font-semibold text-gray-900 mb-1">{t('oficina.descricaoDoProblema')}</Text>
        <TextoTraduzido texto={limparDescricao(sol.descricao)} className="text-gray-700" />
        {sol.preferencia_horario?.dias?.length || sol.preferencia_horario?.partes?.length || sol.preferencia_horario?.opcao ? (
          <Text className="text-sm text-gray-600 mt-3">🕒 {t('oficina.preferenciaMotorista')}: {[
            sol.preferencia_horario.opcao === 'urgente' ? t('oficina.prefUrgente') : sol.preferencia_horario.opcao === 'qualquer' ? t('oficina.prefQualquerDia') : (sol.preferencia_horario.dias || []).map((d: number) => t(`oficina.diaSemana_${d}`)).join(', '),
            (sol.preferencia_horario.partes || []).map((p: string) => t(`oficina.${p}`)).join(' / '),
          ].filter(Boolean).join(' · ')}</Text>
        ) : null}
      </View>

      {fotos.length ? (
        <View className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
          <Text className="font-semibold text-gray-900 mb-2">{t('oficina.fotosCount', { count: fotos.length })}</Text>
          <View className="flex-row flex-wrap gap-2">
            {fotos.map((f) => (
              <Pressable key={f.id} onPress={() => Linking.openURL(f.url)} accessibilityRole="imagebutton" className="relative">
                <Image source={{ uri: f.url }} style={{ width: 104, height: 104, borderRadius: 10, backgroundColor: '#e5e7eb' }} />
                {f.origem === 'adicionada' ? <Text className="absolute bottom-1 left-1 text-[10px] font-semibold text-white bg-primary-600 rounded px-1">{t('oficina.fotoNova')}</Text> : null}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* carro */}
      <View className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
        <Text className="font-semibold text-gray-900 mb-2">{t('oficina.informacoesDoVeiculo')}</Text>
        {v?.fipe_marca ? (
          <>
            <Linha k={t('oficina.marca')} v={v.fipe_marca} />
            <Linha k={t('oficina.modelo')} v={v.fipe_modelo} />
            <Linha k={t('oficina.ano')} v={v.fipe_ano} />
            {v.placa ? <Linha k={t('oficina.placa')} v={v.placa} /> : null}
            {v.cor ? <Linha k={t('oficina.cor')} v={v.cor} /> : null}
          </>
        ) : <Text className="text-sm text-gray-400">{t('oficina.dadosVeiculoIndisponiveis')}</Text>}
      </View>

      {/* cliente */}
      <View className="mt-4 bg-white rounded-xl border border-gray-200 p-4" testID="cartao-cliente">
        <Text className="font-semibold text-gray-900 mb-2">{t('oficina.cliente')}</Text>
        <Text className="text-gray-900 font-medium">{sol.cliente?.nome || (sol.cliente?.codigo ? `${t('oficina.cliente')} · ${sol.cliente.codigo}` : t('oficina.cliente'))}</Text>
        <Text className="text-sm text-gray-500">{liberado ? sol.endereco : (sol.area || '')}</Text>
        {!liberado ? <Text className="text-xs text-gray-400 mt-1">{t('oficina.nomeAposAceite')}</Text> : null}
        <Text className="text-xs text-gray-500 mt-2">{t('oficina.solicitadoEm', { data: formatDate(sol.created_at, i18n.language) })}</Text>
        {telefone ? (
          <Pressable onPress={() => Linking.openURL(`tel:${telefone.replace(/\s/g, '')}`)} accessibilityRole="button" testID="ligar-cliente"
            className="mt-3 bg-primary-600 rounded-xl min-h-[48px] items-center justify-center">
            <Text className="text-white font-semibold">📞 {t('oficina.ligarCliente')}</Text>
            <Text className="text-white text-sm">{telefone}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Linha({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-sm text-gray-500">{k}</Text>
      <Text className="text-sm text-gray-900">{v || '-'}</Text>
    </View>
  );
}

// "Nao tenho interesse" (070): a oficina diz o motivo e o pedido sai de "Para responder"; pode voltar atras.
function Dispensar({ solicitacaoId, oficinaId, dispensa, aoMudar }: { solicitacaoId: string; oficinaId: string; dispensa: Dispensa | null; aoMudar: () => void }) {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<string>('');
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (!motivo || salvando) return;
    setSalvando(true);
    const { error } = await supabase.from('pedido_dispensas').upsert({ solicitacao_id: solicitacaoId, oficina_id: oficinaId, motivo, comentario: comentario.trim().slice(0, 500) || null }, { onConflict: 'solicitacao_id,oficina_id' });
    setSalvando(false);
    if (!error) { setAberto(false); aoMudar(); }
  };
  const desfazer = () => confirmar(t('oficina.voltarAtras'), '', [
    { text: t('common.cancelar'), style: 'cancel' },
    { text: t('oficina.voltarAtras'), onPress: async () => { await supabase.from('pedido_dispensas').delete().eq('solicitacao_id', solicitacaoId).eq('oficina_id', oficinaId); aoMudar(); } },
  ]);
  if (dispensa) {
    return (
      <View className="mt-4 rounded-xl border border-gray-200 bg-gray-100 p-3 flex-row items-center justify-between gap-2" testID="dispensado">
        <Text className="text-sm text-gray-700 flex-1">{t('oficina.voceDispensou', { motivo: t(`oficina.motivo_${dispensa.motivo}`, { defaultValue: dispensa.motivo }) })}</Text>
        <Pressable onPress={desfazer} accessibilityRole="button" className="px-3 py-2"><Text className="text-primary-700 font-medium">{t('oficina.voltarAtras')}</Text></Pressable>
      </View>
    );
  }
  if (!aberto) {
    return (
      <Pressable onPress={() => setAberto(true)} accessibilityRole="button" testID="btn-dispensar" className="mt-3 self-start px-2 py-2">
        <Text className="text-gray-600 underline">{t('oficina.naoTenhoInteresse')}</Text>
      </Pressable>
    );
  }
  return (
    <View className="mt-3 bg-white rounded-xl border border-gray-200 p-4" testID="dispensar-form">
      <Text className="font-semibold text-gray-900">{t('oficina.dispensarTitulo')}</Text>
      <Text className="text-sm text-gray-600 mt-1 mb-3">{t('oficina.dispensarAjuda')}</Text>
      {MOTIVOS_DISPENSA.map((m) => (
        <Pressable key={m} onPress={() => setMotivo(m)} accessibilityRole="radio" accessibilityState={{ checked: motivo === m }} testID={`motivo-${m}`}
          className="flex-row items-center gap-3 py-2.5">
          <Ionicons name={motivo === m ? 'radio-button-on' : 'radio-button-off'} size={22} color={motivo === m ? '#2563eb' : '#9ca3af'} />
          <Text className="text-gray-800 flex-1">{t(`oficina.motivo_${m}`)}</Text>
        </Pressable>
      ))}
      <TextInput value={comentario} onChangeText={setComentario} placeholder={t('oficina.comentarioOpcional')} multiline
        className="border border-gray-300 rounded-xl px-3 py-2 text-[16px] mt-2" style={{ minHeight: 60 }} />
      <View className="flex-row gap-2 mt-3">
        <Pressable onPress={() => setAberto(false)} accessibilityRole="button" className="flex-1 border border-gray-300 rounded-xl min-h-[44px] items-center justify-center"><Text className="text-gray-800 font-medium">{t('common.cancelar')}</Text></Pressable>
        <Pressable onPress={salvar} disabled={!motivo || salvando} accessibilityRole="button" testID="confirmar-dispensa"
          className="flex-1 bg-primary-600 rounded-xl min-h-[44px] items-center justify-center" style={{ opacity: !motivo || salvando ? 0.5 : 1 }}>
          <Text className="text-white font-semibold">{t('common.confirmar')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
