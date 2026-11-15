import { type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import RolagemTeclado from '../components/RolagemTeclado';
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Image, Linking, Keyboard, Platform } from 'react-native';
import { confirmar as perguntar } from '../lib/confirmar';
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
import { API_BASE_URL } from '../lib/api';
import { fetchComPrazo } from '../lib/rede';
import { mensagemErro, ErroApi } from '../lib/erro';
import { urlTermos, urlPrivacidade } from '../lib/links-legais';
import EnderecoAutocomplete from '../components/EnderecoAutocomplete';
import VehicleCatalogPicker from '../components/VehicleCatalogPicker';
import { obterPosicao, permissaoLocal } from '../lib/posicao';
import { arquivoDaFoto } from '../lib/anexo';
import { placaValida, anoValido } from '../lib/validar-carro';
import CampoTelefone from '../components/CampoTelefone';
import IconeServico from '../components/IconeServico';

// Pedido de orcamento SEM cadastro e SEM senha - o mesmo fluxo do site
// (apps/web/src/components/pedido/PedidoSemConta.tsx; regras em
// apps/web/src/lib/pedido-sem-conta.ts): servico, carro, local, nome + e-mail (celular
// so com "quero SMS", dono 13/11) e a confirmacao pelo e-mail. No app o CODIGO vem
// primeiro (o botao do e-mail abre o navegador, nao o app); o codigo entra na conta
// (nova ou ja existente) neste aparelho. Confirmado pelo botao: o codigo da 410 e a
// tela diz "ja nao espera" + entrar com codigo.
const FUNIL = 'pedido_app';
const contar = (etapa: string) => {
  fetch(`${API_BASE_URL}/api/funil`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ funil: FUNIL, etapa }) }).catch(() => {});
};
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONE_OK = (v: string) => v.replace(/\D/g, '').length >= 8;
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
  // passo 2: posicao da caixa de texto (bloco do passo + caixa dentro dele) para rolar ate ela
  const posDetalhe = useRef(0);
  const posDescricao = useRef(0);
  const caixaDescricao = useRef<TextInput>(null);
  const { user, loading: carregandoLogin, signInComToken } = useAuth();

  const [etapa, setEtapa] = useState<Etapa>('servico');
  const [tipo, setTipo] = useState('');
  const [servicos, setServicos] = useState<string[]>([]);
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
  const [telefone, setTelefone] = useState('');
  const [querSms, setQuerSms] = useState(false);
  const [termos, setTermos] = useState(false);
  // funil do passo contato: digitou algo / marcou SMS (uma vez)
  const contado = useRef<Record<string, boolean>>({});
  const contarUmaVez = (e: string) => { if (!contado.current[e]) { contado.current[e] = true; contar(e); } };
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [pendente, setPendente] = useState<{ id: string; email: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState('');
  const [corrigindo, setCorrigindo] = useState(false);
  const [emailNovo, setEmailNovo] = useState('');
  const [esperaReenvio, setEsperaReenvio] = useState(0);
  const [jaConfirmou, setJaConfirmou] = useState(false);
  // "Edasi" tocado com algo faltando (passo 2): aviso vermelho + rola e foca a caixa (igual ao site)
  const [faltando, setFaltando] = useState('');

  // quem ja entrou usa o pedido normal (mesmos passos, sem contato/codigo)
  useEffect(() => {
    if (!carregandoLogin && user && etapa === 'servico' && !pendente) router.replace('/nova-solicitacao');
  }, [carregandoLogin, user]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { contar('abriu'); }, []);
  useEffect(() => {
    setFaltando('');
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
      const { status } = await permissaoLocal(true);
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
  // passo 2 (rascunho aprovado 15/11, igual ao site): caixa de texto primeiro, a lista do tipo
  // embaixo ("ou escolha abaixo"), sem busca; "ver todos" mostra o resto (6 primeiros + marcados)
  const LISTA_CURTA = 6;
  const temLista = lista.length > 0;
  const listaCurta = !listaAberta && lista.length > LISTA_CURTA;
  const listaVisivel = listaCurta ? lista.filter((sv, i) => i < LISTA_CURTA || servicos.includes(sv.value)) : lista;
  const ehDano = tipo === 'colisao' || tipo === 'funilaria';
  const EXEMPLO: Record<string, string> = { revisao: 'exemploRevisao', mecanica: 'exemploMecanica', eletrica: 'exemploEletrica', pneu: 'exemploPneu', colisao: 'exemploFoto', funilaria: 'exemploFoto' };
  const exemplo = t(`pedidoSemConta.${EXEMPLO[tipo] || 'placeholderDescribeIssue'}`);
  // escreveu o que precisa OU marcou algum servico da lista
  const servicoOk = !!tipo && (descricao.trim().length > 0 || servicos.length > 0);
  useEffect(() => { setFaltando(''); }, [servicoOk]); // corrigiu: o aviso some
  const statusDetalhe: { texto: string; tom: 'neutro' | 'ok' } = servicos.length > 0
    ? { texto: servicos.length === 1 ? t('pedidoSemConta.detalheStatusListaUm') : t('pedidoSemConta.detalheStatusListaN', { n: servicos.length }), tom: 'ok' }
    : descricao.trim() ? { texto: t('pedidoSemConta.detalheStatusTexto'), tom: 'ok' }
    : { texto: temLista ? t('pedidoSemConta.detalheStatusVazio') : t('pedidoSemConta.detalheStatusVazioTexto'), tom: 'neutro' };
  const irParaDescricao = () => {
    rolagem.current?.scrollTo({ y: Math.max(0, posDetalhe.current + posDescricao.current - 40), animated: true });
    setTimeout(() => caixaDescricao.current?.focus(), Platform.OS === 'web' ? 0 : 300);
  };
  const carroOk = !!(marca && modelo && /^\d{4}$/.test(ano.trim())) && anoValido(ano) && placaValida(placa);
  const contatoOk = nome.trim().length > 0 && EMAIL_OK.test(email.trim()) && (!querSms || TELEFONE_OK(telefone)) && termos;
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

  const enviar = async () => {
    if (enviando) return;
    setEnviando(true); setErro('');
    try {
      const local = await resolverLocal();
      if (!local) { setErro(t('pedidoSemConta.erroLocalizacao')); setEtapa('local'); return; }
      const form = new FormData();
      form.append('dados', JSON.stringify({
        origem: 'app', site: '', idioma: i18n.language, nome: nome.trim(), email: email.trim(), querSms, telefone: querSms ? telefone.trim() : '', aceitouTermos: termos,
        tipo, descricao: descricaoFinal(), urgencia, endereco, latitude: local.lat, longitude: local.lon, pais: local.pais,
        veiculo: { tipo: 'cars', marca: marca?.name || '', modelo: modelo?.name || '', ano: ano.trim(), codigo: null, placa: placa.trim().toUpperCase() || null },
      }));
      for (const [i, foto] of fotos.entries()) {
        form.append('fotos', await arquivoDaFoto(foto.uri), `foto-${i}.jpg`);
      }
      // ja logado: o pedido vai direto
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/pedido-sem-conta`, {
        method: 'POST',
        headers: { "x-bipfix-origem": "app", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: form,
      }).catch(() => null);
      const d = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) { setErro(textoErro(res?.status || 500, d.codigo)); return; }
      if (d.solicitacaoId) { router.replace(`/solicitacao/${d.solicitacaoId}`); return; }
      setPendente({ id: d.pendenteId, email: d.email });
      setEsperaReenvio(30); setCodigo(''); setAviso('');
      setEtapa('codigo');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
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
      // ja confirmado pelo botao do e-mail (no navegador) ou passou das 24 h
      if (res?.status === 410) { setJaConfirmou(true); return; }
      if (!res || !res.ok) { setErro(textoErro(res?.status || 500, d.codigo)); return; }
      // o codigo provou o e-mail: entra na conta (nova ou ja existente) e abre o pedido;
      // sem senha ainda, passa antes pela tela "crie a sua senha" (pode pular)
      const { error } = d.tokenHash ? await signInComToken(d.tokenHash) : { error: 'sem_token' };
      if (!error) {
        const voltar = `/solicitacao/${d.solicitacaoId}`;
        if (d.senhaDefinida === false) router.replace({ pathname: '/criar-senha', params: { voltar } });
        else router.replace(voltar);
        return;
      }
      // login falhou (raro): o pedido ja foi; a pessoa entra com um codigo pela tela de login
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
      if (res?.status === 410) { setJaConfirmou(true); return; }
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
      perguntar(t('emergencia.cameraNegadaTitulo'), t('emergencia.cameraNegadaTexto'), [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('emergencia.abrirAjustes'), onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setFotos((prev) => [...prev, ...result.assets].slice(0, 6));
  };
  const handleGaleria = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible, allowsMultipleSelection: true, selectionLimit: Math.max(1, 6 - fotos.length) });
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
  // com `falta` (passo 2) o "Edasi" fica sempre ativo: faltando algo, diz o que e e leva a caixa
  // (antes ficava palido sem explicar - rascunho 15/11); os outros passos seguem como antes
  const Navegar = ({ voltar, avancar, ok, rotulo, falta, aoFaltar, status }: { voltar?: Etapa; avancar: () => void; ok: boolean; rotulo?: string; falta?: string; aoFaltar?: () => void; status?: { texto: string; tom: 'neutro' | 'ok' } }) => {
    const travado = enviando || (falta === undefined && !ok);
    return (
      <View className="mt-6 mb-10">
        {faltando && falta !== undefined ? <Text role="alert" testID="falta-aviso" className="text-sm text-red-700 font-medium mb-2">{faltando}</Text>
          : status ? <Text role="status" testID="status-passo" className={`text-sm mb-2 ${status.tom === 'ok' ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{status.texto}</Text> : null}
        <View className="flex-row gap-3">
          {voltar && (
            <Pressable onPress={() => { Keyboard.dismiss(); setErro(''); setEtapa(voltar); }} accessibilityRole="button" className="flex-1 border border-gray-300 rounded-lg py-4 items-center">
              <Text className="text-gray-700 font-semibold text-base">{t('pedidoSemConta.back')}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => {
            if (!ok && falta !== undefined) { setFaltando(falta); contar(`edasi_bloqueado_${etapa}`); aoFaltar?.(); return; }
            Keyboard.dismiss(); setFaltando(''); avancar();
          }} disabled={travado} accessibilityRole="button" accessibilityState={{ disabled: travado, busy: enviando }}
            className="flex-[2] bg-primary-600 rounded-lg py-4 items-center disabled:opacity-50">
            {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{rotulo || t('pedidoSemConta.next')}</Text>}
          </Pressable>
        </View>
      </View>
    );
  };

  if (etapa === 'codigo' && jaConfirmou) {
    return (
      <View className="flex-1 bg-white items-center justify-center px-6" testID="pedido-ja-confirmado">
        <Ionicons name="mail-open-outline" size={56} color="#0284c7" />
        <Text className="text-xl font-bold text-gray-900 mt-4 mb-2 text-center">{t('pedidoSemConta.jaConfirmouTitulo')}</Text>
        <Text className="text-gray-600 text-center mb-8">{t('pedidoSemConta.jaConfirmouTexto')}</Text>
        <Pressable onPress={() => router.replace({ pathname: '/(auth)/codigo-login', params: { email: pendente?.email || email.trim() } })} accessibilityRole="button" className="bg-primary-600 rounded-lg px-6 py-3 self-stretch items-center">
          <Text className="text-white font-semibold">{t('pedidoSemConta.entrar')}</Text>
        </Pressable>
      </View>
    );
  }

  if (etapa === 'enviado') {
    return (
      <View className="flex-1 bg-white items-center justify-center px-6">
        <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
        <Text className="text-xl font-bold text-gray-900 mt-4 mb-2 text-center">{t('pedidoSemConta.enviadoTitulo')}</Text>
        <Text className="text-gray-600 text-center mb-8">{t('pedidoSemConta.enviadoTexto', { email: pendente?.email || email })}</Text>
        <Pressable onPress={() => router.replace({ pathname: '/(auth)/codigo-login', params: { email: pendente?.email || email.trim() } })} accessibilityRole="button" className="bg-primary-600 rounded-lg px-6 py-3 self-stretch items-center">
          <Text className="text-white font-semibold">{t('pedidoSemConta.enviadoEntrar')}</Text>
        </Pressable>
      </View>
    );
  }

  const passos: Etapa[] = ['servico', 'detalhe', 'carro', 'local', 'contato'];
  const indice = passos.indexOf(etapa);

  return (
    <RolagemTeclado bottomOffset={24} keyboardDismissMode="on-drag" ref={rolagem} className="flex-1 bg-white" style={{ backgroundColor: '#fff' }} keyboardShouldPersistTaps="handled"
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
          {/* "o tipo principal": quem precisa de varias coisas escreve as outras no passo 2 (rascunho 15/11) */}
          <Text role="heading" className="text-lg font-semibold text-gray-900 mb-1">{t('pedidoSemConta.servicoTitulo')}</Text>
          <Text className="text-sm text-gray-700 mb-3">{t('pedidoSemConta.servicoAjuda')}</Text>
          <View className="flex-row flex-wrap justify-between">
            {TIPOS_SERVICO.map((s) => (
              <Pressable key={s.value} accessibilityRole="button" accessibilityState={{ selected: tipo === s.value }}
                onPress={() => { if (s.value !== tipo) { setServicos([]); setListaAberta(false); } setTipo(s.value); setEtapa('detalhe'); }}
                className={`w-[48.5%] p-4 mb-3 rounded-lg border-2 ${tipo === s.value ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>
                <Text className="text-2xl"><IconeServico tipo={s.value} icon={s.icon} tamanho={24} /></Text>
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

      {/* 2) o que precisa (rascunho aprovado 15/11, igual ao site): a pergunta, a caixa com um exemplo do
          tipo e, embaixo, a lista do tipo como alternativa. Basta escrever OU marcar (servicoOk). */}
      {etapa === 'detalhe' && (
        <View onLayout={(e) => { posDetalhe.current = e.nativeEvent.layout.y; }}>
          <Text className="text-sm text-gray-500">{tipoConfig && <IconeServico tipo={tipoConfig.value} icon={tipoConfig.icon} tamanho={16} />} {t(`constants.tiposServico.${tipo}`)}</Text>
          <Text role="heading" className="text-lg font-semibold text-gray-900 mb-3">{temLista || tipo === 'outro' ? t('pedidoSemConta.detalheTitulo') : t('pedidoSemConta.detalheTituloFoto')}</Text>
          <View onLayout={(e) => { posDescricao.current = e.nativeEvent.layout.y; }}>
            <Text className="text-sm font-medium text-gray-700 mb-1">{ehDano ? t('pedidoSemConta.detalheRotuloFoto') : t('pedidoSemConta.detalheRotuloTexto')}</Text>
            <TextInput ref={caixaDescricao} accessibilityLabel={t('novaSolicitacao.passoSintomas')} accessibilityHint={ehDano ? t('pedidoSemConta.detalheRotuloFoto') : t('pedidoSemConta.detalheRotuloTexto')}
              value={descricao} onChangeText={(v) => { setDescricao(v); if (v.trim()) contarUmaVez('detalhe_escreveu'); }} multiline numberOfLines={3} maxLength={1800}
              placeholder={exemplo} aria-invalid={!!faltando}
              className={`${CAMPO} min-h-[84px] ${faltando ? 'border-red-500' : ''}`} style={{ textAlignVertical: 'top' }} />
            {faltando ? <Text role="alert" testID="falta-aviso-topo" className="text-sm text-red-700 font-medium mt-1">{faltando}</Text> : null}
          </View>
          {temLista ? (
            <View className="mt-5 mb-3">
              <Text className="text-sm font-medium text-gray-700 mb-2">{t('pedidoSemConta.detalheOuEscolha')}</Text>
              {listaVisivel.map((sv) => {
                const marcado = servicos.includes(sv.value);
                return (
                  <Pressable key={sv.value} onPress={() => { if (!marcado) contarUmaVez('detalhe_escolheu_lista'); setServicos((x) => (marcado ? x.filter((y) => y !== sv.value) : [...x, sv.value])); }}
                    accessibilityRole="checkbox" accessibilityState={{ checked: marcado }}
                    className={`flex-row items-center gap-3 p-3 mb-2 rounded-lg border ${marcado ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>
                    <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={20} color={marcado ? '#0284c7' : '#9ca3af'} />
                    <Text className="text-gray-900 flex-1">{rotuloServico(sv.value)}</Text>
                  </Pressable>
                );
              })}
              {lista.length > LISTA_CURTA && (
                <Pressable onPress={() => { if (listaCurta) contarUmaVez('detalhe_ver_todos'); setListaAberta((x) => !x); }} accessibilityRole="button" className="min-h-[44px] items-center justify-center">
                  <Text className="text-primary-600 font-medium underline">{listaCurta ? t('pedidoSemConta.verTodos', { n: lista.length }) : t('pedidoSemConta.verMenos')}</Text>
                </Pressable>
              )}
            </View>
          ) : <View className="h-5" />}

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
          <Navegar voltar="servico" ok={servicoOk} avancar={() => setEtapa('carro')} falta={temLista ? t('pedidoSemConta.faltaDescricaoLista') : t('pedidoSemConta.faltaDescricao')}
            aoFaltar={irParaDescricao} status={statusDetalhe} />
        </View>
      )}

      {etapa === 'carro' && (
        <View>
          <Text className="text-lg font-semibold text-gray-900 mb-1">{t('novaSolicitacao.passoVeiculo')}</Text>
          <Text className="text-sm text-gray-500 mb-4">{t('pedidoSemConta.carroDica')}</Text>
          <VehicleCatalogPicker label={t('veiculos.marca')} value={marca} onChange={(m) => { setMarca(m); setModelo(null); }} fetchUrl="/api/vehicle-catalog?tipo=cars" />
          {/* modelo sempre a vista; antes da marca fica parado (dono 12/11) */}
          <VehicleCatalogPicker label={t('veiculos.modelo')} value={modelo} onChange={setModelo} fetchUrl={marca?.code ? `/api/vehicle-catalog?tipo=cars&marca=${marca.code}` : ''}
            desativado={marca ? undefined : t('veiculos.escolhaMarcaPrimeiro')} />
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('veiculos.ano')}</Text>
          <TextInput accessibilityLabel={t('veiculos.ano')} value={ano} onChangeText={(v) => setAno(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} className={`${CAMPO} mb-4`} />
          {ano.length === 4 && !anoValido(ano) ? <Text className="text-sm text-red-700 -mt-2 mb-3" accessibilityRole="alert">{t('erros.ANO_INVALIDO')}</Text> : null}
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.plateLabel')}</Text>
          <TextInput accessibilityLabel={t('pedidoSemConta.plateLabel')} value={placa} onChangeText={(v) => setPlaca(v.toUpperCase())} autoCapitalize="characters" maxLength={10} className={`${CAMPO} mb-3`} />
          {!placaValida(placa) ? <Text className="text-sm text-red-700 -mt-2 mb-3" accessibilityRole="alert">{t('erros.PLACA_INVALIDA')}</Text> : null}
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
          {(
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.nome')}</Text>
              <TextInput accessibilityLabel={t('pedidoSemConta.nome')} value={nome} onChangeText={(v) => { setNome(v); contarUmaVez('contato_digitou'); }} autoComplete="name" textContentType="name" maxLength={100} className={`${CAMPO} mb-4`} />

              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.email')}</Text>
              <TextInput accessibilityLabel={t('pedidoSemConta.email')} value={email} onChangeText={(v) => { setEmail(v); contarUmaVez('contato_digitou'); }} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} className={CAMPO} />
              {sugestao ? (
                <Pressable onPress={() => setEmail(sugestao)} accessibilityRole="button" className="min-h-[36px] justify-center">
                  <Text className="text-sm text-amber-800 underline">{t('pedidoSemConta.voceQuisDizer', { email: sugestao })}</Text>
                </Pressable>
              ) : <View className="h-4" />}

              {/* celular so para quem quer SMS (dono 13/11): desmarcado, o campo nem aparece */}
              <View className="rounded-lg border border-gray-200 p-3 mb-4">
                <Pressable onPress={() => { const v = !querSms; setQuerSms(v); if (v) contarUmaVez('contato_sms_opt'); else setTelefone(''); }}
                  accessibilityRole="checkbox" accessibilityState={{ checked: querSms }} className="flex-row items-start gap-2" testID="quer-sms">
                  <Ionicons name={querSms ? 'checkbox' : 'square-outline'} size={22} color={querSms ? '#0284c7' : '#6b7280'} />
                  <Text className="flex-1 text-sm text-gray-800">{t('pedidoSemConta.querSms')}</Text>
                </Pressable>
                {querSms && (
                  <View className="mt-3">
                    <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.telefone')}</Text>
                    <CampoTelefone rotulo={t('pedidoSemConta.telefone')} value={telefone} onChange={setTelefone} />
                    <Text className="text-xs text-gray-500 mt-1">{t('pedidoSemConta.telefoneDica')}</Text>
                    <View className="flex-row items-start gap-1.5 mt-2" testID="sms-privacidade">
                      <Ionicons name="lock-closed-outline" size={14} color="#15803d" style={{ marginTop: 2 }} />
                      <Text className="flex-1 text-xs text-gray-600">{t('pedidoSemConta.smsPrivacidade')}</Text>
                    </View>
                    {!TELEFONE_OK(telefone) && <Text className="text-xs text-amber-800 mt-2">{t('pedidoSemConta.faltaTelefone')}</Text>}
                  </View>
                )}
              </View>

              <Pressable onPress={() => setTermos((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: termos }} className="flex-row items-start gap-2">
                <Ionicons name={termos ? 'checkbox' : 'square-outline'} size={22} color={termos ? '#0284c7' : '#6b7280'} />
                <Text className="flex-1 text-sm text-gray-700">{textoTermos()}</Text>
              </Pressable>
              <Erro />
              <Navegar voltar="local" ok={contatoOk} avancar={() => enviar()} rotulo={t('pedidoSemConta.enviarPedido')} />
            </View>
          )}
        </View>
      )}

      {etapa === 'codigo' && pendente && (
        <View className="mb-10">
          <View className="items-center mb-2"><Ionicons name="mail-outline" size={44} color="#0284c7" /></View>
          <Text className="text-lg font-semibold text-gray-900 mb-1 text-center">{t('pedidoSemConta.codigoTitulo')}</Text>
          <Text className="text-sm text-gray-700 mb-4 text-center">{t('pedidoSemConta.codigoTexto', { email: pendente.email })}</Text>
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.codigoCampo')}</Text>
          <TextInput accessibilityLabel={t('pedidoSemConta.codigoCampo')} value={codigo} onChangeText={(v) => setCodigo(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6}
            className="border border-gray-300 rounded-lg px-4 py-3 text-2xl font-semibold text-center" style={{ letterSpacing: 8 }} />
          <Erro />
          {aviso ? <Text accessibilityRole="alert" className="text-sm text-green-700 mt-2">{aviso}</Text> : null}
          <Pressable onPress={confirmar} disabled={codigo.length !== 6 || enviando} accessibilityRole="button" className="bg-green-600 rounded-lg py-4 items-center mt-4 disabled:opacity-50">
            {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('pedidoSemConta.confirmarEnviar')}</Text>}
          </Pressable>
          <Text className="text-xs text-gray-600 mt-3">{t('pedidoSemConta.codigoBotaoEmail')}</Text>
          <Text className="text-xs text-gray-500 mt-2">{t('pedidoSemConta.codigoSpam')}</Text>
          <Pressable onPress={() => reenviar()} disabled={esperaReenvio > 0 || enviando} accessibilityRole="button" className="mt-3 min-h-[44px] justify-center">
            <Text className={esperaReenvio > 0 ? 'text-gray-400' : 'text-primary-600 underline'}>
              {esperaReenvio > 0 ? t('pedidoSemConta.reenviarEm', { s: esperaReenvio }) : t('pedidoSemConta.reenviarCodigo')}
            </Text>
          </Pressable>
          {!corrigindo && (
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
          {/* transparencia: com este e-mail nasce um acesso BipFix (sem senha) - aqui, nao no contato (Fable 13/11) */}
          <Text className="text-xs text-gray-500 mt-4">{t('pedidoSemConta.acessoTexto')}</Text>
        </View>
      )}
    </RolagemTeclado>
  );
}
