const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo (npm workspaces): o Metro precisa saber que existe codigo/deps
// fora da pasta do app (packages/shared, node_modules hoisted na raiz).
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
// O app nao usa nada de apps/web; sem isto, o .next do site (next dev) e os
// prints dos testes faziam o Metro recarregar o app sem parar (teste 26/10).
config.resolver.blockList = [/[\\/]apps[\\/]web[\\/].*/];

module.exports = withNativeWind(config, { input: './global.css' });
