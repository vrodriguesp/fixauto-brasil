'use client';

import { useTranslations } from 'next-intl';
import {
  CATEGORIAS_LOJA, DIAS_LOJA, MAX_DESCRICAO, faltandoParaIndexar, lerMarcas, limparHorario,
  type HorarioLoja, type ItemFaltando,
} from '@/lib/loja-publica-regras';

// Pecas lote 4 (18/11): secao "Pagina publica" do perfil da loja. Controlada pela pagina do perfil (grava junto
// com o resto no "Salvar"). So aparece quando a pagina esta liberada para a loja (interruptor proprio ou conta
// de teste; GET /api/loja/pagina-publica). Mostra o que falta para ir ao Google (mesma regra do servidor).

export interface ValorPaginaPublica {
  pagina_publica: boolean;
  descricao: string;
  categorias: string[];
  marcasTexto: string;
  entrega: boolean;
  horario: HorarioLoja;
}

export const HORARIO_VAZIO = Object.fromEntries(DIAS_LOJA.map((d) => [d, { aberto: false, inicio: '08:00', fim: '17:00' }])) as HorarioLoja;

export function paginaPublicaDoPerfil(loja: any): ValorPaginaPublica {
  return {
    pagina_publica: !!loja?.pagina_publica,
    descricao: loja?.descricao || '',
    categorias: Array.isArray(loja?.categorias) ? loja.categorias : [],
    marcasTexto: Array.isArray(loja?.marcas) ? loja.marcas.join(', ') : '',
    entrega: !!loja?.entrega,
    horario: { ...HORARIO_VAZIO, ...(loja?.horario_funcionamento || {}) },
  };
}

/** Colunas da 097 (lote 4) para o update de lojas_pecas. */
export function colunasPaginaPublica(v: ValorPaginaPublica) {
  return {
    pagina_publica: v.pagina_publica,
    descricao: v.descricao.trim().slice(0, MAX_DESCRICAO) || null,
    categorias: v.categorias.filter((c) => (CATEGORIAS_LOJA as readonly string[]).includes(c)),
    marcas: lerMarcas(v.marcasTexto),
    entrega: v.entrega,
    // C-3: so seg..dom e horas HH:MM (o CHECK da 097 recusa o resto e o update inteiro falharia)
    horario_funcionamento: limparHorario(v.horario),
  };
}

interface Props {
  valor: ValorPaginaPublica;
  aoMudar: (v: ValorPaginaPublica) => void;
  endereco: { latitude: number | null; longitude: number | null; cidade: string; endereco: string };
  teste: boolean;
  /** endereco da pagina (so quando ela existe, depois de salvar) */
  url: string | null;
}

export default function PaginaPublicaLoja({ valor, aoMudar, endereco, teste, url }: Props) {
  const t = useTranslations('lojaPerfil.publica');
  const tp = useTranslations('lojaPublica');
  const set = (p: Partial<ValorPaginaPublica>) => aoMudar({ ...valor, ...p });
  const faltando: ItemFaltando[] = faltandoParaIndexar({
    descricao: valor.descricao, categorias: valor.categorias, horario_funcionamento: valor.horario,
    latitude: endereco.latitude, longitude: endereco.longitude, cidade: endereco.cidade, endereco: endereco.endereco,
  });

  return (
    <div className="card mt-6 space-y-4" data-testid="loja-pagina-publica">
      <div>
        <h2 className="font-semibold text-gray-900">{t('titulo')}</h2>
        <p className="text-sm text-gray-600 mt-1">{t('ajuda')}</p>
      </div>

      <label className="flex min-h-[44px] items-center gap-3">
        <input type="checkbox" className="w-5 h-5 text-primary-600 rounded" checked={valor.pagina_publica} onChange={(e) => set({ pagina_publica: e.target.checked })} data-testid="loja-pagina-publica-mostrar" />
        <span className="text-sm font-medium text-gray-800">{t('mostrar')}</span>
      </label>

      <div>
        <label htmlFor="loja-pub-descricao" className="block text-sm font-medium text-gray-700 mb-1">{t('descricao')}</label>
        <textarea id="loja-pub-descricao" data-testid="loja-pagina-publica-descricao" className="input-field min-h-[110px]" maxLength={MAX_DESCRICAO}
          value={valor.descricao} onChange={(e) => set({ descricao: e.target.value })} />
        <p className="text-xs text-gray-500 mt-1">{t('descricaoAjuda')} ({valor.descricao.trim().length}/{MAX_DESCRICAO})</p>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">{t('categorias')}</legend>
        <div className="flex flex-wrap gap-2" data-testid="loja-pagina-publica-categorias">
          {CATEGORIAS_LOJA.map((c) => {
            const marcado = valor.categorias.includes(c);
            return (
              <label key={c} className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-sm cursor-pointer ${marcado ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-300 text-gray-700'}`}>
                <input type="checkbox" className="sr-only" checked={marcado} data-categoria={c}
                  onChange={(e) => set({ categorias: e.target.checked ? [...valor.categorias, c] : valor.categorias.filter((x) => x !== c) })} />
                {tp(`categoria.${c}`)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="loja-pub-marcas" className="block text-sm font-medium text-gray-700 mb-1">{t('marcas')}</label>
        <input id="loja-pub-marcas" data-testid="loja-pagina-publica-marcas" type="text" className="input-field" maxLength={600}
          value={valor.marcasTexto} onChange={(e) => set({ marcasTexto: e.target.value })} />
        <p className="text-xs text-gray-500 mt-1">{t('marcasAjuda')}</p>
      </div>

      <label className="flex min-h-[44px] items-center gap-3">
        <input type="checkbox" className="w-5 h-5 text-primary-600 rounded" checked={valor.entrega} onChange={(e) => set({ entrega: e.target.checked })} data-testid="loja-pagina-publica-entrega" />
        <span className="text-sm text-gray-800">{t('entrega')}</span>
      </label>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">{t('horario')}</legend>
        <div className="space-y-2" data-testid="loja-pagina-publica-horario">
          {DIAS_LOJA.map((d) => {
            const h = valor.horario[d] || { aberto: false, inicio: '08:00', fim: '17:00' };
            const mudar = (p: Partial<typeof h>) => set({ horario: { ...valor.horario, [d]: { ...h, ...p } } });
            return (
              <div key={d} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <label className="flex min-h-[44px] items-center gap-2 w-36 shrink-0">
                  <input type="checkbox" className="w-4 h-4 text-primary-600 rounded" checked={h.aberto} data-dia={d} onChange={(e) => mudar({ aberto: e.target.checked })} />
                  <span className="text-sm text-gray-700">{tp(`dia.${d}`)}</span>
                </label>
                {h.aberto ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <input type="time" aria-label={`${tp(`dia.${d}`)} ${t('horario')}`} className="input-field !py-1 !px-2 text-sm !w-[6.75rem] min-w-0" value={h.inicio} onChange={(e) => mudar({ inicio: e.target.value })} />
                    <span className="text-gray-400">{t('ate')}</span>
                    <input type="time" aria-label={`${tp(`dia.${d}`)} ${t('ate')}`} className="input-field !py-1 !px-2 text-sm !w-[6.75rem] min-w-0" value={h.fim} onChange={(e) => mudar({ fim: e.target.value })} />
                  </div>
                ) : <span className="text-sm text-gray-400">{t('fechado')}</span>}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="rounded-lg bg-gray-50 p-3 text-sm" data-testid="loja-pagina-publica-estado">
        {teste && <p className="text-amber-800 mb-2" data-testid="loja-pagina-publica-teste">{t('testeNoindex')}</p>}
        {!valor.pagina_publica ? (
          <p className="text-gray-700">{t('desligada')}</p>
        ) : faltando.length ? (
          <>
            <p className="font-medium text-gray-800">{t('faltaTitulo')}</p>
            <ul className="list-disc pl-5 mt-1 text-gray-700" data-testid="loja-pagina-publica-falta">
              {faltando.map((f) => <li key={f} data-falta={f}>{t(`falta.${f}`)}</li>)}
            </ul>
          </>
        ) : (
          <p className="text-green-700" data-testid="loja-pagina-publica-pronta">{t('prontaGoogle')}</p>
        )}
        {url && valor.pagina_publica && (
          <a href={url} target="_blank" rel="noopener" className="inline-block mt-2 text-primary-700 font-medium hover:underline" data-testid="loja-pagina-publica-link">{t('verPagina')} ↗</a>
        )}
      </div>
    </div>
  );
}
