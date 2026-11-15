import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { mensagemErro } from '../lib/erro';
import { hojeLocal, faixasDoDia, turnoDaJanela, janelaDaSugestao, formatarJanela, LEGADO, semQuebra, type Turno, type ContextoOficina } from '../lib/turnos';

// "Tenho interesse, peca novas datas" (migracao 079, igual ao site components/cliente/PedirNovasDatas):
// todas as datas do orcamento ja passaram. Ate 3 sugestoes (dia + manha/tarde) dos proximos 14 dias a partir
// de amanha, no fuso da OFICINA (igual ao servidor),
// sem domingo e sem os dias em que a oficina esta fechada; mensagem opcional de ate 300 caracteres.
// Com pedido pendente: "Pedido enviado em ..., aguardando a oficina".
const DIAS = 14;
const MAX = 3;
const MSG_MAX = 300;
const CHAVE_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
type Sug = { data: string; turno: Turno };
type Pedido = { id: string; created_at: string; sugestoes: Sug[] };
const somar = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Check-in v2: cada turno ja mostra a faixa que vai valer se a oficina confirmar (1a faixa do perfil dela nesse
// turno, igual ao site; e so previa, a verdade e gravada na confirmacao); turno sem faixa nesse dia nao aparece.
export default function PedirNovasDatas({ orcamentoId, pais, horario, ctx: ctxProp }: { orcamentoId: string; pais?: string | null; horario?: Record<string, { aberto?: boolean }> | null; ctx?: ContextoOficina | null }) {
  const ctx: ContextoOficina = ctxProp ?? { horario: horario as ContextoOficina['horario'] };
  const { t, i18n } = useTranslation();
  const loc = i18n.language === 'pt' ? 'pt-BR' : i18n.language;
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [carregou, setCarregou] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [escolhidas, setEscolhidas] = useState<Sug[]>([]);
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('orcamento_pedido_datas').select('id, created_at, sugestoes').eq('orcamento_id', orcamentoId).eq('status', 'pendente').maybeSingle();
    setPedido((data as Pedido) || null);
    setCarregou(true);
  }, [orcamentoId]);
  useEffect(() => { carregar(); }, [carregar]);

  const diaTxt = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(loc, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const turnoTxt = (tu: Turno, d?: string) => `${t(`novasDatas.${tu}`)} ${formatarJanela(d ? janelaDaSugestao(d, tu, ctx) : LEGADO[tu])}`;

  const dias = useMemo(() => {
    const hoje = hojeLocal(new Date(), pais ?? null);
    const out: { data: string; turnos: Turno[] }[] = [];
    for (let i = 1; i <= DIAS; i++) {
      const d = somar(hoje, i);
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (dow === 0) continue;
      const h = horario?.[CHAVE_DIA[dow]];
      if (h && h.aberto === false) continue;
      const fs = faixasDoDia(d, ctx);
      const turnos = (['manha', 'tarde'] as Turno[]).filter((tu) => fs.some((j) => turnoDaJanela(j) === tu));
      if (turnos.length) out.push({ data: d, turnos });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx vem do orcamento (estavel por render)
  }, [horario, pais, ctxProp?.recepcao_inicio, ctxProp?.recepcao_fim, ctxProp?.almoco_inicio, ctxProp?.almoco_fim]);

  const marcada = (s: Sug) => escolhidas.some((x) => x.data === s.data && x.turno === s.turno);
  const alternar = (s: Sug) => setEscolhidas((l) => (marcada(s) ? l.filter((x) => !(x.data === s.data && x.turno === s.turno)) : l.length >= MAX ? l : [...l, s]));

  const enviar = async () => {
    if (enviando) return;
    Keyboard.dismiss();
    setEnviando(true); setErro('');
    try {
      await apiFetch(`/api/orcamento/${orcamentoId}/pedir-datas`, { method: 'POST', body: JSON.stringify({ sugestoes: escolhidas, mensagem: mensagem.trim() || undefined }) });
      setAberto(false); setEscolhidas([]); setMensagem('');
      await carregar();
    } catch (e) {
      setErro(mensagemErro(e));
      await carregar();
    } finally {
      setEnviando(false);
    }
  };

  if (!carregou) return null;

  if (pedido) {
    const sugs = (pedido.sugestoes || []) as Sug[];
    return (
      <View className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2" testID="novas-datas-pendente">
        <Text className="text-sm font-medium text-blue-900">⏳ {t('novasDatas.pendente', { data: new Date(pedido.created_at).toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</Text>
        {sugs.length > 0 && <Text className="text-sm text-blue-800 mt-1">{t('novasDatas.suasDatas', { datas: sugs.map((s) => `${diaTxt(s.data)} ${semQuebra(turnoTxt(s.turno, s.data))}`).join('; ') })}</Text>}
      </View>
    );
  }

  return (
    <View className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2" testID="pedir-novas-datas">
      <Text className="text-base font-semibold text-amber-900">📅 {t('novasDatas.titulo')}</Text>
      <Text className="text-sm text-amber-900 mt-1">{t('novasDatas.texto')}</Text>
      {!aberto ? (
        <Pressable onPress={() => setAberto(true)} accessibilityRole="button" className="bg-primary-600 rounded-lg py-3 px-3 items-center mt-3" testID="abrir-pedir-datas">
          <Text className="text-white font-semibold text-center">{t('novasDatas.botao')}</Text>
        </Pressable>
      ) : (
        <View className="mt-3">
          <Text className="text-sm font-medium text-gray-800 mb-2">{t('novasDatas.sugerirTitulo')}</Text>
          {dias.map((d) => (
            <View key={d.data} className="flex-row items-center gap-2 mb-1.5">
              <Text className="w-24 text-sm text-gray-700">{diaTxt(d.data)}</Text>
              {(['manha', 'tarde'] as Turno[]).map((tu) => {
                const s = { data: d.data, turno: tu };
                const on = marcada(s);
                if (!d.turnos.includes(tu)) return <View key={tu} className="flex-1" />;
                const bloqueado = !on && escolhidas.length >= MAX;
                return (
                  <Pressable key={tu} onPress={() => alternar(s)} disabled={bloqueado} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: bloqueado }}
                    style={{ opacity: bloqueado ? 0.4 : 1, minHeight: 44 }} testID={`chip-${d.data}-${tu}`}
                    accessibilityLabel={turnoTxt(tu, d.data)}
                    className={`flex-1 rounded-2xl border px-1 py-1 items-center justify-center ${on ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-white'}`}>
                    {/* duas linhas: turno pequeno + faixa (igual ao site). A faixa nunca e cortada com "…" (QA D6, 360 px):
                        mais espaco no chip e, se ainda nao couber, quebra depois do traco - nunca dentro de uma hora */}
                    <Text numberOfLines={1} className={`text-[11px] ${on ? 'text-white' : 'text-gray-500'}`}>{t(`novasDatas.${tu}`)}</Text>
                    <Text className={`text-xs font-medium text-center ${on ? 'text-white' : 'text-gray-700'}`} style={{ fontVariant: ['tabular-nums'] }}>{formatarJanela(janelaDaSugestao(d.data, tu, ctx))}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Text className="text-sm font-medium text-gray-800 mt-3 mb-1">{t('novasDatas.mensagemLabel')}</Text>
          <TextInput value={mensagem} onChangeText={(v) => setMensagem(v.slice(0, MSG_MAX))} maxLength={MSG_MAX} multiline placeholder={t('novasDatas.mensagemPlaceholder')}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-base text-gray-900 min-h-[64px]" testID="mensagem-datas" />
          <Text className="text-xs text-gray-500 text-right mt-0.5">{t('novasDatas.caracteres', { n: mensagem.length })}</Text>
          <Text className="text-xs text-gray-700 mt-2">{t('novasDatas.avisoConfirmar')}</Text>
          {erro ? <Text className="text-sm text-red-700 bg-red-50 rounded-lg p-2 mt-2" accessibilityRole="alert">{erro}</Text> : null}
          <View className="flex-row gap-2 mt-3">
            <Pressable onPress={() => { setAberto(false); setErro(''); }} accessibilityRole="button" className="flex-1 bg-white border border-gray-300 rounded-lg py-3 items-center">
              <Text className="text-gray-700 font-medium">{t('novasDatas.cancelar')}</Text>
            </Pressable>
            <Pressable onPress={enviar} disabled={enviando} accessibilityRole="button" className="flex-1 bg-primary-600 rounded-lg py-3 items-center" testID="enviar-pedir-datas">
              {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('novasDatas.enviar')}</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
