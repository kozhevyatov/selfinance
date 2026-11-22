// Общий код (суммы, даты, типы API) лежит в app/packages/shared — вне папки приложения.
// Metro следит за этой папкой и берёт зависимости (zod) из node_modules мобилки.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@selfinance/shared': sharedRoot,
};

module.exports = config;
