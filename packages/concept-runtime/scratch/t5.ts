export function resetEvidenceCache(path?: string): void {
  if (path === undefined) caches.clear();
  else caches.delete(path);
}
