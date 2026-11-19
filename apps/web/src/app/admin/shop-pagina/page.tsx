'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ShopVitrine, { type RotulosVitrine } from '@/components/pecas/ShopVitrine';
import type { ItemShop } from '@/lib/pecas-lote5';
import type { ConteudoShop, TextosShop } from '@/lib/shop-pagina';

// Pecas lote 5 (20/11, pedido do dono 19/11 noite): editor da pagina do Shop, so admin. Textos por idioma (fallback
// idioma -> en -> et, como no Shop), banner (upload tratado no servidor: JPEG sem EXIF), blocos curtos, SEO, destaques
// (busca + setas), previa 390/1280 com o MESMO componente do Shop, rascunho x publicar, historico com restaurar.
// Funciona com o Shop desligado (o dono prepara antes); publicar so muda o que as oficinas veem quando o Shop estiver ligado.

const IDIOMAS = ['et', 'ru', 'en', 'pt', 'pt-PT', 'it'] as const;
const NOMES: Record<string, string> = { et: 'Eesti (ET)', ru: 'Русский (RU)', en: 'English (EN)', pt: 'Português BR', 'pt-PT': 'Português PT', it: 'Italiano' };
const VAZIO: ConteudoShop = { textos: {}, banner: null, destaques: [] };
type Opcao = { tipo: 'item' | 'promocao'; id: string; nome: string; preco: number; loja: string };
type Versao = { id: string; estado: string; nota: string | null; criado_em: string; publicado_em: string | null };
type Rotulos = { locale: string; destaqueBipfix: string; etiquetaPromocao: string; pedir: string; destaquesTitulo: string; precoAnterior: string; shopTitulo: string; shopSubtitulo: string; validaAte: string; atualizado: string; unidades: Record<string, string>; condicoes: Record<string, string> };

const campoVazio = (t?: TextosShop) => !t || Object.keys(t).length === 0;

export default function AdminShopPaginaPage() {
  const [conteudo, setConteudo] = useState<ConteudoShop>(VAZIO);
  const [salvo, setSalvo] = useState<string>('');
  const [estado, setEstado] = useState<string>('');
  const [shopLigado, setShopLigado] = useState(false);
  const [publicadaEm, setPublicadaEm] = useState<string | null>(null);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [idioma, setIdioma] = useState<(typeof IDIOMAS)[number]>('et');
  const [largura, setLargura] = useState<390 | 1280>(390);
  const [rotulos, setRotulos] = useState<Rotulos | null>(null);
  const [previaItens, setPreviaItens] = useState<ItemShop[]>([]);
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const r = await fetch('/api/admin/shop-pagina', { cache: 'no-store' });
    if (!r.ok) { setMsg({ tipo: 'erro', texto: `Erro ao carregar (${r.status})` }); return; }
    const j = await r.json();
    setConteudo(j.rascunho.conteudo); setSalvo(JSON.stringify(j.rascunho.conteudo)); setEstado(j.rascunho.estado);
    setShopLigado(!!j.shopLigado); setPublicadaEm(j.publicada?.publicado_em || null); setVersoes(j.versoes || []); setOpcoes(j.opcoes || []);
    setCarregado(true);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/shop-pagina/rotulos?l=${encodeURIComponent(idioma)}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo && j) setRotulos(j); });
    return () => { vivo = false; };
  }, [idioma]);

  const chaveDestaques = JSON.stringify(conteudo.destaques);
  useEffect(() => {
    let vivo = true;
    fetch('/api/admin/shop-pagina/destaques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: chaveDestaques === '[]' ? '{"destaques":[]}' : JSON.stringify({ destaques: conteudo.destaques }) })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo && j) { setPreviaItens(j.itens || []); setFora(new Set((j.fora || []).map((d: any) => `${d.tipo}:${d.id}`))); } });
    return () => { vivo = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDestaques]);

  const mudou = carregado && JSON.stringify(conteudo) !== salvo;
  // aviso ao sair com alteracoes nao salvas
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (mudou) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [mudou]);

  const textos = conteudo.textos[idioma] || {};
  const setTexto = (k: keyof TextosShop, v: any) => setConteudo((c) => ({ ...c, textos: { ...c.textos, [idioma]: { ...(c.textos[idioma] || {}), [k]: v } } }));
  const blocos = textos.blocos || [];
  const setBlocos = (b: { titulo: string; texto: string }[]) => setTexto('blocos', b);

  // previa: mesma regra de fallback do servidor (idioma -> en -> et), campo a campo
  const pagina = useMemo(() => {
    const ordem = [idioma, 'en', 'et'].filter((l, i, a) => a.indexOf(l) === i);
    const campo = (k: keyof TextosShop): any => { for (const l of ordem) { const v = (conteudo.textos as any)[l]?.[k]; if (v !== undefined && v !== '' && (!Array.isArray(v) || v.length)) return v; } return undefined; };
    return { titulo: campo('titulo') || null, subtitulo: campo('subtitulo') || null, bannerAlt: campo('bannerAlt') || '', seoTitulo: campo('seoTitulo') || null, seoDescricao: campo('seoDescricao') || null, blocos: (campo('blocos') || []).filter((b: any) => b.titulo || b.texto), banner: conteudo.banner };
  }, [conteudo, idioma]);

  const r: RotulosVitrine | null = rotulos && {
    destaqueBipfix: rotulos.destaqueBipfix, etiquetaPromocao: rotulos.etiquetaPromocao, pedir: rotulos.pedir, destaquesTitulo: rotulos.destaquesTitulo, precoAnterior: rotulos.precoAnterior,
    porUnidade: (u) => rotulos.unidades[u] || u, unidade: (u) => rotulos.unidades[u] || u, validaAte: (d) => rotulos.validaAte.replace('{d}', d),
    atualizado: (q) => rotulos.atualizado.replace('{q}', q), condicao: (c) => rotulos.condicoes[c] || c,
  };

  const statusIdioma = (l: string) => {
    const t = (conteudo.textos as any)[l] as TextosShop | undefined;
    if (!campoVazio(t) && t?.titulo) return 'preenchido';
    if (!campoVazio(conteudo.textos.en) || !campoVazio(conteudo.textos.et)) return l === 'en' || l === 'et' ? 'vazio' : 'usa EN/ET';
    return 'vazio';
  };

  const gravar = async (acao: 'rascunho' | 'publicar') => {
    if (acao === 'publicar') {
      if (conteudo.banner && !IDIOMAS.slice(0, 2).every((l) => (conteudo.textos as any)[l]?.bannerAlt || conteudo.textos.en?.bannerAlt)) {
        setMsg({ tipo: 'erro', texto: 'O banner precisa do texto alternativo (pelo menos ET e RU, ou EN).' }); return;
      }
      if (!confirm(`Publicar? ${shopLigado ? 'As oficinas veem a nova versão já.' : 'O Shop está DESLIGADO: ninguém vê até ligar.'}\nIdiomas com título: ${IDIOMAS.filter((l) => (conteudo.textos as any)[l]?.titulo).join(', ') || 'nenhum'} · destaques: ${conteudo.destaques.length} · blocos (${idioma}): ${blocos.length}`)) return;
    }
    setOcupado(true); setMsg(null);
    const resp = await fetch('/api/admin/shop-pagina', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conteudo, acao }) }).catch(() => null);
    setOcupado(false);
    if (!resp?.ok) { setMsg({ tipo: 'erro', texto: 'Não foi possível gravar.' }); return; }
    const j = await resp.json();
    setConteudo(j.conteudo); setSalvo(JSON.stringify(j.conteudo));
    setMsg({ tipo: 'ok', texto: acao === 'publicar' ? `Publicado às ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}` : `Rascunho salvo às ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}` });
    await carregar();
  };

  const restaurar = async (v: Versao) => {
    if (mudou && !confirm('Há alterações não salvas. Restaurar mesmo assim (elas se perdem)?')) return;
    const resp = await fetch('/api/admin/shop-pagina/restaurar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versaoId: v.id }) });
    if (!resp.ok) { setMsg({ tipo: 'erro', texto: 'Não foi possível restaurar.' }); return; }
    setMsg({ tipo: 'ok', texto: 'Versão restaurada como rascunho (nada foi publicado).' });
    await carregar();
  };

  const enviarBanner = async (f: File) => {
    setOcupado(true); setMsg(null);
    const fd = new FormData(); fd.append('arquivo', f);
    const resp = await fetch('/api/admin/shop-pagina/imagem', { method: 'POST', body: fd }).catch(() => null);
    const j = resp ? await resp.json().catch(() => null) : null;
    setOcupado(false);
    if (!resp?.ok || !j?.caminho) { setMsg({ tipo: 'erro', texto: j?.codigo === 'FOTO_TAMANHO' ? 'Imagem maior que 8 MB.' : j?.codigo === 'FOTO_TIPO' ? 'Use JPEG, PNG ou WebP.' : 'Não foi possível enviar a imagem.' }); return; }
    setConteudo((c) => ({ ...c, banner: j.caminho }));
  };

  const mover = (i: number, d: number) => setConteudo((c) => { const a = [...c.destaques]; const j = i + d; if (j < 0 || j >= a.length) return c; [a[i], a[j]] = [a[j], a[i]]; return { ...c, destaques: a }; });
  const nomeOpcao = (d: { tipo: string; id: string }) => opcoes.find((o) => o.tipo === d.tipo && o.id === d.id);
  const filtradas = opcoes.filter((o) => !conteudo.destaques.some((d) => d.tipo === o.tipo && d.id === o.id) && (!busca || `${o.nome} ${o.loja}`.toLowerCase().includes(busca.toLowerCase()))).slice(0, 20);
  const bannerUrl = conteudo.banner ? `/api/pecas/shop-imagem?c=${encodeURIComponent(conteudo.banner)}` : null;

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Shop (peças): página</h1>
        <p className="text-sm text-gray-600 mt-1" data-testid="sp-estado-shop">
          Shop {shopLigado ? 'LIGADO: as oficinas veem a versão publicada.' : 'DESLIGADO: a página das oficinas responde 404; aqui você prepara e vê a prévia.'}
          {publicadaEm ? ` Última publicação: ${new Date(publicadaEm).toLocaleString('pt-PT')}.` : ' Ainda não publicada.'}
        </p>
      </div>

      {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} data-testid="sp-msg" className={`rounded-lg px-3 py-2 text-sm ${msg.tipo === 'erro' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>{msg.texto}</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6 min-w-0">
          <section className="card space-y-3">
            <h2 className="font-semibold">Idioma</h2>
            <div className="flex flex-wrap gap-2" role="tablist">
              {IDIOMAS.map((l) => (
                <button key={l} type="button" role="tab" aria-selected={idioma === l} data-testid={`sp-idioma-${l}`} onClick={() => setIdioma(l)}
                  className={`min-h-[44px] px-3 rounded-lg border text-sm ${idioma === l ? 'bg-blue-100 border-blue-900 text-blue-950 font-semibold' : 'bg-white border-gray-300'}`}>
                  {NOMES[l]} <span className="text-xs text-gray-600">· {statusIdioma(l)}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600">Campo vazio usa o texto em EN e depois ET. Comece por ET e RU.</p>
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">Textos ({NOMES[idioma]})</h2>
            <label className="block text-sm font-medium">Título <span className="text-gray-500">(até 120)</span>
              <input data-testid="sp-titulo" className="input-field mt-1" maxLength={120} value={textos.titulo || ''} onChange={(e) => setTexto('titulo', e.target.value)} />
            </label>
            <label className="block text-sm font-medium">Subtítulo <span className="text-gray-500">(até 300)</span>
              <textarea data-testid="sp-subtitulo" className="input-field mt-1" rows={2} maxLength={300} value={textos.subtitulo || ''} onChange={(e) => setTexto('subtitulo', e.target.value)} />
            </label>
            <label className="block text-sm font-medium">Título para o navegador (SEO) <span className="text-gray-500">(até 70; a página é só para oficinas logadas, não vai ao Google)</span>
              <input data-testid="sp-seo-titulo" className="input-field mt-1" maxLength={70} value={textos.seoTitulo || ''} onChange={(e) => setTexto('seoTitulo', e.target.value)} />
            </label>
            <label className="block text-sm font-medium">Descrição (SEO) <span className="text-gray-500">(até 160)</span>
              <input data-testid="sp-seo-descricao" className="input-field mt-1" maxLength={160} value={textos.seoDescricao || ''} onChange={(e) => setTexto('seoDescricao', e.target.value)} />
            </label>
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">Banner</h2>
            <input ref={arquivo} data-testid="sp-banner-arquivo" type="file" accept="image/jpeg,image/png,image/webp" className="block text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarBanner(f); e.target.value = ''; }} />
            <p className="text-xs text-gray-600">JPEG, PNG ou WebP até 8 MB. O servidor converte para JPEG e tira os dados da foto (EXIF/GPS). Formato largo (ex.: 1600×600).</p>
            {conteudo.banner && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bannerUrl!} alt="" className="h-16 w-40 object-cover rounded" data-testid="sp-banner-miniatura" />
                <button type="button" className="btn-secondary text-sm" data-testid="sp-banner-remover" onClick={() => setConteudo((c) => ({ ...c, banner: null }))}>Remover banner</button>
              </div>
            )}
            <label className="block text-sm font-medium">Texto alternativo do banner ({NOMES[idioma]}) <span className="text-gray-500">(obrigatório com banner; descreve a imagem)</span>
              <input data-testid="sp-banner-alt" className="input-field mt-1" maxLength={150} value={textos.bannerAlt || ''} onChange={(e) => setTexto('bannerAlt', e.target.value)} />
            </label>
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">Blocos curtos ({NOMES[idioma]}, até 4)</h2>
            <p className="text-xs text-gray-600">Ex.: como funciona o pedido, entrega. Não escreva comissão ou preço antes de o dono decidir (Q-6).</p>
            {blocos.map((b, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2" data-testid="sp-bloco">
                <input aria-label={`Título do bloco ${i + 1}`} data-testid="sp-bloco-titulo" className="input-field" maxLength={80} value={b.titulo} onChange={(e) => setBlocos(blocos.map((x, k) => (k === i ? { ...x, titulo: e.target.value } : x)))} />
                <textarea aria-label={`Texto do bloco ${i + 1}`} data-testid="sp-bloco-texto" className="input-field" rows={2} maxLength={400} value={b.texto} onChange={(e) => setBlocos(blocos.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)))} />
                <div className="flex gap-2">
                  <button type="button" aria-label="Subir bloco" className="btn-secondary text-sm min-h-[44px] min-w-[44px]" disabled={i === 0} onClick={() => { const a = [...blocos]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setBlocos(a); }}>↑</button>
                  <button type="button" aria-label="Descer bloco" className="btn-secondary text-sm min-h-[44px] min-w-[44px]" disabled={i === blocos.length - 1} onClick={() => { const a = [...blocos]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setBlocos(a); }}>↓</button>
                  <button type="button" className="btn-secondary text-sm min-h-[44px]" onClick={() => setBlocos(blocos.filter((_, k) => k !== i))}>Remover</button>
                </div>
              </div>
            ))}
            {blocos.length < 4 && <button type="button" data-testid="sp-bloco-novo" className="btn-secondary text-sm min-h-[44px]" onClick={() => setBlocos([...blocos, { titulo: '', texto: '' }])}>+ Bloco</button>}
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">Destaques (todos os idiomas, até 12)</h2>
            <p className="text-xs text-gray-600">Aparecem com a etiqueta &quot;Destaque BipFix&quot; (escolha editorial, nada pago). Item vencido, oculto ou de loja desativada some sozinho da página.</p>
            <ol className="space-y-2">
              {conteudo.destaques.map((d, i) => {
                const o = nomeOpcao(d); const morto = fora.has(`${d.tipo}:${d.id}`);
                return (
                  <li key={`${d.tipo}:${d.id}`} data-testid="sp-destaque" data-id={d.id} className="flex flex-wrap items-center gap-2 rounded border border-gray-200 p-2">
                    <span className={`flex-1 min-w-0 text-sm ${morto ? 'line-through text-gray-500' : ''}`} data-testid={morto ? 'sp-destaque-fora' : undefined}>
                      {d.tipo === 'promocao' ? 'Promoção' : 'Item'}: {o ? `${o.nome} (${o.loja})` : d.id}{morto ? ' · não aparece (vencido/oculto/loja inativa)' : ''}
                    </span>
                    <button type="button" aria-label="Subir" data-testid="sp-destaque-subir" className="btn-secondary text-sm min-h-[44px] min-w-[44px]" disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
                    <button type="button" aria-label="Descer" data-testid="sp-destaque-descer" className="btn-secondary text-sm min-h-[44px] min-w-[44px]" disabled={i === conteudo.destaques.length - 1} onClick={() => mover(i, 1)}>↓</button>
                    <button type="button" data-testid="sp-destaque-remover" className="btn-secondary text-sm min-h-[44px]" onClick={() => setConteudo((c) => ({ ...c, destaques: c.destaques.filter((_, k) => k !== i) }))}>Remover</button>
                  </li>
                );
              })}
            </ol>
            {conteudo.destaques.length < 12 && (
              <div className="space-y-2">
                <input data-testid="sp-destaque-busca" className="input-field" placeholder="Buscar item ou promoção (nome ou loja)" value={busca} onChange={(e) => setBusca(e.target.value)} />
                <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded">
                  {filtradas.length === 0 && <li className="p-2 text-sm text-gray-600">Nada (só itens &quot;oficinas&quot; e promoções válidas entram).</li>}
                  {filtradas.map((o) => (
                    <li key={`${o.tipo}:${o.id}`} className="flex items-center justify-between gap-2 p-2">
                      <span className="text-sm min-w-0 truncate">{o.tipo === 'promocao' ? 'Promoção' : 'Item'}: {o.nome} · {o.loja} · {o.preco.toFixed(2)} €</span>
                      <button type="button" data-testid="sp-destaque-adicionar" data-id={o.id} className="btn-secondary text-sm min-h-[44px]" onClick={() => setConteudo((c) => ({ ...c, destaques: [...c.destaques, { tipo: o.tipo, id: o.id }] }))}>Adicionar</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="card space-y-2">
            <h2 className="font-semibold">Histórico (últimas 30 versões)</h2>
            <ul className="divide-y divide-gray-100">
              {versoes.map((v) => (
                <li key={v.id} data-testid="sp-versao" data-estado={v.estado} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>{new Date(v.criado_em).toLocaleString('pt-PT')} · <strong>{v.estado}</strong>{v.nota ? ` · ${v.nota}` : ''}</span>
                  <button type="button" data-testid="sp-versao-restaurar" className="btn-secondary text-sm min-h-[44px]" onClick={() => restaurar(v)}>Restaurar como rascunho</button>
                </li>
              ))}
              {!versoes.length && <li className="py-2 text-sm text-gray-600">Nenhuma versão ainda.</li>}
            </ul>
          </section>
        </div>

        <div className="min-w-0">
          <div className="xl:sticky xl:top-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold mr-auto">Prévia ({NOMES[idioma]})</h2>
              <button type="button" aria-pressed={largura === 390} data-testid="sp-previa-390" onClick={() => setLargura(390)} className={`min-h-[44px] px-3 rounded-lg border text-sm ${largura === 390 ? 'bg-blue-100 border-blue-900' : 'bg-white border-gray-300'}`}>Celular 390</button>
              <button type="button" aria-pressed={largura === 1280} data-testid="sp-previa-1280" onClick={() => setLargura(1280)} className={`min-h-[44px] px-3 rounded-lg border text-sm ${largura === 1280 ? 'bg-blue-100 border-blue-900' : 'bg-white border-gray-300'}`}>Computador 1280</button>
            </div>
            <div className="overflow-auto rounded-xl border border-gray-300 bg-gray-50" style={{ maxHeight: '75vh' }}>
              <div data-testid="sp-previa" data-largura={largura} style={{ width: largura }} className="bg-gray-50 p-4">
                {r && rotulos ? (
                  <ShopVitrine pagina={pagina} bannerUrl={bannerUrl} destaques={previaItens} r={r} moeda="EUR" locale={rotulos.locale} tituloPadrao={rotulos.shopTitulo} subtituloPadrao={rotulos.shopSubtitulo} />
                ) : <div className="animate-pulse h-40 bg-gray-200 rounded-xl" />}
                <p className="text-xs text-gray-500 mt-2">Abaixo: busca e resultados do Shop (iguais para todos).</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 flex flex-wrap items-center gap-3 justify-end" data-testid="sp-barra">
        <span className="text-sm text-gray-700 mr-auto" data-testid="sp-situacao">{mudou ? 'Alterações não salvas' : estado === 'publicada' ? 'Igual à versão publicada' : estado === 'rascunho' ? 'Rascunho salvo' : 'Nada salvo ainda'}</span>
        <button type="button" data-testid="sp-descartar" className="btn-secondary min-h-[44px]" disabled={!mudou || ocupado} onClick={() => setConteudo(JSON.parse(salvo || JSON.stringify(VAZIO)))}>Descartar</button>
        <button type="button" data-testid="sp-salvar" className="btn-secondary min-h-[44px]" disabled={ocupado} onClick={() => gravar('rascunho')}>Salvar rascunho</button>
        <button type="button" data-testid="sp-publicar" className="btn-primary min-h-[44px]" disabled={ocupado} onClick={() => gravar('publicar')}>Publicar</button>
      </div>
    </div>
  );
}
