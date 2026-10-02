'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { SEGURADORAS, regiaoSeguro, usaSeguro, type PagamentoReparo } from '@/lib/seguro-reparo';

export interface ValorSeguro {
  pagamento_reparo: PagamentoReparo | '';
  seguradora: string;
  sinistro_numero: string;
  franquia: string;
}

export const SEGURO_VAZIO: ValorSeguro = { pagamento_reparo: '', seguradora: '', sinistro_numero: '', franquia: '' };

type TipoAcidente = 'eu_causei' | 'outro_causou' | 'sem_outro';

// Ordem das opcoes pelo que aconteceu: com culpa do outro, o seguro dele vem
// primeiro; sem outro veiculo, o seguro do outro nem aparece.
function opcoesPara(tipo: TipoAcidente): PagamentoReparo[] {
  if (tipo === 'outro_causou') return ['seguro_terceiro', 'seguro_proprio', 'proprio', 'nao_sei'];
  if (tipo === 'eu_causei') return ['seguro_proprio', 'proprio', 'nao_sei'];
  return ['seguro_proprio', 'proprio', 'nao_sei'];
}

/** Pergunta "quem vai pagar o conserto?" com os campos do seguro e uma dica. */
export function SeguroReparoCampos({ valor, onChange, tipoAcidente, pais }: { valor: ValorSeguro; onChange: (v: ValorSeguro) => void; tipoAcidente: TipoAcidente; pais?: string | null }) {
  const t = useTranslations('seguroReparo');
  const regiao = regiaoSeguro(useLocale(), pais);
  const set = (p: Partial<ValorSeguro>) => onChange({ ...valor, ...p });
  const p = valor.pagamento_reparo;

  return (
    <fieldset className="space-y-3">
      <legend className="block text-sm font-medium text-gray-700">{t('titulo')}</legend>
      <p className="text-xs text-gray-500 -mt-1">{t('subtitulo')}</p>
      <div className="space-y-2">
        {opcoesPara(tipoAcidente).map((op) => (
          <label key={op} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer min-h-[44px] ${p === op ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <input type="radio" name="pagamento_reparo" value={op} checked={p === op} onChange={() => set({ pagamento_reparo: op })} className="flex-shrink-0" />
            <span className="text-sm text-gray-900">{t(`opcao_${op}`)}</span>
          </label>
        ))}
      </div>

      {usaSeguro(p) && (
        <div className="space-y-3 rounded-lg bg-gray-50 p-3">
          <div>
            <label htmlFor="seguradora" className="block text-sm font-medium text-gray-700 mb-1">{t('labelSeguradora')}</label>
            <input id="seguradora" className="input-field" list="lista-seguradoras" maxLength={100} value={valor.seguradora} onChange={(e) => set({ seguradora: e.target.value })} />
            <datalist id="lista-seguradoras">
              {SEGURADORAS[regiao].map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="sinistro" className="block text-sm font-medium text-gray-700 mb-1">{t('labelSinistro')}</label>
            <input id="sinistro" className="input-field" maxLength={60} value={valor.sinistro_numero} onChange={(e) => set({ sinistro_numero: e.target.value })} />
            <p className="text-xs text-gray-500 mt-1">{t('ajudaSinistro')}</p>
          </div>
          {p === 'seguro_proprio' && (
            <div>
              <label htmlFor="franquia" className="block text-sm font-medium text-gray-700 mb-1">{t('labelFranquia')}</label>
              <input id="franquia" className="input-field" inputMode="decimal" maxLength={12} value={valor.franquia} onChange={(e) => set({ franquia: e.target.value.replace(/[^\d.,]/g, '') })} />
              <p className="text-xs text-gray-500 mt-1">{t('ajudaFranquia')}</p>
            </div>
          )}
        </div>
      )}

      {p && (
        <p className="text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg p-3">
          {t(usaSeguro(p) ? `dica_${p}_${regiao}` : `dica_${p}`)}
        </p>
      )}
    </fieldset>
  );
}

/** Lista "o que fazer agora" da tela de sucesso, conforme o caso. */
export function ProximosPassosSeguro({ pagamento, tipoAcidente, pais }: { pagamento: PagamentoReparo | ''; tipoAcidente: TipoAcidente; pais?: string | null }) {
  const t = useTranslations('seguroReparo');
  const regiao = regiaoSeguro(useLocale(), pais);
  const passos: string[] = [t(`passo_emergencia_${regiao}`)];
  if (tipoAcidente !== 'sem_outro') passos.push(t(`passo_registro_${regiao}`));
  if (usaSeguro(pagamento)) {
    passos.push(t('passo_seguro'));
    passos.push(t('passo_oficina_seguro'));
  } else if (pagamento === 'nao_sei' || !pagamento) {
    passos.push(t('passo_nao_sei'));
  } else {
    passos.push(t('passo_proprio'));
  }
  return (
    <div className="card text-left mb-6">
      <h2 className="font-semibold text-gray-900 mb-3">{t('proximosTitulo')}</h2>
      <ol className="space-y-2">
        {passos.map((p, i) => (
          <li key={i} className="flex gap-3 text-sm text-gray-700">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Pagina do acidente: mostra e deixa o dono atualizar os dados do seguro. */
export function SeguroReparoEditor({
  inicial, tipoAcidente, podeEditar, salvar,
}: {
  inicial: ValorSeguro;
  tipoAcidente: TipoAcidente;
  podeEditar: boolean;
  salvar: (v: ValorSeguro) => Promise<boolean>;
}) {
  const t = useTranslations('seguroReparo');
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(inicial);
  const [atual, setAtual] = useState(inicial);
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo' | 'erro'>('');
  const p = atual.pagamento_reparo;

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold text-gray-900">{t('secaoTitulo')}</h2>
        {podeEditar && !editando && (
          <button type="button" onClick={() => { setValor(atual); setEditando(true); setEstado(''); }} className="text-sm font-medium text-primary-600 py-2">
            {p ? t('editar') : t('informar')}
          </button>
        )}
      </div>
      {editando ? (
        <div className="space-y-3">
          <SeguroReparoCampos valor={valor} onChange={setValor} tipoAcidente={tipoAcidente} />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={estado === 'salvando' || !valor.pagamento_reparo}
              onClick={async () => {
                setEstado('salvando');
                const ok = await salvar(valor);
                setEstado(ok ? 'salvo' : 'erro');
                if (ok) { setAtual(valor); setEditando(false); }
              }}
            >
              {t('salvar')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditando(false)}>{t('cancelar')}</button>
          </div>
          {estado === 'erro' && <p className="text-sm text-red-700" role="alert">{t('erroSalvar')}</p>}
        </div>
      ) : p ? (
        <dl className="text-sm space-y-1">
          <div><dt className="inline text-gray-500">{t('labelPagamento')}: </dt><dd className="inline text-gray-900 font-medium">{t(`opcao_${p}`)}</dd></div>
          {atual.seguradora && <div><dt className="inline text-gray-500">{t('labelSeguradora')}: </dt><dd className="inline text-gray-900">{atual.seguradora}</dd></div>}
          {atual.sinistro_numero && <div><dt className="inline text-gray-500">{t('labelSinistro')}: </dt><dd className="inline text-gray-900 break-all">{atual.sinistro_numero}</dd></div>}
          {atual.franquia && <div><dt className="inline text-gray-500">{t('labelFranquia')}: </dt><dd className="inline text-gray-900">{atual.franquia}</dd></div>}
          {estado === 'salvo' && <p className="text-green-700 pt-1" role="status">{t('salvo')}</p>}
          {usaSeguro(p) && !atual.sinistro_numero && <p className="text-amber-800 bg-amber-50 rounded p-2 mt-2">{t('lembreteSinistro')}</p>}
        </dl>
      ) : (
        <p className="text-sm text-gray-500">{t('naoInformado')}</p>
      )}
    </div>
  );
}
