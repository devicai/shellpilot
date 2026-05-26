import { apiClient } from '../client';
import type {
  CatalogUpdate,
  ImportRegistryResult,
  RegistryEntryDetail,
  RegistryListItem,
} from '../../types/api';

export const catalogApi = {
  // Browse the official catalog, annotated with this tenant's import/update status.
  listRegistry: () =>
    apiClient.get<RegistryListItem[]>('/catalog/registry').then((r) => r.data),
  // Imported entries with a newer version available upstream.
  listUpdates: () => apiClient.get<CatalogUpdate[]>('/catalog/updates').then((r) => r.data),
  // Preview a single entry (validated install snippet + auth/delivery).
  getEntry: (slug: string) =>
    apiClient.get<RegistryEntryDetail>(`/catalog/registry/${slug}`).then((r) => r.data),
  // Import (or re-import with overwrite) an entry into the local DB.
  import: (slug: string, overwrite?: boolean) =>
    apiClient
      .post<ImportRegistryResult>('/catalog/import', { slug, overwrite })
      .then((r) => r.data),
};
