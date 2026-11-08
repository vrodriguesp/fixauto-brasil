import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Image, Alert, Linking, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TIPOS_SERVICO, URGENCIAS,
  SERVICOS_REVISAO, SERVICOS_MECANICA, SERVICOS_ELETRICA, SERVICOS_PNEU,
} from '@fixauto/shared';
import i18n from '../i18n';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { API_BASE_URL, apiFetch } from '../lib/api';
import { fetchComPrazo } from '../lib/rede';
import { mensagemErro, ErroApi } from '../lib/erro';
import { urlTermos, urlPrivacidade } from '../lib/links-legais';
import EnderecoAutocomplete from '../components/EnderecoAutocomplete';
import VehicleCatalogPicker from '../components/VehicleCatalogPicker';
import { obterPosicao } from '../lib/posicao';
import { arquivoDaFoto } from '../lib/anexo';
import CampoTelefone from '../components/CampoTelefone';

// Pedido de orcamento SEM cadastro - o mesmo fluxo do site
// (apps/web/src/components/pedido/PedidoSemConta.tsx; regras em
// apps/web/src/lib/pedido-sem-conta.ts): servico, carro, local, contato e o
// codigo de 6 digitos do e-mail. O pedido so vai para as oficinas com o codigo.
const FUNIL = 'pedido_app';
const contar = (etapa: string) => {
  fetch(`${API_BASE_URL}/api/funil`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ funil: FUNIL, etapa }) }).catch(() => {});
};
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMINIOS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'mail.ru', 'yandex.ru', 'live.com', 'mail.ee', 'hot.ee', 'online.ee'];
function sugestaoEmail(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  const dom = m[2];
  if (DOMINIOS.includes(dom)) return null;
  const dist = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const perto = DOMINIOS.find((x) => dist(dom, x) <= 2);
  return perto ? `${m[1]}@${perto}` : null;
}

type Etapa = 'servico' | 'detalhe' | 'carro' | 'local' | 'contato' | 'codigo' | 'enviado';
type Item = { code: string; name: string };
const CAMPO = 'border border-gray-300 rounded-lg px-4 py-3 text-[16px]';

export default function PedidoScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rolagem = useRef<KeyboardAwareScrollViewRef>(null);
  const posEndereco = useRef(0);
  const { user, loading: carregandoLogin, signIn } = useAuth();

  const [etapa, setEtapa] = useState<Etapa>('servico');
  const [tipo, setTipo] = useState('');
  const [servicos, setServicos] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [listaAberta, setListaAberta] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [urgencia, setUrgencia] = useState('media');
  const [fotos, setFotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [marca, setMarca] = useState<Item | null>(null);
  const [modelo, setModelo] = useState<Item | null>(null);
  const [ano, setAno] = useState('');
  const [placa, setPlaca] = useState('');
  const [endereco, setEndereco] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [pais, setPais] = useState<string | null>(null);
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [telefone, setTelefone] = useState('');
  const [termos, setTermos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [contaExistente, setContaExistente] = useState(false);
  const [senhaLogin, setSenhaLogin] = useState('');
  const [pendente, setPendente] = useState<{ id: string; email: string; contaNova: boolean } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState('');
  const [corrigindo, setCorrigindo] = useState(false);
  const [emailNovo, setEmailNovo] = useState('');
  const [esperaReenvio, setEsperaReenvio] = useState(0);
  const [contaNovaFinal, setContaNovaFinal] = useState(false);

  // quem ja entrou usa o pedido normal (mesmos passos, sem contato/codigo)
  useEffect(() => {
    if (!carregandoLogin && user && etapa === 'servico' && !pendente) router.replace('/nova-solicitacao');
  }, [carregandoLogin, user]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { contar('abriu'); }, []);
  useEffect(() => {
    if (['detalhe', 'carro', 'local', 'contato'].includes(etapa)) contar(etapa);
    rolagem.current?.scrollTo({ y: 0, animated: false });
    if (etapa === 'local' && !coords) buscarLocal();
  }, [etapa]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const i = setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => clearTimeout(i);
  }, [esperaReenvio]);

  // posicao do aparelho (se a pessoa permitir): preenche a cidade e aproxima as sugestoes
  const buscarLocal = async () => {
    setBuscandoLocal(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await obterPosicao();
      setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      const res = await fetchComPrazo(`${API_BASE_URL}/api/geocode?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&idioma=${i18n.language}`);
      const data = await res.json();
      if (data.cidade) setEndereco((atual) => atual || [data.cidade, data.estado, data.pais].filter(Boolean).join(', '));
      if (data.paisCodigo) setPais(data.paisCodigo);
    } catch {
      // sem posicao o endereco continua digitavel
    } finally {
      setBuscandoLocal(false);
    }
  };

  const tipoConfig = TIPOS_SERVICO.find((x) => x.value === tipo);
  const NS: Record<string, string> = { revisao: 'servicosRevisao', mecanica: 'servicosMecanica', eletrica: 'servicosEletrica', pneu: 'servicosPneu' };
  const lista = tipo === 'revisao' ? SERVICOS_REVISAO : tipo === 'mecanica' ? SERVICOS_MECANICA : tipo === 'eletrica' ? SERVICOS_ELETRICA : tipo === 'pneu' ? SERVICOS_PNEU : [];
  const rotuloServico = (v: string) => (NS[tipo] ? t(`constants.${NS[tipo]}.${v}`) : v);
  // busca sem acento e sem maiusculas ('rehvi' acha 'Rehvide vahetus')
  const semAcento = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const listaFiltrada = lista.filter((sv) => semAcento(rotuloServico(sv.value)).includes(semAcento(busca.trim())));
  // "ver mais": 6 primeiros (e os ja marcados); busca ou "ver todos" mostram tudo - igual ao site
  const LISTA_CURTA = 6;
  const listaCurta = !listaAberta && !busca.trim() && listaFiltrada.length > LISTA_CURTA;
  const listaVisivel = listaCurta ? listaFiltrada.filter((sv, i) => i < LISTA_CURTA || servicos.includes(sv.value)) : listaFiltrada;
  // escreveu o que precisa OU marcou algum servico da lista
  const servicoOk = !!tipo && (descricao.trim().length > 0 || servicos.length > 0);
  const carroOk = !!(marca && modelo && /^\d{4}$/.test(ano.trim()));
  const contatoOk = nome.trim().length > 0 && EMAIL_OK.test(email.trim()) && senha.length >= 8 && termos;
  const sugestao = sugestaoEmail(email);

  const descricaoFinal = () => servicos.length > 0
    ? `${t('pedidoSemConta.servicesPrefix')} ${servicos.map(rotuloServico).join(', ')}${descricao.trim() ? '. ' + descricao.trim() : ''}`
    : (descricao.trim() || t('pedidoSemConta.defaultServiceDescription'));

  const resolverLocal = async () => {
    if (coords) return { ...coords, pais };
    const res = await fetchComPrazo(`${API_BASE_URL}/api/geocode?q=${encodeURIComponent(endereco)}`).catch(() => null);
    const d = res?.ok ? await res.json().catch(() => ({})) : {};
    if (typeof d.latitude === 'number' && typeof d.longitude === 'number') return { lat: d.latitude, lon: d.longitude, pais: d.paisCodigo || pais };
    return null;
  };

  const textoErro = (status: number, codigo?: string) => mensagemErro(new ErroApi(status, codigo));

  const enviar = async (modo?: 'codigo') => {
    if (enviando) return;
    setEnviando(true); setErro('');
    try {
      const local = await resolverLocal();
      if (!local) { setErro(t('pedidoSemConta.erroLocalizacao')); setEtapa('local'); return; }
      const form = new FormData();
      form.append('dados', JSON.stringify({
        origem: 'app', modo, site: '', idioma: i18n.language, nome: nome.trim(), email: email.trim(), senha, telefone: telefone.trim(), aceitouTermos: termos,
        tipo, descricao: descricaoFinal(), urgencia, endereco, latitude: local.lat, longitude: local.lon, pais: local.pais,
        veiculo: { tipo: 'cars', marca: marca?.name || '', modelo: modelo?.name || '', ano: ano.trim(), codigo: null, placa: placa.trim().toUpperCase() || null },
      }));
      for (const [i, foto] of fotos.entries()) {
        form.append('fotos', await arquivoDaFoto(foto.uri), `foto-${i}.jpg`);
      }
      // com login (entrou com a senha na caixa "ja tem conta"): o pedido vai direto
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/pedido-sem-conta`, {
        method: 'POST',
        headers: { "x-bipfix-origem": "app", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: form,
      }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      if (res?.status === 409 && d.codigo === 'CONTA_EXISTENTE') { setContaExistente(true); return; }
      if (!res || !res.ok) { setErro(textoErro(res?.status || 500, d.codigo)); return; }
      if (d.solicitacaoId) { router.replace(`/solicitacao/${d.solicitacaoId}`); return; }
      setPendente({ id: d.pendenteId, email: d.email, contaNova: !!d.contaNova });
      setEsperaReenvio(30); setCodigo(''); setAviso('');
      setEtapa('codigo');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  };

  const entrarEEnviar = async () => {
    if (!senhaLogin || enviando) return;
    setEnviando(true); setErro('');
    const { error } = await signIn(email.trim(), senhaLogin);
    setEnviando(false);
    if (error) {
      setErro(error === 'email_not_confirmed' ? t('pedidoSemConta.loginNaoConfirmado') : error.startsWith('over_') ? t('erros.MUITAS_TENTATIVAS') : t('pedidoSemConta.loginErro'));
      return;
    }
    await enviar();
  };

  const confirmar = async () => {
    Keyboard.dismiss();
    if (!pendente || codigo.length !== 6 || enviando) return;
    setEnviando(true); setErro('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/pedido-sem-conta/confirmar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pendente.id, codigo }),
      }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      // 5 codigos errados: volta ao contato (dados mantidos) para enviar de novo, com codigo novo
      if (d.codigo === 'CODIGO_TENTATIVAS') { setPendente(null); setEtapa('contato'); setErro(t('erros.CODIGO_TENTATIVAS')); return; }
      if (!res || !res.ok) { setErro(textoErro(res?.status || 500, d.codigo)); return; }
      if (pendente.contaNova) {
        // conta nova: ja entra com a senha que acabou de criar e abre o pedido
        const { error } = await signIn(pendente.email, senha);
        if (!error) { router.replace(`/solicitacao/${d.solicitacaoId}`); return; }
      }
      setContaNovaFinal(pendente.contaNova);
      setEtapa('enviado');
    } finally {
      setEnviando(false);
    }
  };

  const reenviar = async (comEmail?: string) => {
    Keyboard.dismiss();
    if (!pendente || esperaReenvio > 0 || enviando) return;
    setEnviando(true); setErro(''); setAviso('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/pedido-sem-conta/reenviar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pendente.id, email: comEmail }),
      }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) { setErro(textoErro(res?.status || 500, d.codigo)); return; }
      setPendente({ ...pendente, email: d.email || pendente.email });
      if (comEmail) setEmail(comEmail);
      setCorrigindo(false); setCodigo(''); setEsperaReenvio(30);
      setAviso(t('pedidoSemConta.codigoReenviado', { email: d.email || pendente.email }));
    } finally {
      setEnviando(false);
    }
  };

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('emergencia.cameraNegadaTitulo'), t('emergencia.cameraNegadaTexto'), [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('emergencia.abrirAjustes'), onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setFotos((prev) => [...prev, ...result.assets].slice(0, 6));
  };
  const handleGaleria = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true, selectionLimit: Math.max(1, 6 - fotos.length) });
    if (!result.canceled) setFotos((prev) => [...prev, ...result.assets].slice(0, 6));
  };

  // "Concordo com os <termos>termos</termos> e a <privacidade>politica</privacidade>": links no texto
  const textoTermos = () => t('pedidoSemConta.aceitoTermos').split(/(<termos>.*?<\/termos>|<privacidade>.*?<\/privacidade>)/).map((parte, i) => {
    const m = parte.match(/^<(termos|privacidade)>(.*)<\/\1>$/);
    if (!m) return <Text key={i}>{parte}</Text>;
    const url = m[1] === 'termos' ? urlTermos(i18n.language) : urlPrivacidade(i18n.language);
    return <Text key={i} className="text-primary-600 underline" onPress={() => Linking.openURL(url)}>{m[2]}</Text>;
  });

  const Erro = () => (erro ? <Text accessibilityRole="alert" className="text-sm text-red-700 mt-3">{erro}</Text> : null);
  const Navegar = ({ voltar, avancar, ok, rotulo }: { voltar?: Etapa; avancar: () => void; ok: boolean; rotulo?: string }) => (
    <View className="flex-row gap-3 mt-6 mb-10">
      {voltar && (
        <Pressable onPress={() => { Keyboard.dismiss(); setErro(''); setEtapa(voltar); }} accessibilityRole="button" className="flex-1 border border-gray-300 rounded-lg py-4 items-center">
          <Text className="text-gray-700 font-semibold text-base">{t('pedidoSemConta.back')}</Text>
        </Pressable>
      )}
      <Pressable onPress={() => { Keyboard.dismiss(); avancar(); }} disabled={!ok || enviando} accessibilityRole="button" accessibilityState={{ disabled: !ok || enviando, busy: enviando }}
        className="flex-[2] bg-primary-600 rounded-lg py-4 items-center disabled:opacity-50">
        {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{rotulo || t('pedidoSemConta.next')}</Text>}
      </Pressable>
    </View>
  );

  if (etapa === 'enviado') {
    return (
      <View className="flex-1 bg-white items-center justify-center px-6">
        <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
        <Text className="text-xl font-bold text-gray-900 mt-4 mb-2 text-center">{t('pedidoSemConta.enviadoTitulo')}</Text>
        <Text className="text-gray-600 text-center mb-8">{t('pedidoSemConta.enviadoTexto', { email: pendente?.email || email })}</Text>
        <Pressable onPress={() => router.replace('/(auth)/login')} accessibilityRole="button" className="bg-primary-600 rounded-lg px-6 py-3 self-stretch items-center">
          <Text className="text-white font-semibold">{t('pedidoSemConta.enviadoEntrar')}</Text>
        </Pressable>
        {!contaNovaFinal && (aviso ? <Text accessibilityRole="alert" className="mt-4 text-sm text-green-700 text-center">{aviso}</Text> : (
          <Pressable accessibilityRole="button" className="mt-4 min-h-[44px] justify-center" onPress={async () => {
            await apiFetch('/api/esqueci-senha', { method: 'POST', body: JSON.stringify({ email: pendente?.email || email.trim(), locale: i18n.language }) }).catch(() => {});
            setAviso(t('pedidoSemConta.linkSenhaEnviado'));
          }}>
            <Text className="text-primary-600 underline text-center">{t('pedidoSemConta.enviadoCriarSenha')}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const passos: Etapa[] = ['servico', 'detalhe', 'carro', 'local', 'contato'];
  const indice = passos.indexOf(etapa);

  return (
    <KeyboardAwareScrollView bottomOffset={24} keyboardDismissMode="on-drag" ref={rolagem} className="flex-1 bg-white" style={{ backgroundColor: '#fff' }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom }}>
      <Text className="text-xl font-bold text-gray-900">{t('pedidoSemConta.titulo')}</Text>
      <Text className="text-gray-600 mt-1 mb-4">{t('pedidoSemConta.subtitulo')}</Text>

      {indice >= 0 && (
        <View className="flex-row items-center gap-2 mb-5" accessibilityLabel={t('pedidoSemConta.passoDe', { n: indice + 1, total: passos.length })}>
          {passos.map((p, i) => <View key={p} className={`flex-1 h-2 rounded-full ${i <= indice ? 'bg-primary-600' : 'bg-gray-200'}`} />)}
          <Text className="text-sm text-gray-500 ml-1">{indice + 1}/{passos.length}</Text>
        </View>
      )}

      {/* 1) so o tipo: um toque e ja vai para a pagina seguinte (guiado, pedido do dono 06/11) */}
      {etapa === 'servico' && (
        <View>
          <Text className="text-sm font-medium text-gray-700 mb-2">{t('novaSolicitacao.passoServico')}</Text>
          <View className="flex-row flex-wrap justify-between">
            {TIPOS_SERVICO.map((s) => (
              <Pressable key={s.value} accessibilityRole="button" accessibilityState={{ selected: tipo === s.value }}
                onPress={() => { if (s.value !== tipo) { setServicos([]); setBusca(''); setListaAberta(false); } setTipo(s.value); setEtapa('detalhe'); }}
                className={`w-[48.5%] p-4 mb-3 rounded-lg border-2 ${tipo === s.value ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>
                <Text className="text-2xl">{s.icon}</Text>
                <Text className="font-medium text-gray-900 mt-2">{t(`constants.tiposServico.${s.value}`)}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row justify-center gap-1 mt-4 mb-10">
            <Text className="text-gray-600">{t('pedidoSemConta.jaTemConta')}</Text>
            <Pressable onPress={() => router.replace('/(auth)/login')} accessibilityRole="link" hitSlop={8}>
              <Text className="text-primary-600 font-semibold">{t('pedidoSemConta.entrar')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 2) o que precisa: escreve com as proprias palavras OU procura na lista do tipo */}
      {etapa === 'detalhe' && (
        <View>
          <Text className="text-lg font-semibold text-gray-900 mb-1">{tipoConfig?.icon} {t(`constants.tiposServico.${tipo}`)}</Text>
          <Text className="text-sm text-gray-500 mb-4">{lista.length > 0 ? t('pedidoSemConta.detalheTexto') : t('pedidoSemConta.placeholderDescribeIssue')}</Text>
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.describeProblem')}</Text>
          <TextInput accessibilityLabel={t('novaSolicitacao.passoSintomas')} value={descricao} onChangeText={setDescricao} multiline numberOfLines={4} maxLength={1800}
            placeholder={t('pedidoSemConta.placeholderDescribeIssue')}
            className={`${CAMPO} mb-5 min-h-[100px]`} style={{ textAlignVertical: 'top' }} />
          {lista.length > 0 && (
            <View className="mb-3">
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.step3ServiceTitle')}</Text>
              <TextInput accessibilityLabel={t('pedidoSemConta.buscarServico')} value={busca} onChangeText={setBusca} placeholder={t('pedidoSemConta.buscarServico')}
                autoCorrect={false} className={`${CAMPO} mb-2`} />
              {listaVisivel.map((sv) => {
                const marcado = servicos.includes(sv.value);
                return (
                  <Pressable key={sv.value} onPress={() => setServicos((x) => (marcado ? x.filter((y) => y !== sv.value) : [...x, sv.value]))}
                    accessibilityRole="checkbox" accessibilityState={{ checked: marcado }}
                    className={`flex-row items-center gap-3 p-3 mb-2 rounded-lg border ${marcado ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>
                    <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={20} color={marcado ? '#0284c7' : '#9ca3af'} />
                    <Text className="text-gray-900 flex-1">{rotuloServico(sv.value)}</Text>
                  </Pressable>
                );
              })}
              {listaFiltrada.length === 0 && <Text className="text-sm text-gray-500 py-2">{t('pedidoSemConta.semResultadoBusca')}</Text>}
              {listaFiltrada.length > LISTA_CURTA && !busca.trim() && (
                <Pressable onPress={() => setListaAberta((x) => !x)} accessibilityRole="button" className="min-h-[44px] items-center justify-center">
                  <Text className="text-primary-600 font-medium underline">{listaCurta ? t('pedidoSemConta.verTodos', { n: listaFiltrada.length }) : t('pedidoSemConta.verMenos')}</Text>
                </Pressable>
              )}
            </View>
          )}

          <Text className="text-sm font-medium text-gray-700 mb-2">{t('pedidoSemConta.fotosTitulo')}</Text>
          <View className="flex-row flex-wrap gap-2 mb-2">
            {fotos.map((f, i) => (
              <View key={f.uri + i}>
                <Image source={{ uri: f.uri }} className="w-20 h-20 rounded-lg" />
                <Pressable onPress={() => setFotos((x) => x.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={t('pedidoSemConta.removerFoto')} hitSlop={8}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full items-center justify-center">
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
          {fotos.length < 6 && (
            <View className="flex-row gap-2 mb-5">
              <Pressable onPress={handleCamera} accessibilityRole="button" className="flex-1 border border-gray-300 rounded-lg py-3 items-center flex-row justify-center gap-2">
                <Ionicons name="camera-outline" size={18} color="#374151" />
                <Text className="text-gray-700">{t('novaSolicitacao.camera')}</Text>
              </Pressable>
              <Pressable onPress={handleGaleria} accessibilityRole="button" className="flex-1 border border-gray-300 rounded-lg py-3 items-center flex-row justify-center gap-2">
                <Ionicons name="images-outline" size={18} color="#374151" />
                <Text className="text-gray-700">{t('novaSolicitacao.galeria')}</Text>
              </Pressable>
            </View>
          )}

          <Text className="text-sm font-medium text-gray-700 mb-2">{t('novaSolicitacao.passoUrgencia')}</Text>
          <View className="gap-2">
            {URGENCIAS.map((u) => (
              <Pressable key={u.value} onPress={() => setUrgencia(u.value)} accessibilityRole="radio" accessibilityState={{ selected: urgencia === u.value }}
                className={`border rounded-lg px-4 py-3 ${urgencia === u.value ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>
                <Text className="font-medium text-gray-900">{t(`constants.urgencias.${u.value}`)}</Text>
                <Text className="text-gray-500 text-sm">{t(`constants.urgencias.${u.value}Desc`)}</Text>
              </Pressable>
            ))}
          </View>
          <Navegar voltar="servico" ok={servicoOk} avancar={() => setEtapa('carro')} />
        </View>
      )}

      {etapa === 'carro' && (
        <View>
          <Text className="text-lg font-semibold text-gray-900 mb-1">{t('novaSolicitacao.passoVeiculo')}</Text>
          <Text className="text-sm text-gray-500 mb-4">{t('pedidoSemConta.carroDica')}</Text>
          <VehicleCatalogPicker label={t('veiculos.marca')} value={marca} onChange={(m) => { setMarca(m); setModelo(null); }} fetchUrl="/api/vehicle-catalog?tipo=cars" />
          {marca && (
            <VehicleCatalogPicker label={t('veiculos.modelo')} value={modelo} onChange={setModelo} fetchUrl={`/api/vehicle-catalog?tipo=cars&marca=${marca.code}`} />
          )}
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('veiculos.ano')}</Text>
          <TextInput accessibilityLabel={t('veiculos.ano')} value={ano} onChangeText={(v) => setAno(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} className={`${CAMPO} mb-4`} />
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.plateLabel')}</Text>
          <TextInput accessibilityLabel={t('pedidoSemConta.plateLabel')} value={placa} onChangeText={(v) => setPlaca(v.toUpperCase())} autoCapitalize="characters" maxLength={15} className={CAMPO} />
          <Navegar voltar="detalhe" ok={carroOk} avancar={() => setEtapa('local')} />
        </View>
      )}

      {etapa === 'local' && (
        <View>
          <Text className="text-lg font-semibold text-gray-900 mb-3">{t('pedidoSemConta.step5Title')}</Text>
          <Text className="text-sm font-medium text-gray-700 mb-1">
            {t('novaSolicitacao.passoLocal')} {buscandoLocal && <ActivityIndicator size="small" color="#2563eb" />}
          </Text>
          <View onLayout={(e) => { posEndereco.current = e.nativeEvent.layout.y; }} />
          <EnderecoAutocomplete
            aoFocar={() => setTimeout(() => rolagem.current?.scrollTo({ y: Math.max(0, posEndereco.current - 40), animated: true }), 250)}
            value={endereco}
            onChange={(v) => { setEndereco(v); setCoords(null); }}
            perto={coords}
            rotulo={t('novaSolicitacao.passoLocal')}
            placeholder={t('novaSolicitacao.enderecoPlaceholder')}
            onSelect={(s) => { setEndereco(s.rotulo); setCoords({ lat: s.latitude, lon: s.longitude }); if (s.paisCodigo) setPais(s.paisCodigo); }}
          />
          <Text className="text-xs text-gray-500 -mt-2">{t('pedidoSemConta.addressHelp')}</Text>
          <Erro />
          <Navegar voltar="carro" ok={endereco.trim().length > 2} avancar={() => { setErro(''); setEtapa('contato'); }} />
        </View>
      )}

      {etapa === 'contato' && (
        <View>
          <Text className="text-lg font-semibold text-gray-900 mb-1">{t('pedidoSemConta.contatoTitulo')}</Text>
          <Text className="text-sm text-gray-500 mb-4">{t('pedidoSemConta.contatoTexto')}</Text>
          {!contaExistente ? (
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.nome')}</Text>
              <TextInput accessibilityLabel={t('pedidoSemConta.nome')} value={nome} onChangeText={setNome} autoComplete="name" textContentType="name" maxLength={100} className={`${CAMPO} mb-4`} />

              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.email')}</Text>
              <TextInput accessibilityLabel={t('pedidoSemConta.email')} value={email} onChangeText={setEmail} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} className={CAMPO} />
              {sugestao ? (
                <Pressable onPress={() => setEmail(sugestao)} accessibilityRole="button" className="min-h-[36px] justify-center">
                  <Text className="text-sm text-amber-800 underline">{t('pedidoSemConta.voceQuisDizer', { email: sugestao })}</Text>
                </Pressable>
              ) : <View className="h-4" />}

              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.senha')}</Text>
              <View className={`${CAMPO} flex-row items-center py-0`}>
                <TextInput accessibilityLabel={t('pedidoSemConta.senha')} value={senha} onChangeText={setSenha} secureTextEntry={!verSenha} autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" autoCorrect={false} maxLength={72} className="flex-1 py-3 text-[16px]" />
                <Pressable onPress={() => setVerSenha((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t(verSenha ? 'auth.ocultarSenha' : 'auth.mostrarSenha')}>
                  <Ionicons name={verSenha ? 'eye-off-outline' : 'eye-outline'} size={22} color="#6b7280" />
                </Pressable>
              </View>
              <Text className="text-xs text-gray-500 mt-1 mb-4">{t('pedidoSemConta.senhaDica')}</Text>

              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.telefone')} <Text className="text-gray-400 font-normal">({t('pedidoSemConta.opcional')})</Text></Text>
              <CampoTelefone rotulo={t('pedidoSemConta.telefone')} value={telefone} onChange={setTelefone} />
              <Text className="text-xs text-gray-500 mt-1 mb-4">{t('pedidoSemConta.telefoneDica')}</Text>

              <Pressable onPress={() => setTermos((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: termos }} className="flex-row items-start gap-2">
                <Ionicons name={termos ? 'checkbox' : 'square-outline'} size={22} color={termos ? '#0284c7' : '#6b7280'} />
                <Text className="flex-1 text-sm text-gray-700">{textoTermos()}</Text>
              </Pressable>
              <Erro />
              <Navegar voltar="local" ok={contatoOk} avancar={() => enviar()} rotulo={t('pedidoSemConta.enviarPedido')} />
            </View>
          ) : (
            <View className="rounded-lg border-2 border-amber-300 p-4 mb-10">
              <Text className="font-semibold text-gray-900 mb-1">{t('pedidoSemConta.contaExistenteTitulo')}</Text>
              <Text className="text-sm text-gray-700 mb-3">{t('pedidoSemConta.contaExistenteTexto', { email: email.trim() })}</Text>
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.senha')}</Text>
              <TextInput autoCorrect={false} accessibilityLabel={t('pedidoSemConta.senha')} value={senhaLogin} onChangeText={setSenhaLogin} secureTextEntry autoComplete="current-password" textContentType="password" autoCapitalize="none" className={CAMPO} />
              <Erro />
              <Pressable onPress={entrarEEnviar} disabled={!senhaLogin || enviando} accessibilityRole="button" className="bg-primary-600 rounded-lg py-4 items-center mt-3 disabled:opacity-50">
                {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('pedidoSemConta.entrarEEnviar')}</Text>}
              </Pressable>
              <Pressable onPress={() => enviar('codigo')} disabled={enviando} accessibilityRole="button" className="mt-3 min-h-[44px] justify-center">
                <Text className="text-primary-600 underline text-center font-medium">{t('pedidoSemConta.naoLembroSenha')}</Text>
              </Pressable>
              <Pressable onPress={() => { setContaExistente(false); setErro(''); }} accessibilityRole="button" className="min-h-[44px] justify-center">
                <Text className="text-gray-600 underline text-center">{t('pedidoSemConta.usarOutroEmail')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {etapa === 'codigo' && pendente && (
        <View className="mb-10">
          <Text className="text-lg font-semibold text-gray-900 mb-1">{t('pedidoSemConta.codigoTitulo')}</Text>
          <Text className="text-sm text-gray-700 mb-4">{t('pedidoSemConta.codigoTexto', { email: pendente.email })}</Text>
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.codigoCampo')}</Text>
          <TextInput accessibilityLabel={t('pedidoSemConta.codigoCampo')} value={codigo} onChangeText={(v) => setCodigo(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6}
            className="border border-gray-300 rounded-lg px-4 py-3 text-2xl font-semibold text-center" style={{ letterSpacing: 8 }} />
          <Erro />
          {aviso ? <Text accessibilityRole="alert" className="text-sm text-green-700 mt-2">{aviso}</Text> : null}
          <Pressable onPress={confirmar} disabled={codigo.length !== 6 || enviando} accessibilityRole="button" className="bg-green-600 rounded-lg py-4 items-center mt-4 disabled:opacity-50">
            {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('pedidoSemConta.confirmarEnviar')}</Text>}
          </Pressable>
          <Text className="text-xs text-gray-500 mt-3">{t('pedidoSemConta.codigoSpam')}</Text>
          <Pressable onPress={() => reenviar()} disabled={esperaReenvio > 0 || enviando} accessibilityRole="button" className="mt-3 min-h-[44px] justify-center">
            <Text className={esperaReenvio > 0 ? 'text-gray-400' : 'text-primary-600 underline'}>
              {esperaReenvio > 0 ? t('pedidoSemConta.reenviarEm', { s: esperaReenvio }) : t('pedidoSemConta.reenviarCodigo')}
            </Text>
          </Pressable>
          {pendente.contaNova && !corrigindo && (
            <Pressable onPress={() => { setCorrigindo(true); setEmailNovo(pendente.email); }} accessibilityRole="button" className="min-h-[44px] justify-center">
              <Text className="text-primary-600 underline">{t('pedidoSemConta.emailErrado')}</Text>
            </Pressable>
          )}
          {corrigindo && (
            <View className="rounded-lg bg-gray-50 p-3 mt-1">
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.emailCorreto')}</Text>
              <TextInput accessibilityLabel={t('pedidoSemConta.emailCorreto')} value={emailNovo} onChangeText={setEmailNovo} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} className={`${CAMPO} bg-white`} />
              {sugestaoEmail(emailNovo) && (
                <Pressable onPress={() => setEmailNovo(sugestaoEmail(emailNovo)!)} accessibilityRole="button" className="min-h-[36px] justify-center">
                  <Text className="text-sm text-amber-800 underline">{t('pedidoSemConta.voceQuisDizer', { email: sugestaoEmail(emailNovo) })}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => reenviar(emailNovo.trim())} disabled={!EMAIL_OK.test(emailNovo.trim()) || esperaReenvio > 0 || enviando} accessibilityRole="button" className="bg-primary-600 rounded-lg py-3 items-center mt-2 disabled:opacity-50">
                <Text className="text-white font-semibold">{t('pedidoSemConta.enviarParaEsteEmail')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
