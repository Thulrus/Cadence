import type { ScriptRecord, ScriptStore } from '../../storage/scripts';
import type { SettingsStore } from '../../storage/settings';
import type { Notices } from '../components/notice';
import type { OfflineModelService } from '../offline';
import { classifyFile, downloadText, readBackupFile, readScriptFile, safeFilename } from '../files';
import type { Route } from '../router';

/** What views receive from the composition root. */
export interface ViewDeps {
  scripts: ScriptStore;
  settings: SettingsStore;
  notices: Notices;
  /** On-device speech model (download/delete/status). Absent in some view tests. */
  offline?: OfflineModelService;
  navigate(route: Route): void;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Import dropped or picked files: text files become new scripts, `.json` files are merged as
 * backups. Reports results via notices. Returns the scripts created from text files.
 */
export async function importFiles(deps: ViewDeps, files: File[]): Promise<ScriptRecord[]> {
  const created: ScriptRecord[] = [];
  for (const file of files) {
    try {
      if (classifyFile(file) === 'backup') {
        const r = await deps.scripts.importBackup(await readBackupFile(file));
        deps.notices.show(
          `Imported backup: ${r.added} added, ${r.updated} updated, ${r.skipped} unchanged.`,
        );
      } else {
        created.push(await deps.scripts.create(await readScriptFile(file)));
      }
    } catch (e) {
      deps.notices.show(errMsg(e), 'error');
    }
  }
  if (created.length > 1) deps.notices.show(`Added ${created.length} scripts.`);
  else if (created[0]) deps.notices.show(`Added “${created[0].title}”.`);
  return created;
}

/** Download one script as a .txt file. */
export function exportScriptTxt(rec: ScriptRecord): void {
  downloadText(`${safeFilename(rec.title)}.txt`, rec.text, 'text/plain');
}

/** Download the whole library as a dated JSON backup. */
export function exportLibraryJson(deps: ViewDeps): void {
  const date = new Date().toISOString().slice(0, 10);
  downloadText(`cadence-backup-${date}.json`, deps.scripts.exportAll(), 'application/json');
}

/** Run a store write, turning failures into an error notice. Resolves to undefined on failure. */
export async function attempt<T>(deps: ViewDeps, op: () => Promise<T>): Promise<T | undefined> {
  try {
    return await op();
  } catch (e) {
    deps.notices.show(`Couldn't save: ${errMsg(e)}`, 'error');
    return undefined;
  }
}
