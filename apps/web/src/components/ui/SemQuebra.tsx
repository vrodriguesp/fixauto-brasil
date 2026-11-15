// QA D13: a janela de chegada ("08:00–10:00") nunca quebra no meio ("08:00–" / "10:00"). Envolve cada
// "HH:MM–HH:MM" do texto num span sem quebra. O texto (e o innerText) fica igual: so muda onde a linha quebra.
// Para frases traduzidas com a janela no meio (t('chegaEm', { periodo })), onde nao da para por o span direto.
// No app o mesmo vem de semQuebra() (apps/mobile/lib/turnos.ts, word joiners - React Native nao tem nowrap).
const JANELA = /(\d{1,2}:\d{2}–\d{1,2}:\d{2})/;

export default function SemQuebra({ children }: { children: string | null | undefined }) {
  const partes = String(children ?? '').split(JANELA);
  if (partes.length === 1) return <>{children}</>;
  return <>{partes.map((p, i) => (i % 2 ? <span key={i} className="whitespace-nowrap">{p}</span> : p))}</>;
}
