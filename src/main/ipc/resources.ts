import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type { ResourceInfo, ResourcesDeleteReq } from '@shared/types/ipc';
import { deleteResource, listResources } from '../services/resources.js';
import { logger } from '../services/logger.js';

async function handleList(): Promise<ResourceInfo[]> {
  try {
    return await listResources();
  } catch (err) {
    logger.error('resources:list failed', err);
    throw err;
  }
}

async function handleDelete(_e: unknown, req: ResourcesDeleteReq): Promise<ResourceInfo> {
  try {
    if (!req?.kind) throw new Error('kind is required');
    return await deleteResource(req.kind);
  } catch (err) {
    logger.error('resources:delete failed', err);
    throw err;
  }
}

export function registerResourcesHandlers(): void {
  ipcMain.handle(IPC.RESOURCES_LIST, handleList);
  ipcMain.handle(IPC.RESOURCES_DELETE, handleDelete);
}
