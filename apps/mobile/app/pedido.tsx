import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Image, Linking, Keyboard, Platform, ScrollView, BackHandler, useWindowDimensions } from 'react-native';
import { confirmar as perguntar } from '../lib/confirmar';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TIPOS_SERVICO, listaServicos, servicosComuns, URGENCIA_PADRAO } from '@fixauto/shared';
import i18n from '../i18n';
import { rotuloTipoMotorista } from '../lib/tipo-servico';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/api';
import { fetchComPrazo } from '../lib/rede';
import { mensagemErro, ErroApi } from '../lib/erro';
import { urlTermos, urlPrivacidade } from '../lib/links-legais';
import EnderecoAutocomplete from '../components/EnderecoAutocomplete';
import VehicleCatalogPicker from '../components/VehicleCatalogPicker';
import MapaEstatico from '../components/MapaEstatico';
import { obterPosicao, permissaoLocal } from '../lib/posicao';
import { arquivoDaFoto } from '../lib/anexo';
import { placaValida, anoValido } from '../lib/validar-carro';
import { lerRascunho, gravarRascunho, apagarRascunho } from '../lib/rascunho-pedido';
import CampoTelefone from '../components/CampoTelefone';
import IconeServico from '../components/IconeServico';

// Pedido de orcamento SEM cadastro e SEM senha - o mesmo fluxo do site
// (apps/web/src/components/pedido/PedidoSemConta.tsx; regras em
// apps/web/src/lib/pedido-sem-conta.ts), em etapas de uma pergunta por tela
// (Proposta_pedido_em_etapas_2026-11-19, sec. 14/15 opcao A, dono 19/11):
//   1/6 servico (um toque avanca) -> 2/6 "Mis autol viga on?" (caixa de texto + chips dos
//   problemas comuns; "Naita koiki" abre a lista inteira numa tela propria) -> 3/6 fotos
//   (pode pular) -> 4/6 carro -> 5/6 endereco (basta a zona; mapa simples) -> 6/6 contato
//   -> codigo do e-mail. Sem pergunta de urgencia (fica 'media'; a oficina ajusta).
// Cada tela cabe sem rolar (tambem a 360x640); o rodape com Tagasi/Edasi fica fixo na zona
// do polegar; o botao fisico "voltar" volta um passo; o rascunho fica no aparelho 24 h.
// No app o CODIGO vem primeiro (o botao do e-mail abre o navegador, nao o app); o codigo
// entra na conta (nova ou ja existente) neste aparelho. Confirmado pelo botao: o codigo da
// 410 e a tela diz "ja nao espera" + entrar com codigo.
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

type Etapa = 'servico' | 'detalhe' | 'lista' | 'fotos' | 'carro' | 'local' | 'contato' | 'codigo' | 'enviado';
type Item = { code: string; name: string };
type Foto = { uri: string };
const CAMPO = 'border border-gray-300 rounded-lg px-4 py-3 text-[16px]';
const ETAPAS: Etapa[] = ['servico', 'detalhe', 'lista', 'fotos', 'carro', 'local', 'contato', 'codigo', 'enviado'];
// grupo da barra de progresso ("Samm n/6"): a lista inteira e uma face do passo 2
const GRUPO: Partial<Record<Etapa, number>> = { servico: 1, detalhe: 2, lista: 2, fotos: 3, carro: 4, local: 5, contato: 6 };
const TOTAL = 6;
// para onde o Tagasi (e o botao fisico voltar) leva
const ANTERIOR: Partial<Record<Etapa, Etapa>> = { detalhe: 'servico', lista: 'detalhe', fotos: 'detalhe', carro: 'fotos', local: 'carro', contato: 'local' };
const MAX_FOTOS = 6;

export default function PedidoScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: alturaTela } = useWindowDimensions();
  // Android pequeno (360x640): menos chips, sem subtitulo/ajuda, titulo da pagina so no passo 1
  const baixa = alturaTela < 700;
  const rolagem = useRef<ScrollView>(null);
  const caixaDescricao = useRef<TextInput>(null);
  const { user, loading: carregandoLogin, signInComToken } = useAuth();

  const [etapa, setEtapa] = useState<Etapa>('servico');
  const [tipo, setTipo] = useState('');
  const [servicos, setServicos] = useState<string[]>([]);
  const [descricao, setDescricao] = useState('');
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [fotosPuladas, setFotosPuladas] = useState(false);
  const [marca, setMarca] = useState<Item | null>(null);
  const [modelo, setModelo] = useState<Item | null>(null);
  const [ano, setAno] = useState('');
  const [placa, setPlaca] = useState('');
  const [endereco, setEndereco] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [pais, setPais] = useState<string | null>(null);
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  // localizacao negada/indisponivel: o botao some e nao pede de novo (igual ao site, 16/11)
  const [localNegado, setLocalNegado] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [querSms, setQuerSms] = useState(false);
  const [termos, setTermos] = useState(false);
  // funil: cada etapa conta UMA vez por pedido (voltar/avancar ou reabrir nao infla; igual ao site)
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
  // "Edasi" tocado com algo faltando: aviso vermelho no rodape + foco no campo (igual ao site)
  const [faltando, setFaltando] = useState('');
  const [rascunhoLido, setRascunhoLido] = useState(false);

  // quem ja entrou usa o pedido normal (mesmos dados, sem contato/codigo)
  useEffect(() => {
    if (!carregandoLogin && user && etapa === 'servico' && !pendente) router.replace('/nova-solicitacao');
  }, [carregandoLogin, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // rascunho (24 h): volta a mesma tela com o que ja estava preenchido
  useEffect(() => {
    let vivo = true;
    lerRascunho().then((r) => {
      if (!vivo) return;
      if (r && r.tipo && ETAPAS.includes(r.etapa as Etapa) && r.etapa !== 'servico' && r.etapa !== 'enviado') {
        setTipo(r.tipo); setServicos(r.servicos); setDescricao(r.descricao || '');
        setFotos(r.fotos.map((uri) => ({ uri }))); setFotosPuladas(!!r.fotosPuladas);
        setMarca(r.marca); setModelo(r.modelo); setAno(r.ano || ''); setPlaca(r.placa || '');
        setEndereco(r.endereco || ''); setCoords(r.coords); setPais(r.pais);
        setNome(r.nome || ''); setEmail(r.email || ''); setQuerSms(!!r.querSms); setTelefone(r.telefone || ''); setTermos(!!r.termos);
        r.contados.forEach((e) => { contado.current[e] = true; });
        if (r.pendente && r.etapa === 'codigo') { setPendente(r.pendente); setEtapa('codigo'); }
        else setEtapa(r.etapa === 'codigo' ? 'contato' : (r.etapa as Etapa));
      }
      setRascunhoLido(true);
      contar('abriu');
    });
    return () => { vivo = false; };
  }, []);
  useEffect(() => {
    if (!rascunhoLido || etapa === 'enviado') return;
    const tmr = setTimeout(() => {
      gravarRascunho({ etapa, tipo, servicos, descricao, fotos: fotos.map((f) => f.uri), fotosPuladas, marca, modelo, ano, placa, endereco, coords, pais, nome, email, querSms, telefone, termos, pendente, contados: Object.keys(contado.current) });
    }, 400);
    return () => clearTimeout(tmr);
  }, [rascunhoLido, etapa, tipo, servicos, descricao, fotos, fotosPuladas, marca, modelo, ano, placa, endereco, coords, pais, nome, email, querSms, telefone, termos, pendente]);

  useEffect(() => {
    setFaltando('');
    if (['detalhe', 'fotos', 'carro', 'local', 'contato'].includes(etapa)) contarUmaVez(etapa);
    rolagem.current?.scrollTo({ y: 0, animated: false });
    // 16/11 (dono + Fable): sem pedir a localizacao ao entrar no passo - so no botao "Kasuta minu asukohta"
  }, [etapa]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const i = setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => clearTimeout(i);
  }, [esperaReenvio]);

  const voltarPara = (e: Etapa) => { Keyboard.dismiss(); setErro(''); setEtapa(e); };
  // botao fisico "voltar" do Android = Tagasi (um passo); no primeiro passo fecha a tela como antes
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const ant = ANTERIOR[etapa];
      if (!ant) return false;
      voltarPara(ant);
      return true;
    });
    return () => sub.remove();
  }, [etapa]); // eslint-disable-line react-hooks/exhaustive-deps

  // posicao do aparelho (se a pessoa permitir): preenche a cidade e aproxima as sugestoes
  const buscarLocal = async () => {
    Keyboard.dismiss(); // campo focado + texto do GPS abriria a lista de sugestoes (Fable N4)
    setBuscandoLocal(true);
    contarUmaVez('local_gps');
    try {
      const { status } = await permissaoLocal(true);
      if (status !== 'granted') { setLocalNegado(true); contarUmaVez('local_gps_negado'); return; }
      const pos = await obterPosicao();
      setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      const res = await fetchComPrazo(`${API_BASE_URL}/api/geocode?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&idioma=${i18n.language}`);
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      // rua e numero, bairro e cidade (a busca reversa do site devolve os tres desde 16/11), sem repetir ("Keila, Keila")
      const rua = [data.rua, data.numero].filter(Boolean).join(' ');
      const unico = (xs: unknown[]) => xs.filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
      const texto = unico([rua, data.bairro, data.cidade]) || unico([data.cidade, data.estado, data.pais]);
      if (texto) setEndereco(texto); else setLocalNegado(true);
      if (data.paisCodigo) setPais(data.paisCodigo);
    } catch {
      // sem posicao o endereco continua digitavel
      setLocalNegado(true);
    } finally {
      setBuscandoLocal(false);
    }
  };

  const tipoConfig = TIPOS_SERVICO.find((x) => x.value === tipo);
  const NS: Record<string, string> = { revisao: 'servicosRevisao', mecanica: 'servicosMecanica', eletrica: 'servicosEletrica', pneu: 'servicosPneu' };
  const lista = listaServicos(tipo);
  const temLista = lista.length > 0;
  const rotuloServico = (v: string) => (NS[tipo] ? t(`constants.${NS[tipo]}.${v}`) : v);
  // chip = rotulo curto (constants.servicosCurto, partilhado com o site); sem rotulo curto vai o longo
  const rotuloChip = (v: string) => (i18n.exists(`constants.servicosCurto.${v}`) ? t(`constants.servicosCurto.${v}`) : rotuloServico(v));
  // passo 2 (v5 opcao A): os mais pedidos do tipo como chips (6; 4 num Android pequeno) + os que a
  // pessoa marcou na lista inteira, para nunca sumir um marcado
  const comuns = servicosComuns(tipo).slice(0, baixa ? 4 : 6);
  const chips = [...comuns, ...servicos.filter((v) => !comuns.includes(v))];
  const ehDano = tipo === 'colisao' || tipo === 'funilaria';
  const EXEMPLO: Record<string, string> = { revisao: 'exemploRevisao', mecanica: 'exemploMecanica', eletrica: 'exemploEletrica', pneu: 'exemploPneu', vidros: 'exemploVidro', colisao: 'exemploFoto', funilaria: 'exemploFoto' };
  const exemplo = t(`pedidoSemConta.${EXEMPLO[tipo] || 'placeholderDescribeIssue'}`);
  // a pergunta do passo 2 (igual ao site): "Mis autol viga on?" (tipos com lista e "Muu / ei tea"), "Mis juhtus?" (dano/vidro)
  const tituloDetalhe = temLista || tipo === 'outro' ? t('pedidoSemConta.detalheTituloViga') : t('pedidoSemConta.detalheTituloFoto');
  // escreveu o que precisa OU marcou algum servico da lista (regra do dono 12/11: a foto nunca substitui)
  const servicoOk = !!tipo && (descricao.trim().length > 0 || servicos.length > 0);
  useEffect(() => { setFaltando(''); }, [servicoOk, endereco, marca, modelo, nome, email, termos]); // corrigiu: o aviso some
  const statusDetalhe: { texto: string; tom: 'neutro' | 'ok' } = servicos.length > 0
    ? { texto: servicos.length === 1 ? t('pedidoSemConta.detalheStatusListaUm') : t('pedidoSemConta.detalheStatusListaN', { n: servicos.length }), tom: 'ok' }
    : descricao.trim() ? { texto: t('pedidoSemConta.detalheStatusTexto'), tom: 'ok' }
    : { texto: temLista ? t('pedidoSemConta.detalheStatusVazioChips') : t('pedidoSemConta.detalheStatusVazioTexto'), tom: 'neutro' };
  const alternarServico = (v: string) => {
    const marcado = servicos.includes(v);
    if (!marcado) contarUmaVez('detalhe_escolheu_lista');
    setServicos((x) => (marcado ? x.filter((y) => y !== v) : [...x, v]));
  };
  const irParaDescricao = () => {
    rolagem.current?.scrollTo({ y: 0, animated: true });
    setTimeout(() => caixaDescricao.current?.focus(), Platform.OS === 'web' ? 0 : 300);
  };
  // ano opcional (dono 16/11): se preenchido, 4 digitos validos
  const carroOk = !!(marca && modelo) && anoValido(ano) && placaValida(placa);
  const faltaCarro = !marca ? t('pedidoSemConta.faltaMarca') : !modelo ? t('pedidoSemConta.faltaModelo') : !anoValido(ano) ? t('pedidoSemConta.faltaAno') : t('erros.PLACA_INVALIDA');
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
        tipo, descricao: descricaoFinal(), urgencia: URGENCIA_PADRAO, endereco, latitude: local.lat, longitude: local.lon, pais: local.pais,
        veiculo: { tipo: 'cars', marca: marca?.name || '', modelo: modelo?.name || '', ano: ano.trim(), codigo: null, placa: placa.trim().toUpperCase() || null },
      }));
      // as fotos vao cruas e o servidor trata (reencode sem EXIF/GPS, lado maior 1600 px - guardarFotos)
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
      if (d.solicitacaoId) { await apagarRascunho(); router.replace(`/solicitacao/${d.solicitacaoId}`); return; }
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
      if (res?.status === 410) { await apagarRascunho(); setJaConfirmou(true); return; }
      if (!res || !res.ok) { setErro(textoErro(res?.status || 500, d.codigo)); return; }
      await apagarRascunho();
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
      if (res?.status === 410) { await apagarRascunho(); setJaConfirmou(true); return; }
      if (!res || !res.ok) { setErro(textoErro(res?.status || 500, d.codigo)); return; }
      setPendente({ ...pendente, email: d.email || pendente.email });
      if (comEmail) setEmail(comEmail);
      setCorrigindo(false); setCodigo(''); setEsperaReenvio(30);
      setAviso(t('pedidoSemConta.codigoReenviado', { email: d.email || pendente.email }));
    } finally {
      setEnviando(false);
    }
  };

  const juntarFotos = (novas: { uri: string }[]) => {
    setFotos((prev) => [...prev, ...novas.map((a) => ({ uri: a.uri }))].slice(0, MAX_FOTOS));
    setFotosPuladas(false);
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
    if (!result.canceled) { contarUmaVez('foto'); juntarFotos(result.assets); }
  };
  const handleGaleria = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible, allowsMultipleSelection: true, selectionLimit: Math.max(1, MAX_FOTOS - fotos.length) });
    if (!result.canceled) { contarUmaVez('foto'); juntarFotos(result.assets); }
  };

  // "Concordo com os <termos>termos</termos> e a <privacidade>politica</privacidade>": links no texto
  const textoTermos = () => t('pedidoSemConta.aceitoTermos').split(/(<termos>.*?<\/termos>|<privacidade>.*?<\/privacidade>)/).map((parte, i) => {
    const m = parte.match(/^<(termos|privacidade)>(.*)<\/\1>$/);
    if (!m) return <Text key={i}>{parte}</Text>;
    const url = m[1] === 'termos' ? urlTermos(i18n.language) : urlPrivacidade(i18n.language);
    return <Text key={i} className="text-primary-600 underline" onPress={() => Linking.openURL(url)}>{m[2]}</Text>;
  });

  const Erro = () => (erro ? <Text accessibilityRole="alert" className="text-sm text-red-700 mt-3">{erro}</Text> : null);

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

  if (!rascunhoLido) {
    return <View className="flex-1 bg-white items-center justify-center"><ActivityIndicator color="#2563eb" /></View>;
  }

  const grupo = GRUPO[etapa];
  const mostraTitulo = etapa === 'servico' || (!baixa && etapa !== 'codigo');

  // rodape fixo (zona do polegar): linha de estado/aviso + Tagasi / Edasi. O Edasi nunca fica
  // desativado: faltando algo, diz o que e (vermelho) e leva ao campo (igual ao site)
  const rodape = ({ voltar, avancar, ok, rotulo, falta, aoFaltar, status, secundario }: { voltar: Etapa; avancar: () => void; ok: boolean; rotulo?: string; falta: string; aoFaltar?: () => void; status?: { texto: string; tom: 'neutro' | 'ok' }; secundario?: boolean }) => (
    <View className="px-4 pt-2 border-t border-gray-100 bg-white" style={{ paddingBottom: Math.max(insets.bottom, 12) }} testID="rodape-passo">
      {faltando ? <Text role="alert" testID="falta-aviso" className="text-sm text-red-700 font-medium mb-2">{faltando}</Text>
        : status ? <Text role="status" testID="status-passo" className={`text-sm mb-2 ${status.tom === 'ok' ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{status.texto}</Text> : null}
      <View className="flex-row gap-3">
        <Pressable onPress={() => voltarPara(voltar)} accessibilityRole="button" className="flex-1 border border-gray-300 rounded-lg py-4 items-center">
          <Text className="text-gray-700 font-semibold text-base">{t('pedidoSemConta.back')}</Text>
        </Pressable>
        <Pressable onPress={() => {
          if (!ok) { setFaltando(falta); contarUmaVez(`edasi_bloqueado_${etapa}`); aoFaltar?.(); return; }
          Keyboard.dismiss(); setFaltando(''); avancar();
        }} disabled={enviando} accessibilityRole="button" accessibilityState={{ disabled: enviando, busy: enviando }}
          className={`flex-[2] rounded-lg py-4 items-center ${secundario ? 'border border-gray-300 bg-white' : 'bg-primary-600'} disabled:opacity-50`}>
          {enviando ? <ActivityIndicator color="#fff" /> : <Text className={`font-semibold text-base ${secundario ? 'text-gray-800' : 'text-white'}`}>{rotulo || t('pedidoSemConta.next')}</Text>}
        </Pressable>
      </View>
    </View>
  );

  const Moldura = Platform.OS === 'web' ? View : KeyboardAvoidingView;

  return (
    <Moldura behavior="padding" className="flex-1 bg-white" style={{ flex: 1, backgroundColor: '#fff' }}>
      <View className="px-4 pt-3">
        {mostraTitulo && <Text className="text-xl font-bold text-gray-900">{t('pedidoSemConta.titulo')}</Text>}
        {etapa === 'servico' && !baixa && <Text className="text-gray-600 mt-1">{t('pedidoSemConta.subtitulo')}</Text>}
        {grupo && (
          <View className="flex-row items-center gap-2 mt-3 mb-3" accessibilityLabel={t('pedidoSemConta.passoDe', { n: grupo, total: TOTAL })} testID="barra-passos">
            {Array.from({ length: TOTAL }, (_, i) => <View key={i} className={`flex-1 h-2 rounded-full ${i < grupo ? 'bg-primary-600' : 'bg-gray-200'}`} />)}
            <Text className="text-sm text-gray-500 ml-1">{t('pedidoSemConta.passoDe', { n: grupo, total: TOTAL })}</Text>
          </View>
        )}
      </View>

      <ScrollView ref={rolagem} className="flex-1" keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: etapa === 'codigo' ? insets.bottom + 16 : 8 }}>

      {/* 1) so o tipo: um toque e ja vai para a pagina seguinte (guiado, pedido do dono 06/11) */}
      {etapa === 'servico' && (
        <View>
          {/* "o tipo principal": quem precisa de varias coisas escreve as outras no passo 2 (rascunho 15/11) */}
          <Text role="heading" className="text-lg font-semibold text-gray-900 mb-1">{t('pedidoSemConta.servicoTitulo')}</Text>
          {!baixa && <Text className="text-sm text-gray-700 mb-2">{t('pedidoSemConta.servicoAjuda')}</Text>}
          <View className="flex-row flex-wrap justify-between mt-1">
            {TIPOS_SERVICO.map((s) => (
              <Pressable key={s.value} accessibilityRole="button" accessibilityState={{ selected: tipo === s.value }}
                onPress={() => { if (s.value !== tipo) setServicos([]); setTipo(s.value); setEtapa('detalhe'); }}
                className={`w-[48.5%] min-h-[60px] px-3 py-2 mb-3 rounded-lg border-2 flex-row items-center gap-2 ${tipo === s.value ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>
                <Text className="text-2xl"><IconeServico tipo={s.value} icon={s.icon} tamanho={24} /></Text>
                <Text className="font-medium text-gray-900 flex-1 flex-shrink">{rotuloTipoMotorista(t, s.value)}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row justify-center gap-1 mt-2 mb-6">
            <Text className="text-gray-600">{t('pedidoSemConta.jaTemConta')}</Text>
            <Pressable onPress={() => router.replace('/(auth)/login')} accessibilityRole="link" hitSlop={8}>
              <Text className="text-primary-600 font-semibold">{t('pedidoSemConta.entrar')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 2) "Mis autol viga on?" (v5 opcao A): rotulo visivel + caixa de texto onde se escreve logo;
          embaixo os problemas comuns do tipo como chips (v ao tocar) e "Naita koiki" para a lista inteira.
          Basta escrever OU tocar um chip (servicoOk). Tipos sem lista: so a caixa. */}
      {etapa === 'detalhe' && (
        <View>
          <Text className="text-sm text-gray-500">{tipoConfig && <IconeServico tipo={tipoConfig.value} icon={tipoConfig.icon} tamanho={16} />} {rotuloTipoMotorista(t, tipo)}</Text>
          <Text role="heading" className="text-lg font-semibold text-gray-900 mb-2">{tituloDetalhe}</Text>
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.detalheRotulo')}</Text>
          <TextInput ref={caixaDescricao} accessibilityLabel={t('pedidoSemConta.detalheRotulo')} accessibilityHint={ehDano ? t('pedidoSemConta.detalheRotuloFoto') : t('pedidoSemConta.detalheRotuloTexto')}
            value={descricao} onChangeText={(v) => { setDescricao(v); if (v.trim()) contarUmaVez('detalhe_escreveu'); }} multiline numberOfLines={temLista ? 3 : 5} maxLength={1800}
            placeholder={exemplo} placeholderTextColor="#9ca3af" aria-invalid={!!faltando} testID="caixa-descricao"
            className={`${CAMPO} ${temLista ? (baixa ? 'min-h-[76px]' : 'min-h-[96px]') : 'min-h-[140px]'} ${faltando ? 'border-red-500' : ''}`} style={{ textAlignVertical: 'top' }} />
          {temLista && (
            <View className="mt-3">
              <Text className="text-sm font-medium text-gray-700 mb-2">{t('pedidoSemConta.chipsTitulo')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {chips.map((v) => {
                  const marcado = servicos.includes(v);
                  return (
                    <Pressable key={v} onPress={() => alternarServico(v)} accessibilityRole="checkbox" accessibilityState={{ checked: marcado }} testID={`chip-${v}`}
                      className={`min-h-[44px] px-4 py-2 rounded-full border-2 justify-center ${marcado ? 'border-primary-600 bg-primary-50' : 'border-gray-300'}`}>
                      <Text className={`text-base ${marcado ? 'text-primary-700 font-semibold' : 'text-gray-900'}`}>{marcado ? '✓ ' : ''}{rotuloChip(v)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable onPress={() => { contarUmaVez('detalhe_ver_todos'); Keyboard.dismiss(); setEtapa('lista'); }} accessibilityRole="button" className="min-h-[44px] items-center justify-center mt-1" testID="ver-todos">
                <Text className="text-primary-600 font-medium underline">{t('pedidoSemConta.verTodos', { n: lista.length })}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* 2b) a lista inteira do tipo (tela propria; Tagasi/Valmis voltam a caixa com o estado mantido) */}
      {etapa === 'lista' && (
        <View>
          <Text className="text-sm text-gray-500">{tipoConfig && <IconeServico tipo={tipoConfig.value} icon={tipoConfig.icon} tamanho={16} />} {rotuloTipoMotorista(t, tipo)}</Text>
          <Text role="heading" className="text-lg font-semibold text-gray-900 mb-3">{t('pedidoSemConta.listaTitulo')}</Text>
          {lista.map((sv) => {
            const marcado = servicos.includes(sv.value);
            return (
              <Pressable key={sv.value} onPress={() => alternarServico(sv.value)} accessibilityRole="checkbox" accessibilityState={{ checked: marcado }} testID={`lista-${sv.value}`}
                className={`flex-row items-center gap-3 px-3 py-3 mb-2 rounded-lg border ${marcado ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>
                <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={22} color={marcado ? '#0284c7' : '#9ca3af'} />
                <Text className="text-gray-900 flex-1 text-base">{rotuloServico(sv.value)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 3) fotos numa tela propria: dois botoes grandes, miniaturas; pode pular ("Jatka ilma fotota") */}
      {etapa === 'fotos' && (
        <View>
          <Text role="heading" className="text-lg font-semibold text-gray-900 mb-1">{t('pedidoSemConta.fotosPergunta')}</Text>
          <Text className="text-sm text-gray-700 mb-3">{t('pedidoSemConta.fotosAjuda')}</Text>
          {fotos.length < MAX_FOTOS && (
            <View className="flex-row gap-3 mb-3">
              <Pressable onPress={handleCamera} accessibilityRole="button" testID="tirar-foto" className="flex-1 border-2 border-dashed border-gray-300 rounded-lg py-5 items-center justify-center gap-1">
                <Ionicons name="camera-outline" size={28} color="#374151" />
                <Text className="text-gray-800 font-medium">{t('pedidoSemConta.tirarFoto')}</Text>
              </Pressable>
              <Pressable onPress={handleGaleria} accessibilityRole="button" testID="escolher-galeria" className="flex-1 border-2 border-dashed border-gray-300 rounded-lg py-5 items-center justify-center gap-1">
                <Ionicons name="images-outline" size={28} color="#374151" />
                <Text className="text-gray-800 font-medium">{t('pedidoSemConta.escolherGaleria')}</Text>
              </Pressable>
            </View>
          )}
          <View className="flex-row flex-wrap gap-3 mb-2 mt-1">
            {fotos.map((f, i) => (
              <View key={f.uri + i} testID="foto-miniatura">
                <Image source={{ uri: f.uri }} className="w-20 h-20 rounded-lg" />
                <Pressable onPress={() => setFotos((x) => x.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={t('pedidoSemConta.removerFoto')} hitSlop={8}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full items-center justify-center">
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 4) carro: marca e modelo; ano e matricula lado a lado (mesma entidade) */}
      {etapa === 'carro' && (
        <View>
          <Text role="heading" className="text-lg font-semibold text-gray-900 mb-1">{t('pedidoSemConta.carroTitulo')}</Text>
          <Text className="text-sm text-gray-500 mb-3">{t('pedidoSemConta.carroDica')}</Text>
          <VehicleCatalogPicker label={t('veiculos.marca')} value={marca} onChange={(m) => { setMarca(m); setModelo(null); }} fetchUrl="/api/vehicle-catalog?tipo=cars" />
          {/* modelo sempre a vista; antes da marca fica parado (dono 12/11) */}
          <VehicleCatalogPicker label={t('veiculos.modelo')} value={modelo} onChange={setModelo} fetchUrl={marca?.code ? `/api/vehicle-catalog?tipo=cars&marca=${marca.code}` : ''}
            desativado={marca ? undefined : t('veiculos.escolhaMarcaPrimeiro')} />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.anoOpcional')}</Text>
              <TextInput accessibilityLabel={t('pedidoSemConta.anoOpcional')} value={ano} onChangeText={(v) => setAno(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} className={CAMPO} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.placaRotulo')}</Text>
              <TextInput accessibilityLabel={t('pedidoSemConta.placaRotulo')} value={placa} onChangeText={(v) => setPlaca(v.toUpperCase())} autoCapitalize="characters" maxLength={10} className={CAMPO} />
            </View>
          </View>
          <Text className="text-xs text-gray-500 mt-1">{t('pedidoSemConta.placaAjuda')}</Text>
          {ano.length >= 4 && !anoValido(ano) ? <Text className="text-sm text-red-700 mt-2" accessibilityRole="alert">{t('erros.ANO_INVALIDO')}</Text> : null}
          {!placaValida(placa) ? <Text className="text-sm text-red-700 mt-2" accessibilityRole="alert">{t('erros.PLACA_INVALIDA')}</Text> : null}
        </View>
      )}

      {/* 5) onde o carro esta, mais ou menos: basta a zona (v3); mapa simples quando ha coordenada */}
      {etapa === 'local' && (
        <View>
          <Text role="heading" className="text-lg font-semibold text-gray-900 mb-2">{t('pedidoSemConta.localTitulo')}</Text>
          <View className="bg-primary-50 border-l-4 border-primary-600 rounded-lg px-3 py-2 mb-3" testID="local-claro">
            <Text className="text-sm text-gray-800">{t('pedidoSemConta.localClaro')}</Text>
          </View>
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.localRotulo')}</Text>
          <EnderecoAutocomplete
            aoFocar={() => setTimeout(() => rolagem.current?.scrollTo({ y: 0, animated: true }), 250)}
            value={endereco}
            onChange={(v) => { setEndereco(v); setCoords(null); }}
            perto={coords}
            rotulo={t('pedidoSemConta.localRotulo')}
            placeholder={t('pedidoSemConta.localPlaceholder')}
            onSelect={(s) => { setEndereco(s.rotulo); setCoords({ lat: s.latitude, lon: s.longitude }); if (s.paisCodigo) setPais(s.paisCodigo); }}
          />
          {/* localizacao so quando a pessoa toca (antes pedia ao entrar no passo) */}
          {!coords && !localNegado ? (
            <Pressable onPress={buscarLocal} disabled={buscandoLocal} accessibilityRole="button" testID="usar-minha-localizacao"
              className="flex-row items-center self-start border border-gray-300 rounded-lg px-4 py-3 -mt-3 mb-3 gap-2">
              {buscandoLocal ? <ActivityIndicator size="small" color="#2563eb" /> : <Ionicons name="location-outline" size={18} color="#2563eb" />}
              <Text className="text-gray-800 font-medium">{buscandoLocal ? t('pedidoSemConta.localProcurando') : t('pedidoSemConta.localUsarMinha')}</Text>
            </Pressable>
          ) : null}
          {localNegado ? <Text className="text-xs text-gray-600 -mt-3 mb-3">{t('pedidoSemConta.localNegado')}</Text> : null}
          {coords ? <MapaEstatico lat={coords.lat} lon={coords.lon} rotulo={t('pedidoSemConta.mapaRotulo')} /> : null}
          <Erro />
        </View>
      )}

      {/* 6) contato: nome, e-mail, SMS opcional, termos -> "Saada paring" */}
      {etapa === 'contato' && (
        <View>
          <Text role="heading" className="text-lg font-semibold text-gray-900 mb-1">{t('pedidoSemConta.contatoTitulo')}</Text>
          <Text className="text-sm text-gray-500 mb-3">{t('pedidoSemConta.contatoTexto')}</Text>
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.nome')}</Text>
          <TextInput accessibilityLabel={t('pedidoSemConta.nome')} value={nome} onChangeText={(v) => { setNome(v); contarUmaVez('contato_digitou'); }} autoComplete="name" textContentType="name" maxLength={100} className={`${CAMPO} mb-3`} />

          <Text className="text-sm font-medium text-gray-700 mb-1">{t('pedidoSemConta.email')}</Text>
          <TextInput accessibilityLabel={t('pedidoSemConta.email')} value={email} onChangeText={(v) => { setEmail(v); contarUmaVez('contato_digitou'); }} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} className={CAMPO} />
          {sugestao ? (
            <Pressable onPress={() => setEmail(sugestao)} accessibilityRole="button" className="min-h-[36px] justify-center">
              <Text className="text-sm text-amber-800 underline">{t('pedidoSemConta.voceQuisDizer', { email: sugestao })}</Text>
            </Pressable>
          ) : <View className="h-3" />}

          {/* celular so para quem quer SMS (dono 13/11): desmarcado, o campo nem aparece */}
          <View className="rounded-lg border border-gray-200 p-3 mb-3">
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

          <Pressable onPress={() => setTermos((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: termos }} className="flex-row items-start gap-2" testID="aceito-termos">
            <Ionicons name={termos ? 'checkbox' : 'square-outline'} size={22} color={termos ? '#0284c7' : '#6b7280'} />
            <Text className="flex-1 text-sm text-gray-700">{textoTermos()}</Text>
          </Pressable>
          <Erro />
        </View>
      )}

      {etapa === 'codigo' && pendente && (
        <View className="mb-6">
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
      </ScrollView>

      {etapa === 'detalhe' && rodape({ voltar: 'servico', ok: servicoOk, avancar: () => setEtapa('fotos'), falta: temLista ? t('pedidoSemConta.faltaDescricaoChips') : t('pedidoSemConta.faltaDescricao'), aoFaltar: irParaDescricao, status: statusDetalhe })}
      {etapa === 'lista' && rodape({ voltar: 'detalhe', ok: true, avancar: () => setEtapa('detalhe'), falta: '', rotulo: t('pedidoSemConta.listaValmis'), status: servicos.length > 0 ? statusDetalhe : undefined })}
      {etapa === 'fotos' && rodape({ voltar: 'detalhe', ok: true, falta: '', secundario: fotos.length === 0, rotulo: fotos.length === 0 ? t('pedidoSemConta.semFotos') : undefined,
        avancar: () => { if (fotos.length === 0) { setFotosPuladas(true); contarUmaVez('fotos_pulou'); } setEtapa('carro'); } })}
      {etapa === 'carro' && rodape({ voltar: 'fotos', ok: carroOk, avancar: () => setEtapa('local'), falta: faltaCarro })}
      {etapa === 'local' && rodape({ voltar: 'carro', ok: endereco.trim().length > 2, avancar: () => { setErro(''); setEtapa('contato'); }, falta: t('pedidoSemConta.faltaEndereco') })}
      {etapa === 'contato' && rodape({ voltar: 'local', ok: contatoOk, avancar: () => enviar(), rotulo: t('pedidoSemConta.enviarPedido'),
        falta: !nome.trim() ? t('pedidoSemConta.faltaNome') : !EMAIL_OK.test(email.trim()) ? t('pedidoSemConta.faltaEmail') : querSms && !TELEFONE_OK(telefone) ? t('pedidoSemConta.faltaTelefone') : t('pedidoSemConta.faltaTermos') })}
    </Moldura>
  );
}
