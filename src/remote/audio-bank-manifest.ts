export const AUDIO_BANK_MANIFEST_VERSION = 1 as const;
export const PROCEDURAL_AUDIO_ENGINE_VERSION = 1 as const;

export type AudioBankAssetCategory = 'music' | 'interface' | 'gameplay';
export type ProceduralAudioRecipe =
  | 'interface-hover'
  | 'interface-activate'
  | 'interface-back'
  | 'typing-tick'
  | 'chat-message'
  | 'beat'
  | 'hit'
  | 'combo'
  | 'miss'
  | 'bomb'
  | 'milestone';

export interface ProceduralAudioAssetDefinition {
  id: string;
  category: Exclude<AudioBankAssetCategory, 'music'>;
  recipe: ProceduralAudioRecipe;
  recipeVersion: typeof PROCEDURAL_AUDIO_ENGINE_VERSION;
  variants: readonly string[];
}

export interface AudioBankManifestAsset {
  id: string;
  category: AudioBankAssetCategory;
  kind: 'file' | 'procedural';
  bytes: number;
  sha256: string;
  mimeType?: string;
  url?: string;
  recipe?: ProceduralAudioRecipe;
  recipeVersion?: number;
  variants?: readonly string[];
}

export interface AudioBankManifest {
  version: typeof AUDIO_BANK_MANIFEST_VERSION;
  bankId: string;
  mapId: string;
  totalBytes: number;
  assets: AudioBankManifestAsset[];
}

/**
 * Inventory of every sound currently synthesized by the game. Recipe hashes in
 * the server manifest change whenever this contract changes, invalidating only
 * the affected cached entries on the phone.
 */
export const PROCEDURAL_AUDIO_ASSETS: readonly ProceduralAudioAssetDefinition[] = [
  { id: 'interface.hover', category: 'interface', recipe: 'interface-hover', recipeVersion: 1, variants: [] },
  { id: 'interface.activate', category: 'interface', recipe: 'interface-activate', recipeVersion: 1, variants: [] },
  { id: 'interface.back', category: 'interface', recipe: 'interface-back', recipeVersion: 1, variants: [] },
  { id: 'interface.typing', category: 'interface', recipe: 'typing-tick', recipeVersion: 1, variants: ['0', '1', '2', '3', '4'] },
  { id: 'interface.chat-message', category: 'interface', recipe: 'chat-message', recipeVersion: 1, variants: [] },
  { id: 'gameplay.beat', category: 'gameplay', recipe: 'beat', recipeVersion: 1, variants: [] },
  { id: 'gameplay.hit', category: 'gameplay', recipe: 'hit', recipeVersion: 1, variants: [] },
  { id: 'gameplay.combo', category: 'gameplay', recipe: 'combo', recipeVersion: 1, variants: ['1-40'] },
  { id: 'gameplay.miss', category: 'gameplay', recipe: 'miss', recipeVersion: 1, variants: [] },
  { id: 'gameplay.bomb', category: 'gameplay', recipe: 'bomb', recipeVersion: 1, variants: [] },
  { id: 'gameplay.milestone', category: 'gameplay', recipe: 'milestone', recipeVersion: 1, variants: ['10', '25', '50'] },
] as const;
