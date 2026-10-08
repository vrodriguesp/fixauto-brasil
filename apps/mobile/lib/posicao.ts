import * as Location from 'expo-location';
import { API_BASE_URL } from './api';
import { fetchComPrazo } from './rede';

// a primeira que der certo (Promise.any nao existe em todo motor de JS do celular)
const primeira = <T,>(ps: Promise<T>[]) => new Promise<T>((ok, falha) => {
  let falhas = 0;
  ps.forEach((p) => p.then(ok, (e) => { if (++falhas === ps.length) falha(e); }));
});

const comPrazo = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('localizacao demorou')), ms))]);

// Posicao do aparelho sem deixar a tela girando para sempre: usa a ultima
// posicao conhecida (instantanea, ate 5 min); senao pede ao mesmo tempo pela
// rede (Wi-Fi/antena, rapido dentro de casa) e pelo GPS de satelite (no local
// do acidente, ao ar livre e as vezes sem Wi-Fi) e usa a primeira que chegar.
export async function obterPosicao(): Promise<Location.LocationObject> {
  const ultima = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
  if (ultima) return ultima;
  return comPrazo(
    primeira([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    ]),
    15000,
  );
}

export interface EnderecoDaPosicao {
  texto: string;
  paisCodigo: string | null;
}

// Endereco (rua, numero, cidade) da posicao: primeiro pelo proprio aparelho
// (iPhone/Android, sem limite de uso), senao pelo servidor do site.
export async function enderecoDaPosicao(lat: number, lon: number): Promise<EnderecoDaPosicao | null> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    if (r) {
      const rua = [r.street, r.streetNumber].filter(Boolean).join(' ');
      const texto = [rua || r.name, r.city || r.subregion, r.region, r.country].filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i).join(', ');
      if (texto) return { texto, paisCodigo: r.isoCountryCode || null };
    }
  } catch { /* segue para o servidor */ }
  try {
    const res = await fetchComPrazo(`${API_BASE_URL}/api/geocode?lat=${lat}&lon=${lon}`);
    const d = await res.json();
    const texto = [d.cidade, d.estado, d.pais].filter(Boolean).join(', ');
    return texto ? { texto, paisCodigo: d.paisCodigo || null } : null;
  } catch {
    return null;
  }
}
