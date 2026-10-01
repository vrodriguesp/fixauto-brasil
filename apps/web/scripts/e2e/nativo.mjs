// Comanda o app NATIVO no emulador Android (Expo Go) pelo adb: le a arvore de
// elementos da tela (uiautomator), toca por texto, digita, tira foto.
//   import { tocar, digitar, tela, foto, temTexto } from './nativo.mjs'
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const ADB = 'C:/Android/platform-tools/adb.exe';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', maxBuffer: 50e6 });
export const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function tela() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  const xml = adb('exec-out', 'cat', '/sdcard/ui.xml');
  const nos = [];
  for (const m of xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)) {
    nos.push({ texto: m[1], desc: m[2], x: (+m[3] + +m[5]) >> 1, y: (+m[4] + +m[6]) >> 1 });
  }
  return nos;
}
export const textos = () => tela().map((n) => n.texto || n.desc).filter(Boolean);
export const temTexto = (re) => textos().some((t) => (re instanceof RegExp ? re.test(t) : t.includes(re)));
export async function tocar(alvo, { ultimo = false } = {}) {
  const casa = (v) => (alvo instanceof RegExp ? alvo.test(v) : v === alvo);
  const todos = tela();
  // campo com nome de acessibilidade (content-desc) primeiro; senao, o texto visivel
  const porDesc = todos.filter((n) => n.desc && casa(n.desc));
  const nos = porDesc.length ? porDesc : todos.filter((n) => casa(n.texto));
  if (!nos.length) throw new Error(`nao achei na tela: ${alvo}`);
  const n = ultimo ? nos[nos.length - 1] : nos[0];
  adb('shell', 'input', 'tap', String(n.x), String(n.y));
  await espera(1500);
}
export async function digitar(rotulo, texto) {
  await tocar(rotulo);
  adb('shell', 'input', 'text', texto.replace(/ /g, '%s').replace(/([()&;|<>'"$`\\])/g, '\\$1'));
  await espera(600);
  await fecharTeclado();
}
export const voltar = async () => { adb('shell', 'input', 'keyevent', '4'); await espera(1500); };
export const rolar = async () => { adb('shell', 'input', 'swipe', '160', '500', '160', '150', '300'); await espera(1000); };
export function foto(nome) {
  const buf = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 50e6 });
  fs.writeFileSync(path.join(DIR, nome), buf);
}
export const erroNaTela = () => temTexto(/Render Error|Maximum update depth|Something went wrong|Uncaught|TypeError|is not a function/);

export async function reiniciarApp() {
  adb('shell', 'am', 'force-stop', 'host.exp.exponent');
  await espera(1500);
  adb('reverse', 'tcp:8081', 'tcp:8081');
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'exp://127.0.0.1:8081', 'host.exp.exponent');
  await espera(25000);
}

export async function fecharTeclado() {
  const im = adb('shell', 'dumpsys', 'input_method');
  if (/mInputShown=true|isInputViewShown=true/.test(im)) { adb('shell', 'input', 'keyevent', '4'); await espera(800); }
}
