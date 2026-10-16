/** The only mapping from Cloudback roles to temporary model files. Loaded on demand. */
export interface BorrowedAsset { file: string; node: string; tint?: string }
export const BORROWED: Readonly<Record<string, BorrowedAsset>> = {};

export async function loadBorrowed(role: string) {
  const asset = Object.hasOwn(BORROWED, role) ? BORROWED[role] : undefined;
  if (!asset) throw new Error('Unknown borrowed role: ' + role);
  const { loadBorrowedModel } = await import('./assets.ts');
  return loadBorrowedModel(asset);
}
