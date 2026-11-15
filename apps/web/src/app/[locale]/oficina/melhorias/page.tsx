'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// Pagina "Melhorias" da oficina (pedido do dono 15/11; migracao 084):
// - pesquisa curta sobre como a oficina marca a entrada dos carros (todas opcionais; UMA resposta por
//   oficina, editavel a qualquer hora - oficina_pesquisa_calendario);
// - caixa aberta de sugestoes (varias ao longo do tempo - oficina_sugestoes) com a lista das ja enviadas.
// So dono e funcionario admin (RLS: oficinas_que_gerencio). O admin le tudo em /admin/melhorias.

const COMO_MARCAM = ['telefone', 'mensageiro', 'email', 'site', 'programa', 'papel', 'outro'] as const;
const PROGRAMAS = ['nenhum', 'google', 'outlook', 'planilha', 'programa_oficina', 'outro'] as const;
// valor no banco -> chave do texto (chave sem '+'/'-')
const CARROS_DIA: Record<string, string> = { '1-3': 'ate3', '4-8': 'ate8', '9-15': 'ate15', '15+': 'mais15' };
const HORA_CLIENTE = ['exata', 'faixa', 'manha_tarde', 'telefone'] as const;
const CALENDARIO = ['sim', 'talvez', 'nao'] as const;

interface Pesquisa {
  como_marcam: string[];
  como_marcam_outro: string;
  programa: string | null;
  programa_nome: string;
  carros_dia: string | null;
  hora_cliente: string | null;
  calendario_externo: string | null;
  maior_tempo: string;
}
const VAZIA: Pesquisa = { como_marcam: [], como_marcam_outro: '', programa: null, programa_nome: '', carros_dia: null, hora_cliente: null, calendario_externo: null, maior_tempo: '' };
interface Sugestao { id: string; texto: string; created_at: string }

const linha = 'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 has-[:checked]:border-primary-400 has-[:checked]:bg-primary-50';
const campo = 'input-field mt-2 w-full';

function Radio({ nome, valor, atual, rotulo, onChange }: { nome: string; valor: string; atual: string | null; rotulo: string; onChange: (v: string) => void }) {
  return (
    <label className={linha}>
      <input type="radio" name={nome} value={valor} checked={atual === valor} onChange={() => onChange(valor)} className="h-5 w-5 shrink-0" data-testid={`${nome}-${valor}`} />
      <span>{rotulo}</span>
    </label>
  );
}

export default function OficinaMelhoriasPage() {
  const t = useTranslations('oficinaMelhorias');
  const locale = useLocale();
  const { oficina, funcionario, loading } = useAuth();
  const podeUsar = !!oficina && (!funcionario || funcionario.cargo === 'admin');

  const [p, setP] = useState<Pesquisa>(VAZIA);
  const [salvaEm, setSalvaEm] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [statusPesquisa, setStatusPesquisa] = useState<'salva' | 'erro' | null>(null);

  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [statusSugestao, setStatusSugestao] = useState<'enviada' | 'erro' | 'curta' | null>(null);

  const carregar = useCallback(async () => {
    if (!oficina) return;
    const [{ data: r }, { data: s }] = await Promise.all([
      supabase.from('oficina_pesquisa_calendario').select('*').eq('oficina_id', oficina.id).maybeSingle(),
      supabase.from('oficina_sugestoes').select('id, texto, created_at').eq('oficina_id', oficina.id).order('created_at', { ascending: false }).limit(50),
    ]);
    if (r) {
      setP({
        como_marcam: r.como_marcam || [], como_marcam_outro: r.como_marcam_outro || '', programa: r.programa, programa_nome: r.programa_nome || '',
        carros_dia: r.carros_dia, hora_cliente: r.hora_cliente, calendario_externo: r.calendario_externo, maior_tempo: r.maior_tempo || '',
      });
      setSalvaEm(r.updated_at);
    }
    setSugestoes((s as Sugestao[]) || []);
    setCarregando(false);
  }, [oficina?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (podeUsar) carregar().catch(() => setCarregando(false)); }, [podeUsar, carregar]);

  const quando = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const mudar = (parcial: Partial<Pesquisa>) => { setP((x) => ({ ...x, ...parcial })); setStatusPesquisa(null); };
  const alternar = (v: string) => mudar({ como_marcam: p.como_marcam.includes(v) ? p.como_marcam.filter((x) => x !== v) : [...p.como_marcam, v] });

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oficina || salvando) return;
    setSalvando(true); setStatusPesquisa(null);
    const limpo = (s: string) => s.trim().slice(0, 2000) || null;
    const { data, error } = await supabase.from('oficina_pesquisa_calendario').upsert({
      oficina_id: oficina.id,
      como_marcam: p.como_marcam,
      como_marcam_outro: p.como_marcam.includes('outro') ? limpo(p.como_marcam_outro)?.slice(0, 200) ?? null : null,
      programa: p.programa,
      programa_nome: p.programa === 'programa_oficina' || p.programa === 'outro' ? limpo(p.programa_nome)?.slice(0, 200) ?? null : null,
      carros_dia: p.carros_dia,
      hora_cliente: p.hora_cliente,
      calendario_externo: p.calendario_externo,
      maior_tempo: limpo(p.maior_tempo),
    }, { onConflict: 'oficina_id' }).select('updated_at').single();
    setSalvando(false);
    if (error) { setStatusPesquisa('erro'); return; }
    setSalvaEm(data?.updated_at || new Date().toISOString());
    setStatusPesquisa('salva');
  };

  const enviarSugestao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oficina || enviando) return;
    const txt = texto.trim();
    if (txt.length < 3) { setStatusSugestao('curta'); return; }
    setEnviando(true); setStatusSugestao(null);
    const { data, error } = await supabase.from('oficina_sugestoes').insert({ oficina_id: oficina.id, texto: txt.slice(0, 2000) }).select('id, texto, created_at').single();
    setEnviando(false);
    if (error || !data) { setStatusSugestao('erro'); return; }
    setSugestoes((s) => [data as Sugestao, ...s]);
    setTexto('');
    setStatusSugestao('enviada');
  };

  // espera tambem a pesquisa: o formulario crescia depois e empurrava "Sugestoes" (CLS, Clarity 15/11)
  if (loading || (podeUsar && carregando)) return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-gray-400">{t('carregando')}</div>;
  if (!podeUsar) return <div className="max-w-3xl mx-auto px-4 py-20 text-center text-gray-600">{t('soGestor')}</div>;


  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-10">
      <h1 className="text-2xl font-bold text-gray-900">{t('titulo')}</h1>
      <p className="mt-1 text-gray-600">{t('subtitulo')}</p>

      {/* o que mudou (o aviso "Novidades" do sino leva para ca) */}
      <section className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-labelledby="mel-novo">
        <h2 id="mel-novo" className="text-base font-semibold text-blue-950">✨ {t('novidadesTitulo')}</h2>
        <p className="mt-1 text-sm text-blue-900">{t('novidadesTexto')}</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Link href="/oficina/perfil#recepcao" className="btn-secondary min-h-[44px] !py-2 text-center text-sm" data-testid="melhorias-perfil">{t('novidadesPerfil')}</Link>
          <Link href="/oficina/aprender?tema=horarios-checkin" className="btn-secondary min-h-[44px] !py-2 text-center text-sm" data-testid="melhorias-aprender">{t('novidadesAprender')}</Link>
        </div>
      </section>

      {/* pesquisa do calendario */}
      <form onSubmit={salvar} className="card mt-6" aria-labelledby="mel-pesquisa" data-testid="pesquisa-calendario">
        <h2 id="mel-pesquisa" className="text-xl font-semibold text-gray-900">📅 {t('pesquisaTitulo')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('pesquisaTexto')}</p>
        {carregando ? <p className="mt-4 text-sm text-gray-400">{t('carregando')}</p> : (
          <div className="mt-4 space-y-6">
            <fieldset>
              <legend className="font-medium text-gray-900">1. {t('p1.pergunta')}</legend>
              <p className="text-xs text-gray-500">{t('variasRespostas')}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {COMO_MARCAM.map((v) => (
                  <label key={v} className={linha}>
                    <input type="checkbox" checked={p.como_marcam.includes(v)} onChange={() => alternar(v)} className="h-5 w-5 shrink-0" data-testid={`p1-${v}`} />
                    <span>{t(`p1.opcoes.${v}`)}</span>
                  </label>
                ))}
              </div>
              {p.como_marcam.includes('outro') && (
                <input type="text" maxLength={200} value={p.como_marcam_outro} onChange={(e) => mudar({ como_marcam_outro: e.target.value })}
                  placeholder={t('p1.outroPlaceholder')} aria-label={t('p1.outroPlaceholder')} className={campo} data-testid="p1-outro-texto" />
              )}
            </fieldset>

            <fieldset>
              <legend className="font-medium text-gray-900">2. {t('p2.pergunta')}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {PROGRAMAS.map((v) => <Radio key={v} nome="p2" valor={v} atual={p.programa} rotulo={t(`p2.opcoes.${v}`)} onChange={(x) => mudar({ programa: x })} />)}
              </div>
              {(p.programa === 'programa_oficina' || p.programa === 'outro') && (
                <input type="text" maxLength={200} value={p.programa_nome} onChange={(e) => mudar({ programa_nome: e.target.value })}
                  placeholder={t('p2.nomePlaceholder')} aria-label={t('p2.nomePlaceholder')} className={campo} data-testid="p2-nome" />
              )}
            </fieldset>

            <fieldset>
              <legend className="font-medium text-gray-900">3. {t('p3.pergunta')}</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(CARROS_DIA).map(([v, k]) => <Radio key={v} nome="p3" valor={v} atual={p.carros_dia} rotulo={t(`p3.opcoes.${k}`)} onChange={(x) => mudar({ carros_dia: x })} />)}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-medium text-gray-900">4. {t('p4.pergunta')}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {HORA_CLIENTE.map((v) => <Radio key={v} nome="p4" valor={v} atual={p.hora_cliente} rotulo={t(`p4.opcoes.${v}`)} onChange={(x) => mudar({ hora_cliente: x })} />)}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-medium text-gray-900">5. {t('p5.pergunta')}</legend>
              <div className="mt-2 grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
                {CALENDARIO.map((v) => <Radio key={v} nome="p5" valor={v} atual={p.calendario_externo} rotulo={t(`p5.opcoes.${v}`)} onChange={(x) => mudar({ calendario_externo: x })} />)}
              </div>
            </fieldset>

            <div>
              <label htmlFor="p6" className="font-medium text-gray-900">6. {t('p6.pergunta')}</label>
              <textarea id="p6" rows={3} maxLength={2000} value={p.maior_tempo} onChange={(e) => mudar({ maior_tempo: e.target.value })}
                placeholder={t('p6.placeholder')} className={campo} data-testid="p6" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={salvando} className="btn-primary min-h-[44px] disabled:opacity-60" data-testid="pesquisa-salvar">
                {salvando ? t('salvando') : salvaEm ? t('salvarAlteracoes') : t('salvar')}
              </button>
              {salvaEm && <span className="text-xs text-gray-500" data-testid="pesquisa-salva-em">{t('salvaEm', { data: quando(salvaEm) })}</span>}
            </div>
            {statusPesquisa === 'salva' && <p role="status" className="text-sm text-green-700" data-testid="pesquisa-ok">✅ {t('obrigado')}</p>}
            {statusPesquisa === 'erro' && <p role="alert" className="text-sm text-red-700">{t('erroSalvar')}</p>}
          </div>
        )}
      </form>

      {/* caixa de sugestoes */}
      <section className="card mt-6" aria-labelledby="mel-sugestao" data-testid="sugestoes">
        <h2 id="mel-sugestao" className="text-xl font-semibold text-gray-900">💡 {t('sugestaoTitulo')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('sugestaoTexto')}</p>
        <form onSubmit={enviarSugestao} className="mt-3">
          <label htmlFor="sugestao" className="sr-only">{t('sugestaoTitulo')}</label>
          <textarea id="sugestao" rows={4} maxLength={2000} value={texto} onChange={(e) => { setTexto(e.target.value); setStatusSugestao(null); }}
            placeholder={t('sugestaoPlaceholder')} className="input-field w-full" data-testid="sugestao-texto" />
          <button type="submit" disabled={enviando} className="btn-primary mt-2 min-h-[44px] disabled:opacity-60" data-testid="sugestao-enviar">
            {enviando ? t('enviando') : t('enviar')}
          </button>
          {statusSugestao === 'enviada' && <p role="status" className="mt-2 text-sm text-green-700" data-testid="sugestao-ok">✅ {t('enviada')}</p>}
          {statusSugestao === 'curta' && <p role="alert" className="mt-2 text-sm text-red-700">{t('erroCurta')}</p>}
          {statusSugestao === 'erro' && <p role="alert" className="mt-2 text-sm text-red-700">{t('erroEnviar')}</p>}
        </form>

        <h3 className="mt-6 text-sm font-semibold text-gray-900">{t('minhasSugestoes')}</h3>
        {sugestoes.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">{t('semSugestoes')}</p>
        ) : (
          <ul className="mt-2 space-y-2" data-testid="sugestoes-lista">
            {sugestoes.map((s) => (
              <li key={s.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{s.texto}</p>
                <p className="mt-1 text-xs text-gray-500">{quando(s.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
