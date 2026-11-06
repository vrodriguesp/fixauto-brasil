import { randomInt, createHash, randomUUID } from 'node:crypto';
import { TIPOS_SERVICO } from '@fixauto/shared';
import { supabaseAdmin } from './supabase-admin';
import { ErroValidacao, texto, numero, umDe, extensaoDe } from './validacao';
import { iguaisSeguro } from './segredos';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';
import { idiomaDoSite } from './site-url';
import { avisarOficinasDoPedido } from './avisar-oficinas-pedido';
import { avisarAdminSeSemOficinas } from './concierge';

// Pedido sem cadastro (dono 06/11; migracao 073). Regras que valem para o site
// e para o app (mesmas rotas):
// - o pedido so vai para as oficinas depois do CODIGO de 6 digitos enviado ao
//   e-mail (prova que o e-mail e da pessoa; e-mail errado nao some no vazio);
// - ate la ele fica em pedidos_pendentes, invisivel; sem confirmacao em 24 h,
//   tudo e apagado (pedido, fotos e a conta nao ativada);
// - e-mail de quem ja tem conta: entra com a senha ali mesmo ou pede o codigo;
//   nunca cria pedido na conta de outra pessoa so por saber o e-mail;
// - o carro: mesma placa (ou, sem placa, mesma marca/modelo/ano) de um carro
//   da conta = esse carro; senao um carro novo na conta.

export const PENDENTE_HORAS = 24;
export const CODIGO_TENTATIVAS = 5;
export const CODIGO_ENVIOS = 5;
const TIPOS = TIPOS_SERVICO.map((t) => t.value) as readonly string[];
const URGENCIAS = ['baixa', 'media', 'alta'] as const;
const TIPOS_VEICULO = ['cars', 'motorcycles', 'trucks'] as const;

export interface DadosPedido {
  tipo: string;
  descricao: string;
  urgencia: (typeof URGENCIAS)[number];
  endereco: string;
  latitude: number;
  longitude: number;
  pais: string | null;
  veiculo: { tipo: string; marca: string; modelo: string; ano: string; codigo: string | null; placa: string | null };
}

/** Valida o corpo do pedido (o mesmo formulario do site e do app). */
export function validarPedido(d: Record<string, unknown>): DadosPedido {
  const v = (d.veiculo && typeof d.veiculo === 'object' ? d.veiculo : {}) as Record<string, unknown>;
  const pais = typeof d.pais === 'string' && /^[A-Za-z]{2}$/.test(d.pais) ? d.pais.toUpperCase() : null;
  return {
    tipo: umDe(d.tipo, 'tipo', TIPOS),
    descricao: texto(d.descricao, 'descricao', 2000, true)!,
    urgencia: umDe(d.urgencia ?? 'media', 'urgencia', URGENCIAS),
    endereco: texto(d.endereco, 'endereco', 300, true)!,
    latitude: numero(d.latitude, 'latitude', -90, 90),
    longitude: numero(d.longitude, 'longitude', -180, 180),
    pais,
    veiculo: {
      tipo: umDe(v.tipo ?? 'cars', 'veiculo.tipo', TIPOS_VEICULO),
      marca: texto(v.marca, 'veiculo.marca', 60, true)!,
      modelo: texto(v.modelo, 'veiculo.modelo', 100, true)!,
      ano: texto(v.ano, 'veiculo.ano', 30, true)!,
      codigo: texto(v.codigo, 'veiculo.codigo', 30),
      placa: texto(v.placa, 'veiculo.placa', 15),
    },
  };
}

const normPlaca = (p: string | null | undefined) => (p || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

/** Carro do pedido: o da conta com a mesma placa (ou mesma marca/modelo/ano sem placa); senao um novo. */
export async function veiculoDoPedido(clienteId: string, v: DadosPedido['veiculo']): Promise<string> {
  const { data: meus } = await supabaseAdmin.from('veiculos')
    .select('id, placa, fipe_marca, fipe_modelo, fipe_ano').eq('profile_id', clienteId);
  const placa = normPlaca(v.placa);
  const igual = placa
    ? (meus || []).find((m) => normPlaca(m.placa) === placa)
    : (meus || []).find((m) => norm(m.fipe_marca) === norm(v.marca) && norm(m.fipe_modelo) === norm(v.modelo) && norm(m.fipe_ano) === norm(v.ano));
  if (igual) return igual.id;
  const { data: novo, error } = await supabaseAdmin.from('veiculos').insert({
    profile_id: clienteId, fipe_tipo: v.tipo, fipe_marca: v.marca, fipe_modelo: v.modelo, fipe_ano: v.ano,
    fipe_codigo: v.codigo, placa: v.placa, cor: null, apelido: null,
  }).select('id').single();
  if (error || !novo) throw new Error(error?.message || 'veiculo nao criado');
  return novo.id;
}

/** Cria a solicitacao (com fotos ja no storage) e avisa as oficinas do raio. */
export async function criarPedido(clienteId: string, d: DadosPedido, caminhosFotos: string[]): Promise<{ id: string; numero: number | null }> {
  const veiculoId = await veiculoDoPedido(clienteId, d.veiculo);
  const { data: sol, error } = await supabaseAdmin.from('solicitacoes').insert({
    cliente_id: clienteId, veiculo_id: veiculoId, tipo: d.tipo, descricao: d.descricao, urgencia: d.urgencia,
    latitude: d.latitude, longitude: d.longitude, endereco: d.endereco, pais: d.pais,
  }).select('id, numero').single();
  if (error || !sol) throw new Error(error?.message || 'solicitacao nao criada');
  for (const temporario of caminhosFotos) {
    // sai de pendentes/ (pasta que so guarda o que ainda nao foi confirmado)
    let caminho = `solicitacoes/${sol.id}/${temporario.split('/').pop()}`;
    const { error: mvErr } = await supabaseAdmin.storage.from('damage-photos').move(temporario, caminho);
    if (mvErr) { console.error('[pedido-sem-conta] mover foto', mvErr.message); caminho = temporario; }
    const url = supabaseAdmin.storage.from('damage-photos').getPublicUrl(caminho).data.publicUrl;
    await supabaseAdmin.from('solicitacao_fotos').insert({ solicitacao_id: sol.id, foto_url: url });
  }
  const avisadas = await avisarOficinasDoPedido(sol.id).catch((e) => { console.error('[pedido-sem-conta] oficinas', e); return 0; });
  if (avisadas >= 0) {
    const { data: p } = await supabaseAdmin.from('profiles').select('conta_teste').eq('id', clienteId).maybeSingle();
    await avisarAdminSeSemOficinas('pedido', sol.id, `${d.tipo} - ${d.descricao} - ${d.endereco}`, avisadas, !!p?.conta_teste)
      .catch((e) => console.error('[pedido-sem-conta] concierge', e));
  }
  return { id: sol.id, numero: (sol as any).numero ?? null };
}

/** Fotos do pedido pendente: nomes aleatorios em damage-photos/pendentes/<id>/. */
export async function guardarFotos(pendenteId: string, fotos: File[]): Promise<string[]> {
  const caminhos: string[] = [];
  for (const f of fotos) {
    const caminho = `pendentes/${pendenteId}/${randomUUID()}.${extensaoDe(f.type)}`;
    const { error } = await supabaseAdmin.storage.from('damage-photos')
      .upload(caminho, Buffer.from(await f.arrayBuffer()), { contentType: f.type });
    if (error) { console.error('[pedido-sem-conta] upload', error.message); continue; }
    caminhos.push(caminho);
  }
  return caminhos;
}

export const novoCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const hashCodigo = (pendenteId: string, codigo: string) => createHash('sha256').update(`${pendenteId}:${codigo}`).digest('hex');
export const codigoConfere = (pendenteId: string, codigo: string, hash: string) =>
  /^\d{6}$/.test(codigo) && iguaisSeguro(hashCodigo(pendenteId, codigo), hash);

// E-mail do codigo (6 idiomas). O codigo vai grande e sozinho na linha: no
// celular a pessoa le no app de e-mail e digita na tela do pedido.
const TXT: Record<string, { assunto: string; ola: string; texto: string; validade: string; ignore: string }> = {
  et: { assunto: 'Sinu BipFixi kood: {c}', ola: 'Tere, {n}!', texto: 'Sisesta see kood BipFixi päringu lehel, et päring töökodadele saata:', validade: 'Kood kehtib 24 tundi.', ignore: 'Kui sa päringut ei saatnud, ignoreeri seda kirja – ilma koodita ei saadeta midagi ja andmed kustutatakse 24 tunni pärast.' },
  ru: { assunto: 'Ваш код BipFix: {c}', ola: 'Здравствуйте, {n}!', texto: 'Введите этот код на странице заявки BipFix, чтобы отправить заявку автосервисам:', validade: 'Код действует 24 часа.', ignore: 'Если вы не отправляли заявку, просто проигнорируйте это письмо – без кода ничего не отправляется, а данные удаляются через 24 часа.' },
  en: { assunto: 'Your BipFix code: {c}', ola: 'Hello {n},', texto: 'Enter this code on the BipFix request page to send your request to the repair shops:', validade: 'The code is valid for 24 hours.', ignore: 'If you did not send a request, ignore this e-mail – nothing is sent without the code and the data is deleted after 24 hours.' },
  it: { assunto: 'Il tuo codice BipFix: {c}', ola: 'Ciao {n},', texto: 'Inserisci questo codice nella pagina della richiesta BipFix per inviarla alle officine:', validade: 'Il codice è valido per 24 ore.', ignore: 'Se non hai inviato una richiesta, ignora questa e-mail: senza il codice non viene inviato nulla e i dati vengono cancellati dopo 24 ore.' },
  pt: { assunto: 'Seu código BipFix: {c}', ola: 'Olá, {n}!', texto: 'Digite este código na página do pedido da BipFix para enviar o pedido às oficinas:', validade: 'O código vale por 24 horas.', ignore: 'Se você não enviou um pedido, ignore este e-mail – sem o código nada é enviado e os dados são apagados em 24 horas.' },
  'pt-PT': { assunto: 'O seu código BipFix: {c}', ola: 'Olá, {n}!', texto: 'Introduza este código na página do pedido da BipFix para enviar o pedido às oficinas:', validade: 'O código é válido durante 24 horas.', ignore: 'Se não enviou um pedido, ignore este e-mail – sem o código nada é enviado e os dados são apagados ao fim de 24 horas.' },
};

export async function enviarCodigo(email: string, nome: string, codigo: string, idioma: string | null): Promise<boolean> {
  const x = TXT[idiomaDoSite(idioma)] || TXT.en;
  const f = (s: string) => s.replace('{c}', codigo).replace('{n}', escapeHtml(nome));
  return enviarEmail({ para: email, assunto: f(x.assunto), html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0c4a6e;color:white;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">BipFix</h1></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
        <p>${f(x.ola)}</p>
        <p>${x.texto}</p>
        <p style="font-size:36px;font-weight:bold;letter-spacing:8px;margin:24px 0;color:#0c4a6e;">${codigo}</p>
        <p style="color:#6b7280;">${x.validade}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;">${x.ignore}</p>
      </div>
    </div>` });
}

/** Apaga pedidos nao confirmados com mais de 24 h: fotos, conta nao ativada e o registro. */
export async function limparPendentes(): Promise<number> {
  const limite = new Date(Date.now() - PENDENTE_HORAS * 3600 * 1000).toISOString();
  const { data: velhos } = await supabaseAdmin.from('pedidos_pendentes')
    .select('id, user_id, conta_nova, fotos').lt('created_at', limite).limit(200);
  for (const p of velhos || []) await apagarPendente(p);
  return (velhos || []).length;
}

export async function apagarPendente(p: { id: string; user_id: string; conta_nova: boolean; fotos: string[] | null }, manterConta = false) {
  if (p.fotos?.length) await supabaseAdmin.storage.from('damage-photos').remove(p.fotos);
  await supabaseAdmin.from('pedidos_pendentes').delete().eq('id', p.id);
  if (p.conta_nova && !manterConta) {
    // conta criada so para este pedido e nunca ativada (sem perfil): sai junto
    const { data: perfil } = await supabaseAdmin.from('profiles').select('id').eq('id', p.user_id).maybeSingle();
    if (!perfil) await supabaseAdmin.auth.admin.deleteUser(p.user_id).catch(() => {});
  }
}

/** Contagem anonima dos passos (sem IP, sem cookie). */
export async function contarEtapa(funil: string, etapa: string) {
  await supabaseAdmin.rpc('funil_incrementar', { p_funil: funil, p_etapa: etapa }).then(() => {}, () => {});
}
