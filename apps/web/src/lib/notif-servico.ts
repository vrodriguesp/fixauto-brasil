import pt from '../../messages/pt.json';
import ptPT from '../../messages/pt-PT.json';
import en from '../../messages/en.json';
import et from '../../messages/et.json';
import it from '../../messages/it.json';
import ru from '../../messages/ru.json';

// Avisos ao cliente sobre o andamento do conserto, no idioma DO CLIENTE
// (os 6 idiomas do site; o nome de cada etapa vem dos mesmos textos da tela).
type Idioma = 'pt' | 'pt-PT' | 'en' | 'et' | 'it' | 'ru';
const ETAPAS: Record<Idioma, Record<string, string>> = {
  pt: (pt as any).constants.statusManutencao,
  'pt-PT': (ptPT as any).constants.statusManutencao,
  en: (en as any).constants.statusManutencao,
  et: (et as any).constants.statusManutencao,
  it: (it as any).constants.statusManutencao,
  ru: (ru as any).constants.statusManutencao,
};

const TEXTOS: Record<Idioma, { chegouTitulo: string; chegou: string; etapaTitulo: string; etapa: string }> = {
  pt: { chegouTitulo: 'Seu carro chegou à oficina', chegou: '{oficina} registrou a entrada do seu {carro}. Acompanhe o conserto por aqui.', etapaTitulo: 'Atualização do conserto', etapa: '{carro}: {etapa}' },
  'pt-PT': { chegouTitulo: 'O seu carro chegou à oficina', chegou: '{oficina} registou a entrada do seu {carro}. Acompanhe a reparação por aqui.', etapaTitulo: 'Atualização da reparação', etapa: '{carro}: {etapa}' },
  en: { chegouTitulo: 'Your car is at the workshop', chegou: '{oficina} checked in your {carro}. Follow the repair here.', etapaTitulo: 'Repair update', etapa: '{carro}: {etapa}' },
  et: { chegouTitulo: 'Teie auto on töökojas', chegou: '{oficina} registreeris teie auto {carro} saabumise. Jälgige remonti siin.', etapaTitulo: 'Remondi uuendus', etapa: '{carro}: {etapa}' },
  it: { chegouTitulo: "La tua auto è in officina", chegou: "{oficina} ha registrato l'arrivo della tua {carro}. Segui la riparazione da qui.", etapaTitulo: 'Aggiornamento riparazione', etapa: '{carro}: {etapa}' },
  ru: { chegouTitulo: 'Ваша машина в мастерской', chegou: '{oficina} приняла вашу машину {carro}. Следите за ремонтом здесь.', etapaTitulo: 'Новости по ремонту', etapa: '{carro}: {etapa}' },
};

const idiomaDe = (l?: string | null): Idioma => (l && l in TEXTOS ? (l as Idioma) : l?.startsWith('pt') ? 'pt' : 'en');
const preencher = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

export function notifCarroChegou(idioma: string | null | undefined, v: { oficina: string; carro: string }) {
  const tx = TEXTOS[idiomaDe(idioma)];
  return { titulo: tx.chegouTitulo, mensagem: preencher(tx.chegou, v) };
}

export function notifEtapa(idioma: string | null | undefined, v: { carro: string; status: string }) {
  const l = idiomaDe(idioma);
  return { titulo: TEXTOS[l].etapaTitulo, mensagem: preencher(TEXTOS[l].etapa, { carro: v.carro, etapa: ETAPAS[l][v.status] || v.status }) };
}
