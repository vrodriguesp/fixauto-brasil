// "Crie a sua senha" (app/criar-senha.tsx): "agora nao" vale so enquanto o app
// esta aberto - fecha e abre de novo (ou entra de novo) e a tela volta, ate a
// conta ter senha (profiles.senha_definida). Em memoria de proposito: nao e
// uma preferencia, e um lembrete por sessao (dono 12/11).
let adiada = false;
export const senhaAdiada = () => adiada;
export const adiarSenha = () => { adiada = true; };
export const limparSenhaAdiada = () => { adiada = false; };
