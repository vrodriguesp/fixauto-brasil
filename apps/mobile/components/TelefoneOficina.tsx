import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import CampoTelefone from './CampoTelefone';

// Telefone do motorista para a oficina (dono 13/11) - o mesmo do site
// (apps/web/src/components/cliente/TelefoneOficina.tsx):
// - depois do aceite: sem telefone no perfil, pede o numero (o perfil so e visivel
//   para a oficina com orcamento aceito - migracao 074);
// - antes do aceite: envia o numero a UMA oficina (registrado para ela ligar da
//   pagina do pedido, migracao 081, e tambem na conversa). As outras nao veem.
const telefoneOk = (v: string) => v.replace(/\D/g, '').length >= 8;

export function TelefoneDepoisDoAceite({ oficinaNome }: { oficinaNome: string }) {
  const { t } = useTranslation();
  const { user, refreshProfile } = useAuth();
  const [telefone, setTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  if (!user || user.tipo !== 'cliente') return null;
  if (salvo) return <Text accessibilityRole="alert" className="text-sm text-emerald-800 mb-3" testID="telefone-salvo">{t('telefoneOficina.salvo', { oficina: oficinaNome })}</Text>;
  if (user.telefone) {
    return (
      <View className="flex-row flex-wrap items-center mb-3" testID="telefone-oficina-ve">
        <Text className="text-sm text-gray-700">{t('telefoneOficina.seuNumero', { tel: user.telefone })} · </Text>
        <Pressable onPress={() => router.push('/(tabs)/perfil')} accessibilityRole="link" hitSlop={8}>
          <Text className="text-sm text-primary-700 underline">{t('telefoneOficina.alterar')}</Text>
        </Pressable>
      </View>
    );
  }
  const salvar = async () => {
    Keyboard.dismiss();
    if (salvando) return;
    if (!telefoneOk(telefone)) { setErro(t('telefoneOficina.numeroInvalido')); return; }
    setSalvando(true); setErro('');
    const { error } = await supabase.from('profiles').update({ telefone: telefone.trim() }).eq('id', user.id);
    setSalvando(false);
    if (error) { setErro(t('telefoneOficina.erro')); return; }
    setSalvo(true);
    refreshProfile().catch(() => {});
  };
  return (
    <View className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-3" testID="telefone-depois-aceite">
      <Text className="font-semibold text-gray-900">📞 {t('telefoneOficina.avisoTitulo')}</Text>
      <Text className="text-sm text-gray-700 mt-1 mb-3">{t('telefoneOficina.avisoTexto', { oficina: oficinaNome })}</Text>
      <CampoTelefone rotulo={t('pedidoSemConta.telefone')} value={telefone} onChange={(v) => { setTelefone(v); setErro(''); }} />
      {erro ? <Text accessibilityRole="alert" className="text-sm text-red-700 mt-1">{erro}</Text> : null}
      <View className="flex-row items-start gap-1.5 mt-2">
        <Ionicons name="lock-closed-outline" size={14} color="#15803d" style={{ marginTop: 2 }} />
        <Text className="flex-1 text-xs text-gray-600">{t('telefoneOficina.privacidade')}</Text>
      </View>
      <Pressable onPress={salvar} disabled={salvando} accessibilityRole="button" className="bg-primary-600 rounded-lg py-3 items-center mt-3 disabled:opacity-50" testID="telefone-aceite-salvar">
        {salvando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('telefoneOficina.salvar')}</Text>}
      </Pressable>
    </View>
  );
}

export function CompartilharTelefone({ solicitacaoId, oficinaId, oficinaNome }: { solicitacaoId: string; oficinaId: string; oficinaNome: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);
  if (!user || user.tipo !== 'cliente') return null;
  if (enviado) return <Text accessibilityRole="alert" className="text-sm text-emerald-800 mb-3" testID="telefone-compartilhado">✓ {t('telefoneOficina.compartilhado')}</Text>;
  if (!aberto) {
    return (
      <Pressable onPress={() => { setAberto(true); setTelefone(user.telefone || ''); }} accessibilityRole="button"
        className="self-start mb-3 bg-white border border-primary-200 rounded-lg px-3 py-2" testID="compartilhar-telefone">
        <Text className="text-primary-700 text-sm font-medium">📞 {t('telefoneOficina.compartilhar')}</Text>
      </Pressable>
    );
  }
  const enviar = async () => {
    Keyboard.dismiss();
    if (enviando) return;
    if (!telefoneOk(telefone)) { setErro(t('telefoneOficina.numeroInvalido')); return; }
    setEnviando(true); setErro('');
    const r = await apiFetch(`/api/solicitacoes/${solicitacaoId}/compartilhar-telefone`, { method: 'POST', body: JSON.stringify({ oficinaId, telefone: telefone.trim() }) }).catch(() => null);
    setEnviando(false);
    if (!r?.ok) { setErro(t('telefoneOficina.erro')); return; }
    setEnviado(true);
  };
  return (
    <View className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-3" testID="compartilhar-telefone-painel">
      <Text className="text-xs text-gray-700 mb-2">{t('telefoneOficina.compartilharTexto', { oficina: oficinaNome })}</Text>
      <CampoTelefone rotulo={t('pedidoSemConta.telefone')} value={telefone} onChange={(v) => { setTelefone(v); setErro(''); }} />
      {erro ? <Text accessibilityRole="alert" className="text-sm text-red-700 mt-1">{erro}</Text> : null}
      <View className="flex-row gap-2 mt-2">
        <Pressable onPress={enviar} disabled={enviando} accessibilityRole="button" className="flex-1 bg-primary-600 rounded-lg py-3 items-center disabled:opacity-50" testID="compartilhar-telefone-enviar">
          {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">{t('telefoneOficina.compartilharEnviar')}</Text>}
        </Pressable>
        <Pressable onPress={() => { setAberto(false); setErro(''); }} accessibilityRole="button" className="flex-1 border border-gray-300 rounded-lg py-3 items-center">
          <Text className="text-gray-700 font-semibold">{t('telefoneOficina.cancelar')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
