// Estende o app.json. O google-services.json (Firebase, push no Android) nao vai ao git:
// no EAS vem da variavel de arquivo GOOGLE_SERVICES_JSON; localmente, do arquivo na pasta.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
