import { forwardRef } from 'react';
import { Platform, ScrollView } from 'react-native';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewProps, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

// Rolagem dos formularios. No celular (app instalado) rola para o campo ficar acima do teclado;
// na versao web o proprio navegador faz isso, e a rolagem do app tirava o foco do campo no
// Safari: o endereco e o telefone do acidente nao aceitavam mais nada (teste do dono 08/11).
const RolagemTeclado = forwardRef<KeyboardAwareScrollViewRef, KeyboardAwareScrollViewProps>(function RolagemTeclado({ bottomOffset, keyboardDismissMode, ...props }, ref) {
  // web: sem "fechar o teclado ao arrastar" - a rolagem que o proprio Safari faz ate o campo
  // tocado contava como arrastar, fechava o teclado e tirava o foco (causa real do "trava")
  if (Platform.OS === 'web') return <ScrollView ref={ref as never} {...props} />;
  return <KeyboardAwareScrollView ref={ref} bottomOffset={bottomOffset} keyboardDismissMode={keyboardDismissMode} {...props} />;
});

export default RolagemTeclado;
