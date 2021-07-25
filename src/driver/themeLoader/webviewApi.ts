import { container } from 'tsyringe';
import { themeFetcherToken } from '../../domain/repository/PluginDataRepository';
import type { Theme } from '../../domain/model/Theme';

export interface ThemeConfigLoadRequest {
  event: 'loadThemeConfig';
  themeName: string;
}

export interface ThemeConfigsLoadRequest {
  event: 'loadThemeConfigs';
}

declare const webviewApi: {
  postMessage: <T>(payload: ThemeConfigLoadRequest | ThemeConfigsLoadRequest) => Promise<T>;
};

container.registerInstance(themeFetcherToken, {
  fetch(themeName: string) {
    return webviewApi.postMessage<Theme | null>({ event: 'loadThemeConfig', themeName });
  },
  fetchAll() {
    return webviewApi.postMessage<Theme[]>({ event: 'loadThemeConfigs' });
  },
});
