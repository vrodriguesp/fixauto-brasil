import * as Location from 'expo-location';
import { API_BASE_URL } from './api';

const comPrazo = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('localizacao demorou')), ms))]);

// Posicao do aparelho sem deixar a tela girando para sempre: usa a ultima
// posicao conhecida (instantanea, ate 5 min); senao pede a atual com precisao
// media; se o GPS nao responder (dentro de casa/garagem, logo depois de
// permitir no iPhone), tenta de novo com precisao baixa (antena/Wi-Fi).
export async function obterPosicao(): Promise<Location.LocationObject> {
  const ultima = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
  if (ultima) return ultima;
  try {
    return await comPrazo(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 12000);
  } catch {
    return comPrazo(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }), 10000);
  }
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
    const res = await fetch(`${API_BASE_URL}/api/geocode?lat=${lat}&lon=${lon}`);
    const d = await res.json();
    const texto = [d.cidade, d.estado, d.pais].filter(Boolean).join(', ');
    return texto ? { texto, paisCodigo: d.paisCodigo || null } : null;
  } catch {
    return null;
  }
}
