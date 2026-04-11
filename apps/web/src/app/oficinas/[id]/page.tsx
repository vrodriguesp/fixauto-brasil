'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import StarRating from '@/components/ui/StarRating';
import { TIPOS_SERVICO } from '@fixauto/shared';

interface Oficina {
  id: string;
  nome_fantasia: string;
  avaliacao_media: number;
  total_avaliacoes: number;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  latitude: number | null;
  longitude: number | null;
  especialidades: string[];
  profile: {
    telefone: string | null;
    nome: string;
  } | null;
}

interface Avaliacao {
  id: string;
  nota: number;
  nota_anterior: number | null;
  comentario: string | null;
  created_at: string;
  cliente: {
    nome: string;
  } | null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function getServiceLabel(value: string): { label: string; icon: string } {
  const found = TIPOS_SERVICO.find((s) => s.value === value);
  return found ? { label: found.label, icon: found.icon } : { label: value, icon: '' };
}

export default function OficinaPublicPage() {
  const params = useParams();
  const id = params.id as string;

  const [oficina, setOficina] = useState<Oficina | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [fotos, setFotos] = useState<{ id: string; foto_url: string; tipo: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tempoMedioResposta, setTempoMedioResposta] = useState<number | null>(null);
  const [ajusteMedio, setAjusteMedio] = useState<number | null>(null);
  const [hasRevisions, setHasRevisions] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function fetchData() {
      setLoading(true);
      setError(null);

      const [oficinaRes, avaliacoesRes, fotosRes, orcamentosRes] = await Promise.all([
        supabase
          .from('oficinas')
          .select('*, profile:profiles(*)')
          .eq('id', id)
          .single(),
        supabase
          .from('avaliacoes')
          .select('*, cliente:profiles!avaliacoes_cliente_id_fkey(nome)')
          .eq('oficina_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('oficina_fotos')
          .select('*')
          .eq('oficina_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('orcamentos')
          .select('created_at, valor_total, valor_original, revisao_numero, solicitacao:solicitacoes(created_at)')
          .eq('oficina_id', id),
      ]);

      if (oficinaRes.error) {
        setError('Oficina nao encontrada.');
        setLoading(false);
        return;
      }

      setOficina(oficinaRes.data as Oficina);
      setAvaliacoes((avaliacoesRes.data || []) as Avaliacao[]);
      setFotos((fotosRes.data || []) as any[]);

      // Calculate average response time from orcamentos
      const orcamentos = orcamentosRes.data || [];
      if (orcamentos.length > 0) {
        let totalMs = 0;
        let validCount = 0;
        for (const orc of orcamentos) {
          const solicitacao = orc.solicitacao as any;
          if (solicitacao?.created_at && orc.created_at) {
            const diff = new Date(orc.created_at).getTime() - new Date(solicitacao.created_at).getTime();
            if (diff >= 0) {
              totalMs += diff;
              validCount++;
            }
          }
        }
        if (validCount > 0) {
          const avgHours = totalMs / validCount / (1000 * 60 * 60);
          setTempoMedioResposta(avgHours);
        }
      }

      // Calculate pricing adjustment seal
      const revisedQuotes = orcamentos.filter(
        (orc: any) => orc.valor_original && orc.revisao_numero > 0
      );
      if (revisedQuotes.length > 0) {
        setHasRevisions(true);
        let totalAdjustment = 0;
        for (const orc of revisedQuotes) {
          const orig = Number((orc as any).valor_original);
          const current = Number((orc as any).valor_total);
          if (orig > 0) {
            totalAdjustment += ((current - orig) / orig) * 100;
          }
        }
        setAjusteMedio(totalAdjustment / revisedQuotes.length);
      } else {
        setHasRevisions(false);
        setAjusteMedio(null);
      }

      setLoading(false);
    }

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-500">Carregando perfil da oficina...</p>
      </div>
    );
  }

  if (error || !oficina) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">{error || 'Oficina nao encontrada.'}</p>
        <Link href="/" className="text-primary-600 hover:underline mt-4 inline-block">
          Voltar ao inicio
        </Link>
      </div>
    );
  }

  // Calculate rating from actual reviews
  const calculatedMedia = avaliacoes.length > 0
    ? avaliacoes.reduce((sum, a) => sum + a.nota, 0) / avaliacoes.length
    : 0;
  const totalAvaliacoes = avaliacoes.length;

  const lat = oficina.latitude;
  const lng = oficina.longitude;
  const hasCoords = lat !== null && lng !== null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link href="/" className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </Link>

      {/* Workshop Header */}
      <div className="card mb-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-primary-700 font-bold text-2xl">
              {oficina.nome_fantasia?.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{oficina.nome_fantasia}</h1>
              {calculatedMedia >= 4 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-400 text-yellow-900">
                  🏆 Oficina de Qualidade
                </span>
              )}
              {tempoMedioResposta !== null && tempoMedioResposta < 2 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                  ⚡ Resposta Rapida
                </span>
              )}
              {hasRevisions && ajusteMedio !== null ? (
                ajusteMedio < 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                    Ajuste medio: {ajusteMedio.toFixed(1)}% 📉
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                    Ajuste medio: +{ajusteMedio.toFixed(1)}% 📈
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                  Sem ajustes de preco
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <StarRating rating={calculatedMedia} size="md" />
              <span className="text-sm text-gray-600 font-medium">
                {calculatedMedia.toFixed(1)}
              </span>
              <span className="text-sm text-gray-500">
                ({totalAvaliacoes} {totalAvaliacoes === 1 ? 'avaliacao' : 'avaliacoes'})
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {oficina.cidade} - {oficina.estado}
            </p>
            {tempoMedioResposta !== null && (
              <p className="text-xs text-gray-400 mt-1">
                Tempo medio de resposta: {tempoMedioResposta < 1
                  ? `${Math.round(tempoMedioResposta * 60)}min`
                  : `${tempoMedioResposta.toFixed(1)}h`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Services */}
      {oficina.especialidades && oficina.especialidades.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Servicos oferecidos</h2>
          <div className="flex flex-wrap gap-2">
            {oficina.especialidades.map((esp) => {
              const svc = getServiceLabel(esp);
              return (
                <span key={esp} className="badge">
                  <span className="mr-1">{svc.icon}</span>
                  {svc.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Photos */}
      {fotos.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Fotos</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {fotos.map((foto) => (
              <a key={foto.id} href={foto.foto_url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden block">
                <img src={foto.foto_url} alt={foto.tipo} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Address & Map */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Endereco</h2>
        <div className="text-sm text-gray-600 space-y-1 mb-4">
          <p>{oficina.endereco}</p>
          <p>
            {oficina.cidade} - {oficina.estado}
            {oficina.cep && `, CEP: ${oficina.cep}`}
          </p>
        </div>
        <div className="rounded-lg overflow-hidden border border-gray-200">
          <iframe
            title="Localização da oficina"
            width="100%"
            height="300"
            style={{ border: 0 }}
            loading="lazy"
            src={`https://www.google.com/maps?q=${encodeURIComponent(`${oficina.endereco}, ${oficina.cidade} - ${oficina.estado}, Brazil`)}&output=embed`}
          />
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${oficina.endereco}, ${oficina.cidade} - ${oficina.estado}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-primary-600 hover:underline py-2 bg-gray-50"
          >
            Abrir no Google Maps
          </a>
        </div>
      </div>

      {/* Contact & Hours */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Contato e Horario</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Telefone</p>
            {oficina.profile?.telefone ? (
              <a
                href={`tel:${oficina.profile.telefone}`}
                className="text-primary-600 font-medium hover:underline"
              >
                {oficina.profile.telefone}
              </a>
            ) : (
              <p className="text-sm text-gray-400">Nao informado</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Horario de funcionamento</p>
            <div className="text-sm text-gray-700 space-y-0.5">
              <p>Seg a Sex: 08:00 - 18:00</p>
              <p>Sab: 08:00 - 12:00</p>
              <p className="text-gray-400">Dom: Fechado</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">
          Avaliacoes ({totalAvaliacoes})
        </h2>
        {totalAvaliacoes === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">
            Esta oficina ainda nao possui avaliacoes.
          </p>
        ) : (
          <div className="space-y-4">
            {avaliacoes.map((av) => (
              <div key={av.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 text-xs font-bold">
                        {av.cliente?.nome?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <span className="font-medium text-sm text-gray-900">
                      {av.cliente?.nome || 'Cliente'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(av.created_at)}</span>
                </div>
                <div className="ml-10">
                  <div className="flex items-center gap-2">
                    <StarRating rating={av.nota} size="sm" />
                    {av.nota_anterior != null && av.nota_anterior !== av.nota && (
                      av.nota > av.nota_anterior ? (
                        <span className="text-green-600 text-sm font-bold" title={`Anterior: ${av.nota_anterior}`}>
                          ↑
                        </span>
                      ) : (
                        <span className="text-red-600 text-sm font-bold" title={`Anterior: ${av.nota_anterior}`}>
                          ↓
                        </span>
                      )
                    )}
                  </div>
                  {av.comentario && (
                    <p className="text-sm text-gray-600 mt-1">{av.comentario}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
