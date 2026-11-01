import { supabaseAdmin } from './supabase-admin';

// Push no celular (app fechado) pelo servico da Expo, que entrega pelo FCM
// (Android) e APNs (iPhone). Chamado pela rota /api/push/notificacao, que o
// banco aciona a cada aviso novo em `notificacoes` (migracao 066). O texto e
// o mesmo do aviso, ja no idioma de quem recebe.
// EXPO_PUSH_URL so muda no teste local (servidor falso, nada sai de verdade).
const EXPO_PUSH_URL = process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send';
const LOTE = 100; // limite da Expo por chamada

type Aviso = { id: string; profile_id: string; tipo: string; titulo: string; mensagem: string | null; dados: Record<string, unknown> | null };

export async function enviarPushDoAviso(avisoId: string): Promise<{ enviados: number; removidos: number }> {
  const { data: aviso } = await supabaseAdmin.from('notificacoes')
    .select('id, profile_id, tipo, titulo, mensagem, dados').eq('id', avisoId).maybeSingle<Aviso>();
  if (!aviso) return { enviados: 0, removidos: 0 };
  const { data: tokens } = await supabaseAdmin.from('push_tokens').select('token').eq('profile_id', aviso.profile_id);
  const lista = (tokens || []).map((t: any) => t.token as string).filter(Boolean);
  if (!lista.length) return { enviados: 0, removidos: 0 };

  const mensagens = lista.map((to) => ({
    to,
    title: aviso.titulo,
    body: aviso.mensagem || undefined,
    sound: 'default',
    priority: 'high',
    channelId: 'avisos',
    // o app abre a tela certa com os mesmos dados do aviso no app (lib/avisos.tsx)
    data: { ...(aviso.dados || {}), tipo: aviso.tipo, notificacao_id: aviso.id },
  }));

  let enviados = 0;
  const invalidos: string[] = [];
  for (let i = 0; i < mensagens.length; i += LOTE) {
    const lote = mensagens.slice(i, i + LOTE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(lote),
        signal: AbortSignal.timeout(10000),
      });
      const corpo = await res.json().catch(() => null) as { data?: { status: string; details?: { error?: string } }[] } | null;
      if (!res.ok || !Array.isArray(corpo?.data)) {
        console.error('[push] Expo respondeu', res.status);
        continue;
      }
      corpo!.data!.forEach((ticket, j) => {
        if (ticket.status === 'ok') enviados++;
        // aparelho desinstalou o app ou trocou de token: nao manda mais
        else if (ticket.details?.error === 'DeviceNotRegistered') invalidos.push(lote[j].to);
      });
    } catch (e) {
      console.error('[push] falha ao chamar a Expo', (e as Error).message);
    }
  }
  if (invalidos.length) await supabaseAdmin.from('push_tokens').delete().in('token', invalidos);
  return { enviados, removidos: invalidos.length };
}
