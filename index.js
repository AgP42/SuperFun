/**
 * SuperFun — plugin entry (v0.2, games platform)
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// Single toolbar button opens the SuperFun home on NOTE and DOC.
PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: 100,
  name: 'SuperFun',
  icon: Image.resolveAssetSource(require('./assets/icon.png')).uri,
  showType: 1,
});
