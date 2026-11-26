/**
 * Parses the "Add to Construction Project" target chosen on the visualizer.
 * Accepted values: "new", "<projectId>", or "<projectId>|<roomId>" (room part may be empty).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectTarget =
  | { kind: 'new' }
  | { kind: 'existing'; projectId: string; roomId: string | null }
  | { kind: 'invalid' };

export function parseProjectTarget(value: string): ProjectTarget {
  const raw = value.trim();
  if (raw === 'new') return { kind: 'new' };
  const parts = raw.split('|');
  if (parts.length > 2) return { kind: 'invalid' };
  const [projectId, roomPart] = parts;
  if (!projectId || !UUID.test(projectId)) return { kind: 'invalid' };
  if (roomPart === undefined || roomPart === '') return { kind: 'existing', projectId, roomId: null };
  if (!UUID.test(roomPart)) return { kind: 'invalid' };
  return { kind: 'existing', projectId, roomId: roomPart };
}

/** Where to send the guest after the products are added to the project. */
export function projectPathAfterAdd(storeSlug: string, projectId: string): string {
  return `/store/${storeSlug}/projects/${projectId}`;
}
