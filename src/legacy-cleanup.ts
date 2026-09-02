import { LEGACY_RELEASE_ROOTS } from './release-layout.js';

export interface LegacyCleanupInput {
  objects: string[];
  replacementVerified: boolean;
}

export function planLegacyArtifactCleanup(input: LegacyCleanupInput) {
  if (!input.replacementVerified) {
    throw Object.assign(new Error('Replacement release must be verified before deleting legacy installers.'), {
      code: 'REPLACEMENT_NOT_VERIFIED',
    });
  }
  const objects = [...new Set(input.objects.map((value) => value.replace(/^\/+/, '')).filter(Boolean))];
  const isLegacy = (value: string) => LEGACY_RELEASE_ROOTS.some((root) => value.startsWith(root));
  return {
    deleteObjects: objects.filter(isLegacy).sort(),
    keepObjects: objects.filter((value) => !isLegacy(value)).sort(),
  };
}
