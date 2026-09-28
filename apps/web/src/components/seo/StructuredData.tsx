interface StructuredDataProps {
  data: Record<string, unknown> | null;
}

// JSON.stringify nao escapa "<" - um texto livre vindo do banco (nome de
// oficina, comentario de avaliacao) contendo "</script>" fecharia a tag e
// injetaria HTML/JS na pagina. < e equivalente dentro do JSON.
function toSafeJson(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default function StructuredData({ data }: StructuredDataProps) {
  if (!data) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: toSafeJson(data) }}
    />
  );
}
