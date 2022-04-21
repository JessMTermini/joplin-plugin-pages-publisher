import { cloneDeep, get, set } from 'lodash';
import joplin from 'api';
import { Low } from 'lowdb/lib';
import { singleton } from 'tsyringe';
import fs from 'driver/fs/joplinPlugin';
import { JSONFile } from './adaptor';

@singleton()
export class Db {
  private db: Low<Record<string, unknown>> | null = null;
  private ready = this.init();
  async init(overwriteReady = false) {
    const pluginDir = await joplin.plugins.dataDir();
    this.db = new Low(new JSONFile(`${pluginDir}/db.json`));
    await this.db.read();

    const db = this.db;
    const ready = new Promise<void>((resolve) => {
      if (db.data === null) {
        db.data = {};
      }
      resolve();
    });

    if (overwriteReady) {
      this.ready = ready;
    }

    return ready;
  }

  fetch<T>(path: string[]) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.ready.then<T | null>(() => cloneDeep(get(this.db!.data, path, null)));
  }

  save(path: string[], data: unknown) {
    return this.ready.then(() => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      set(this.db!.data!, path, data);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this.db!.write();
    });
  }

  async fetchIcon() {
    const dataDir = await joplin.plugins.dataDir();
    const iconDir = `${dataDir}/favicon.ico`;
    try {
      return (await fs.promises.readFile(iconDir)) as unknown as Uint8Array;
    } catch {
      return null;
    }
  }

  async saveIcon(icon: Uint8Array | null | undefined) {
    const dataDir = await joplin.plugins.dataDir();
    const iconPath = `${dataDir}/favicon.ico`;

    if (!icon) {
      return await fs.remove(iconPath);
    }

    return await fs.writeFile(iconPath, icon);
  }
}
