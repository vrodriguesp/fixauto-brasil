'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

export interface TutorialModulo {
  id: string;
  emoji: string;
  titulo: string;
  resumo: string;
  passosGuiados: string[];
  desafio: string;
  linkReal: string;
  linkRotulo?: string;
  opcional?: boolean;
  dica?: string;
  verificar?: () => Promise<boolean>;
}

interface Props {
  titulo: string;
  subtitulo: string;
  storageKey: string;
  modulos: TutorialModulo[];
}

type Modo = 'guiado' | 'autonomo';

function lerProgresso(storageKey: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function salvarProgresso(storageKey: string, progresso: Record<string, boolean>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(progresso));
  } catch { /* localStorage indisponivel - segue sem persistir */ }
}

export default function TutorialHub({ titulo, subtitulo, storageKey, modulos }: Props) {
  const [selecionadoId, setSelecionadoId] = useState(modulos[0]?.id);
  const [modo, setModo] = useState<Modo>('guiado');
  const [progresso, setProgresso] = useState<Record<string, boolean>>({});
  const [verificando, setVerificando] = useState(false);
  const [resultado, setResultado] = useState<'ok' | 'faltando' | null>(null);

  useEffect(() => {
    setProgresso(lerProgresso(storageKey));
  }, [storageKey]);

  const selecionado = useMemo(() => modulos.find((m) => m.id === selecionadoId) || modulos[0], [modulos, selecionadoId]);
  const totalConcluidos = modulos.filter((m) => progresso[m.id]).length;

  const marcarConcluido = (id: string, valor: boolean) => {
    const novo = { ...progresso, [id]: valor };
    setProgresso(novo);
    salvarProgresso(storageKey, novo);
  };

  const handleSelecionar = (id: string) => {
    setSelecionadoId(id);
    setResultado(null);
  };

  const handleVerificar = async () => {
    if (!selecionado?.verificar) return;
    setVerificando(true);
    setResultado(null);
    try {
      const ok = await selecionado.verificar();
      setResultado(ok ? 'ok' : 'faltando');
      if (ok) marcarConcluido(selecionado.id, true);
    } catch {
      setResultado('faltando');
    } finally {
      setVerificando(false);
    }
  };

  if (!selecionado) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
        <p className="text-gray-600 mt-1">{subtitulo}</p>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-xs">
            <div
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{ width: `${(totalConcluidos / modulos.length) * 100}%` }}
            />
          </div>
          <span className="text-sm text-gray-500 whitespace-nowrap">{totalConcluidos}/{modulos.length} concluídos</span>
        </div>
      </div>

      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        {/* Sidebar de modulos */}
        <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
          {modulos.map((m) => {
            const ativo = m.id === selecionado.id;
            const feito = !!progresso[m.id];
            return (
              <button
                key={m.id}
                onClick={() => handleSelecionar(m.id)}
                className={`flex items-center gap-2 text-left px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap md:whitespace-normal transition-colors flex-shrink-0 md:flex-shrink ${
                  ativo ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="text-base">{feito ? '✅' : m.emoji}</span>
                <span>{m.titulo}</span>
                {m.opcional && !feito && <span className="text-[10px] text-gray-400 ml-auto md:ml-1">opcional</span>}
              </button>
            );
          })}
        </div>

        {/* Conteudo do modulo */}
        <div className="card">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-xl font-semibold text-gray-900">{selecionado.emoji} {selecionado.titulo}</h2>
            {selecionado.opcional && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">Opcional</span>
            )}
          </div>
          <p className="text-gray-600 mb-5">{selecionado.resumo}</p>

          {/* Toggle guiado / autonomo */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
            <button
              onClick={() => setModo('guiado')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${modo === 'guiado' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Guiado (passo a passo)
            </button>
            <button
              onClick={() => setModo('autonomo')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${modo === 'autonomo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Autônomo (só o desafio)
            </button>
          </div>

          {modo === 'guiado' ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-5">
              <p className="text-sm font-semibold text-gray-900 mb-2">Siga esses passos na tela real:</p>
              <ol className="space-y-1.5 text-sm text-gray-700 list-decimal list-inside">
                {selecionado.passosGuiados.map((passo, i) => (
                  <li key={i}>{passo}</li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-5">
              <p className="text-sm font-semibold text-indigo-900 mb-1">Desafio:</p>
              <p className="text-sm text-indigo-800">{selecionado.desafio}</p>
              <p className="text-xs text-indigo-500 mt-2">Sem passo a passo aqui de propósito — tenta sozinho primeiro. Se travar, volta pro modo Guiado.</p>
            </div>
          )}

          {selecionado.dica && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5">
              <p className="text-xs text-amber-800"><strong>💡 Dica:</strong> {selecionado.dica}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Link href={selecionado.linkReal} target="_blank" className="btn-primary">
              {selecionado.linkRotulo || 'Ir fazer isso agora →'}
            </Link>

            {selecionado.verificar ? (
              <button onClick={handleVerificar} disabled={verificando} className="btn-secondary disabled:opacity-50">
                {verificando ? 'Verificando...' : 'Já fiz — verificar'}
              </button>
            ) : (
              <button
                onClick={() => marcarConcluido(selecionado.id, !progresso[selecionado.id])}
                className="btn-secondary"
              >
                {progresso[selecionado.id] ? 'Marcado como entendido ✓' : 'Entendi, marcar como concluído'}
              </button>
            )}
          </div>

          {resultado === 'ok' && (
            <p className="text-sm text-green-700 mt-3">✅ Encontrei! Módulo concluído.</p>
          )}
          {resultado === 'faltando' && (
            <p className="text-sm text-amber-700 mt-3">Ainda não encontrei isso no seu perfil. Faça a ação na tela real e clique em verificar de novo.</p>
          )}
        </div>
      </div>
    </div>
  );
}
