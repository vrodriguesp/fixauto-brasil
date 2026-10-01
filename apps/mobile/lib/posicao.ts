import * as Location from 'expo-location';

// Posicao do aparelho sem deixar a tela girando para sempre: usa a ultima
// posicao conhecida (instantanea, ate 5 min), senao pede a atual com precisao
// media e desiste em 15 s - dentro de casa/garagem o GPS pode nao responder,
// e a pessoa ainda pode digitar o endereco.
export async function obterPosicao(): Promise<Location.LocationObject> {
  const ultima = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
  if (ultima) return ultima;
  return Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('localizacao demorou')), 15000)),
  ]);
}
