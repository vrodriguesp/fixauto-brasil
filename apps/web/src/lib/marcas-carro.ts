// Marcas de carro no campo de marca (catalogo VehiclesDB, fora do Brasil) - parecer do
// Fable de 16/11 (Documentos/Analises/Fable_carro_endereco_2026-11-16.md), aprovado pelo dono:
// - a setinha mostrava as ~300 marcas em ordem alfabetica (Setra, Shelby, Tata...): agora
//   primeiro um bloco com as marcas mais comuns na Estonia (novos 2025 - ERR; usados 2026 -
//   Autoportaal), depois todas de A a Z;
// - atalhos de um toque para as mais comuns, acima do campo;
// - quem escreve em cirilico ("Тойота", "Шкода", "БМВ") acha a marca do catalogo.
// Os valores sao os codigos (slug) do catalogo (api/vehicle-catalog).

/** Bloco "marcas mais comuns" no topo da lista da setinha (ordem de exibicao). */
export const MARCAS_POPULARES = [
  'toyota', 'volkswagen', 'bmw', 'skoda', 'audi', 'mercedes-benz', 'honda', 'ford', 'opel', 'renault',
  'kia', 'hyundai', 'nissan', 'mazda', 'volvo', 'peugeot', 'citroen', 'lexus', 'mitsubishi', 'subaru',
];

/** Atalhos de um toque acima do campo da marca: codigo do catalogo + rotulo curto (cabe a 360 px). */
export const ATALHOS_MARCA: { code: string; rotulo: string }[] = [
  { code: 'toyota', rotulo: 'Toyota' },
  { code: 'volkswagen', rotulo: 'VW' },
  { code: 'bmw', rotulo: 'BMW' },
  { code: 'skoda', rotulo: 'Škoda' },
  { code: 'audi', rotulo: 'Audi' },
  { code: 'mercedes-benz', rotulo: 'Mercedes' },
  { code: 'honda', rotulo: 'Honda' },
  { code: 'ford', rotulo: 'Ford' },
];

/** Outros nomes da mesma marca (cirilico e abreviacoes) -> codigo do catalogo. */
export const APELIDOS_MARCA: Record<string, string[]> = {
  toyota: ['Тойота'],
  volkswagen: ['Фольксваген', 'Фольцваген', 'VW'],
  skoda: ['Шкода'],
  bmw: ['БМВ'],
  audi: ['Ауди'],
  'mercedes-benz': ['Мерседес', 'Мерседес-Бенц', 'Мерс', 'Mercedes', 'Benz'],
  ford: ['Форд'],
  opel: ['Опель'],
  renault: ['Рено'],
  kia: ['Киа', 'Кия'],
  hyundai: ['Хендай', 'Хюндай', 'Хундай', 'Хёндэ', 'Хендэ', 'Хундаи'],
  nissan: ['Ниссан', 'Нисан'],
  mazda: ['Мазда'],
  volvo: ['Вольво'],
  peugeot: ['Пежо'],
  citroen: ['Ситроен', 'Ситроэн'],
  lexus: ['Лексус'],
  mitsubishi: ['Мицубиси', 'Митсубиси', 'Мицубиши', 'Митсубиши'],
  subaru: ['Субару'],
  honda: ['Хонда'],
  lada: ['Лада', 'ВАЗ', 'VAZ', 'Жигули'],
  seat: ['Сеат'],
  dacia: ['Дачия', 'Дачиа'],
  fiat: ['Фиат'],
  suzuki: ['Сузуки'],
  chevrolet: ['Шевроле', 'Шевролет'],
  tesla: ['Тесла'],
  'land-rover': ['Ленд Ровер', 'Лэнд Ровер', 'Лендровер'],
  porsche: ['Порше'],
  jeep: ['Джип'],
  mini: ['Мини'],
  jaguar: ['Ягуар'],
  infiniti: ['Инфинити'],
  'alfa-romeo': ['Альфа Ромео'],
  gaz: ['ГАЗ'],
  uaz: ['УАЗ'],
  moskvich: ['Москвич'],
};
