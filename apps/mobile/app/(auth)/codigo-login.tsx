import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import RolagemTeclado from '../../components/RolagemTeclado';
import { useAuth } from '../../lib/auth-context';
import { API_BASE_URL } from '../../lib/api';
import { mensagemErro, ErroApi } from '../../lib/erro';

// "Receber um codigo por e-mail" (dono 12/11): mesmas rotas do site
// (/api/conta/codigo-login e /confirmar). Entra em contas com ou sem senha; a
// resposta do envio e igual exista ou nao a conta. Depois de entrar, o layout
// das abas mostra "crie a sua senha" se a conta ainda nao tem (app/criar-senha.tsx).
const CAMPO = 'border border-gray-300 rounded-xl px-4 py-3 text-[16px] bg-white';

export default function CodigoLoginScreen() {
  const { t, i18n } = useTranslation();
  const { email: emailInicial } = useLocalSearchParams<{ email?: string }>();
  const { signInComToken } = useAuth();
  const [email, setEmail] = useState(typeof emailInicial === 'string' ? emailInicial : '');
  const [id, setId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [esperaReenvio, setEsperaReenvio] = useState(0);

  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const i = setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => clearTimeout(i);
  }, [esperaReenvio]);

  const enviar = async () => {
    Keyboard.dismiss();
    if (!email.trim() || loading || esperaReenvio > 0) return;
    setErro(null); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/conta/codigo-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), idioma: i18n.language }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new ErroApi(res.status, d.codigo);
      setId(d.id); setCodigo(''); setEsperaReenvio(30);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setLoading(false);
    }
  };

  const entrar = async () => {
    Keyboard.dismiss();
    if (!id || codigo.length !== 6 || loading) return;
    setErro(null); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/conta/codigo-login/confirmar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, codigo }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 5 erros ou codigo vencido: volta ao e-mail para pedir outro
        if (d.codigo === 'CODIGO_TENTATIVAS' || d.codigo === 'CODIGO_EXPIRADO') { setId(null); setCodigo(''); setErro(t('auth.codigoVencido')); return; }
        throw new ErroApi(res.status, d.codigo);
      }
      const { error } = await signInComToken(d.tokenHash);
      if (error) {
        setErro(error === 'tipo_nao_suportado' ? t('auth.tipoNaoSuportado') : error === 'conta_desativada' ? t('auth.contaDesativada') : t('common.erroGenerico'));
        return;
      }
      // o layout de (auth) ja manda para as abas; as abas mostram "crie a sua senha" se faltar
      router.replace('/(tabs)');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <RolagemTeclado bottomOffset={24} className="flex-1" keyboardDismissMode="on-drag" contentContainerClassName="flex-grow justify-center px-6 py-8" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-gray-900 mb-2">{t('auth.codigoTitulo')}</Text>
        <Text className="text-gray-600 mb-6">{id ? t('auth.codigoEnviadoTexto', { email: email.trim() }) : t('auth.codigoTexto')}</Text>

        {erro && (
          <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            <Text accessibilityRole="alert" className="text-red-700 text-sm">{erro}</Text>
          </View>
        )}

        {!id ? (
          <>
            <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</Text>
            <TextInput autoCorrect={false} accessibilityLabel={t('auth.email')} value={email} onChangeText={setEmail}
              autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
              returnKeyType="go" onSubmitEditing={enviar} className={`${CAMPO} mb-6`} />
            <Pressable onPress={enviar} disabled={loading || !email.trim()} accessibilityRole="button" className="bg-primary-600 rounded-xl py-4 items-center disabled:opacity-50">
              {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('auth.enviarCodigo')}</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.codigo')}</Text>
            <TextInput accessibilityLabel={t('auth.codigo')} value={codigo} onChangeText={(v) => setCodigo(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} autoFocus
              className="border border-gray-300 rounded-xl px-4 py-3 text-2xl font-semibold text-center mb-4" style={{ letterSpacing: 8 }} />
            <Pressable onPress={entrar} disabled={loading || codigo.length !== 6} accessibilityRole="button" className="bg-primary-600 rounded-xl py-4 items-center disabled:opacity-50">
              {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('auth.entrar')}</Text>}
            </Pressable>
            <Text className="text-xs text-gray-500 mt-3">{t('auth.codigoSpam')}</Text>
            <Pressable onPress={enviar} disabled={esperaReenvio > 0 || loading} accessibilityRole="button" className="mt-2 min-h-[44px] justify-center">
              <Text className={esperaReenvio > 0 ? 'text-gray-400' : 'text-primary-600 underline'}>
                {esperaReenvio > 0 ? t('auth.reenviarEm', { s: esperaReenvio }) : t('auth.reenviarCodigo')}
              </Text>
            </Pressable>
            <Pressable onPress={() => { setId(null); setCodigo(''); setErro(null); }} accessibilityRole="button" className="min-h-[44px] justify-center">
              <Text className="text-gray-600 underline">{t('auth.outroEmail')}</Text>
            </Pressable>
          </>
        )}

        <Pressable onPress={() => router.back()} accessibilityRole="button" className="min-h-[48px] justify-center items-center mt-4">
          <Text className="text-gray-600">{t('common.voltar')}</Text>
        </Pressable>
      </RolagemTeclado>
    </SafeAreaView>
  );
}
