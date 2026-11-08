import { Alert, Platform, type AlertButton } from 'react-native';

// Alert.alert com botoes nao aparece na versao web do app (react-native-web nao
// implementa): "Sair" nao fazia nada (teste do dono 07/11). Na web vira o
// confirm do navegador e roda o botao que nao e "cancelar".
export function confirmar(titulo: string, texto: string, botoes: AlertButton[]) {
  if (Platform.OS !== 'web') { Alert.alert(titulo, texto, botoes); return; }
  const acao = botoes.find((b) => b.style !== 'cancel');
  if (window.confirm([titulo, texto].filter(Boolean).join('\n\n'))) acao?.onPress?.();
}

// Aviso sem botoes: Alert.alert tambem nao aparece na web (auditoria 08/11)
export function avisar(titulo: string, texto?: string) {
  if (Platform.OS !== 'web') { Alert.alert(titulo, texto); return; }
  window.alert([titulo, texto].filter(Boolean).join('\n\n'));
}
