import { DEFAULT_THEME_NAME } from '../../domain/model/Theme';
import joplin from 'api';
import { container } from 'tsyringe';
import { filter, mapValues, merge } from 'lodash';
import { Db } from '../db';
import { loadTheme } from '../themeLoader';
import { fetchData, fetchAllData } from '../joplinApi';
import type { Article } from '../../domain/model/Article';
import type { Site } from '../../domain/model/Site';
import type { File, Resource } from '../../domain/model/JoplinData';
import { PREDEFINED_FIELDS } from '../../domain/model/Page';
import type { RenderResultPluginAsset, ResourceMap } from './type';
import { copy, outputFile } from './fs';

const db = container.resolve(Db);

export async function getThemeDir(themeName: string) {
  const themeDir =
    themeName === DEFAULT_THEME_NAME
      ? `${await joplin.plugins.installationDir()}/assets/defaultTheme`
      : `${await joplin.plugins.dataDir()}/themes/${themeName}`;

  return themeDir;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = Readonly<Record<string, any>>;

export async function getSite() {
  const site = await db.fetch<Site>(['site']);
  const articles = filter((await db.fetch<Article[]>(['articles'])) || [], { published: true });

  if (!site) {
    throw new Error('no site info in db.json');
  }

  site.articles = articles;
  site.generatedAt = Date.now();

  return site as Required<Site>;
}

export async function getThemeData(themeName: string) {
  const themeConfig = await loadTheme(themeName);

  if (!themeConfig) {
    throw new Error(`fail to load theme config: ${themeName}`);
  }

  const pagesFieldVars = (await db.fetch<Data>(['pagesFieldVars', themeName])) || {};
  const defaultFieldVars = mapValues(themeConfig.pages, (fields, pageName) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const allFields = [...fields!, ...(PREDEFINED_FIELDS[pageName] || [])];
    return allFields.reduce((vars, field) => {
      vars[field.name] = field.defaultValue ?? '';

      return vars;
    }, {} as Record<string, unknown>);
  });

  return { fieldValues: merge(defaultFieldVars, pagesFieldVars), pages: themeConfig.pages };
}

export const PLUGIN_SETTING_PREFIX = 'markdown.plugin.';
export const AUDIO_PLAYER_PLUGIN = 'audioPlayer';
export const VIDEO_PLAYER_PLUGIN = 'videoPlayer';
export const PDF_VIEWER_PLUGIN = 'pdfViewer';
export async function getJoplinMarkdownSetting() {
  // @see https://github.com/laurent22/joplin/blob/1bc674a1f9a1f5021142d040459ef127db71ee62/packages/lib/models/Setting.ts#L873
  const pluginNames = [
    'softbreaks',
    'typographer',
    'linkify',
    'katex',
    'fountain',
    'mermaid',
    AUDIO_PLAYER_PLUGIN,
    VIDEO_PLAYER_PLUGIN,
    PDF_VIEWER_PLUGIN,
    'mark',
    'footnote',
    'toc',
    'sub',
    'sup',
    'deflist',
    'abbr',
    'emoji',
    'insert',
    'multitable',
  ];

  const values = await Promise.all<boolean>(
    pluginNames.map((name) => joplin.settings.globalValue(`${PLUGIN_SETTING_PREFIX}${name}`)),
  );

  return values.reduce((result, value, i) => {
    if (value) {
      result[pluginNames[i]] = {};
    }

    return result;
  }, {} as Record<string, unknown>);
}
export async function getOutputDir() {
  const dataDir = await joplin.plugins.dataDir();
  return `${dataDir}/output`;
}

export async function copyAssets(themeName: string) {
  const themeDir = await getThemeDir(themeName);
  const assetsPath = `${themeDir}/_assets`;

  await copy(assetsPath, `${await getOutputDir()}/_assets`);
}

export async function outputResources(resourceIds: string[], allResource: ResourceMap) {
  const resourceResult = resourceIds.map((id) => allResource[id]);
  const outputDir = await getOutputDir();

  for (const [i, result] of resourceResult.entries()) {
    if (result) {
      const {
        item: { id },
        extension,
      } = result;
      try {
        const file = await fetchData<File>(['resources', id, 'file']);
        await outputFile(`${outputDir}/_resources/${id}.${extension}`, file.body);
      } catch (error) {
        console.warn(`Fail to load File ${id}: ${error}`);
      }
    } else {
      console.warn(`Fail to load resource: ${resourceIds[i]}`);
    }
  }
}

export async function getAllResources() {
  const resources = await fetchAllData<Resource>(['resources'], {
    fields: 'id,mime,file_extension,encryption_applied,encryption_blob_encrypted',
  });

  return resources.reduce((result, resource) => {
    result[resource.id] = {
      extension: resource.file_extension,
      item: {
        mime: resource.mime,
        id: resource.id,
        encryption_blob_encrypted: resource.encryption_blob_encrypted,
        encryption_applied: resource.encryption_applied,
      },
      localState: { fetch_status: 2 },
    };
    return result;
  }, {} as ResourceMap);
}

export async function copyMarkdownPluginAssets(pluginAssets: RenderResultPluginAsset[]) {
  // todo: do not copy more than once
  const pluginAssetPath = `${await joplin.plugins.installationDir()}/assets/markdownPluginAssets`;
  const outputDir = await getOutputDir();

  for (const { name } of pluginAssets) {
    await copy(`${pluginAssetPath}/${name}`, `${outputDir}/_markdownPluginAssets/${name}`);
  }
}
