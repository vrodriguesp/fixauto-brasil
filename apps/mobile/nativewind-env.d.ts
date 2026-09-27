/// <reference types="nativewind/types" />
// Referencia direta necessaria alem da acima: `nativewind/types.d.ts` fica no
// node_modules da RAIZ do monorepo (hoisted) e re-referencia
// "react-native-css-interop/types" a partir de la - mas esse pacote so foi
// instalado aninhado em apps/mobile/node_modules (nao hoisted, por algum
// motivo do resolver do npm), entao a resolucao a partir da raiz nunca o
// encontra. Referenciar direto aqui (arquivo que fica em apps/mobile) resolve
// a partir de apps/mobile/node_modules, onde o pacote realmente esta.
/// <reference types="react-native-css-interop/types" />

// TypeScript nao sabe nativamente o que fazer com um import de .css (so o
// Metro/babel do NativeWind entendem em runtime) - sem isso, `import
// '../global.css'` em app/_layout.tsx da erro de tipo.
declare module '*.css';
