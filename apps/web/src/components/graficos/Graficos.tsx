// Graficos simples em SVG puro (pagina Desempenho da oficina, auditoria do
// painel 10/10, secao E3): sem biblioteca, funcionam no servidor, cada um com
// rotulo de texto (nunca so cor) e uma tabela escondida para leitor de tela.

export type Serie = { nome: string; cor: string; valores: number[] };

function Tabela({ titulo, rotulos, series }: { titulo: string; rotulos: string[]; series: Serie[] }) {
  return (
    <table className="sr-only">
      <caption>{titulo}</caption>
      <thead><tr><th>—</th>{series.map((s) => <th key={s.nome}>{s.nome}</th>)}</tr></thead>
      <tbody>{rotulos.map((r, i) => <tr key={r}><th>{r}</th>{series.map((s) => <td key={s.nome}>{s.valores[i]}</td>)}</tr>)}</tbody>
    </table>
  );
}

/** Barras agrupadas por periodo (ex.: recebidos / respondidos / ganhos por semana). */
export function Barras({ titulo, rotulos, series, formatar = (n: number) => String(n) }: { titulo: string; rotulos: string[]; series: Serie[]; formatar?: (n: number) => string }) {
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const L = 320, A = 150, base = 128, topo = 16;
  const grupo = L / Math.max(1, rotulos.length);
  const barra = Math.min(22, (grupo - 6) / Math.max(1, series.length));
  return (
    <figure>
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full h-auto" role="img" aria-label={titulo}>
        {[0.5, 1].map((f) => <line key={f} x1={0} x2={L} y1={base - (base - topo) * f} y2={base - (base - topo) * f} stroke="#e5e7eb" strokeDasharray="3 3" />)}
        <line x1={0} x2={L} y1={base} y2={base} stroke="#9ca3af" />
        {rotulos.map((r, i) => {
          const x0 = i * grupo + (grupo - barra * series.length) / 2;
          return (
            <g key={r}>
              {series.map((s, j) => {
                const v = s.valores[i] || 0;
                const h = ((base - topo) * v) / max;
                return (
                  <g key={s.nome}>
                    <rect x={x0 + j * barra} y={base - h} width={barra - 2} height={h} fill={s.cor} rx={2}><title>{`${r} · ${s.nome}: ${formatar(v)}`}</title></rect>
                    {v > 0 && series.length <= 2 && <text x={x0 + j * barra + (barra - 2) / 2} y={base - h - 3} textAnchor="middle" fontSize="9" fill="#374151">{formatar(v)}</text>}
                  </g>
                );
              })}
              <text x={i * grupo + grupo / 2} y={A - 6} textAnchor="middle" fontSize="9" fill="#6b7280">{r}</text>
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
          {series.map((s) => <span key={s.nome} className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.cor }} aria-hidden="true" />{s.nome}</span>)}
        </figcaption>
      )}
      <Tabela titulo={titulo} rotulos={rotulos} series={series} />
    </figure>
  );
}

/** Linha de uma serie (ex.: tempo de resposta por semana). Valores null = sem dado. */
export function Linha({ titulo, rotulos, valores, cor = '#0284c7', formatar = (n: number) => String(n) }: { titulo: string; rotulos: string[]; valores: (number | null)[]; cor?: string; formatar?: (n: number) => string }) {
  const nums = valores.filter((v): v is number => v != null);
  const max = Math.max(1, ...nums);
  const L = 320, A = 140, base = 116, topo = 16;
  const passo = L / Math.max(1, rotulos.length);
  const pts = valores.map((v, i) => (v == null ? null : { x: i * passo + passo / 2, y: base - ((base - topo) * v) / max, v }));
  const caminho = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p!.x},${p!.y}`).join(' ');
  return (
    <figure>
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full h-auto" role="img" aria-label={titulo}>
        <line x1={0} x2={L} y1={base} y2={base} stroke="#9ca3af" />
        <path d={caminho} fill="none" stroke={cor} strokeWidth={2.5} />
        {pts.map((p, i) => p && <circle key={i} cx={p.x} cy={p.y} r={4} fill={cor}><title>{`${rotulos[i]}: ${formatar(p.v)}`}</title></circle>)}
        {rotulos.map((r, i) => <text key={r} x={i * passo + passo / 2} y={A - 6} textAnchor="middle" fontSize="9" fill="#6b7280">{r}</text>)}
      </svg>
      <Tabela titulo={titulo} rotulos={rotulos} series={[{ nome: titulo, cor, valores: valores.map((v) => v ?? 0) }]} />
    </figure>
  );
}

/** Barras horizontais por categoria (ex.: horas medias por etapa). */
export function BarrasHorizontais({ titulo, itens, cor = '#0284c7', formatar = (n: number) => String(n) }: { titulo: string; itens: { rotulo: string; valor: number }[]; cor?: string; formatar?: (n: number) => string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <figure aria-label={titulo}>
      <ul className="space-y-2">
        {itens.map((i) => (
          <li key={i.rotulo}>
            <div className="flex justify-between text-sm"><span className="text-gray-700">{i.rotulo}</span><span className="font-medium text-gray-900">{formatar(i.valor)}</span></div>
            <div className="mt-1 h-3 rounded-full bg-gray-100" aria-hidden="true"><div className="h-3 rounded-full" style={{ width: `${Math.max(3, (100 * i.valor) / max)}%`, background: cor }} /></div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
