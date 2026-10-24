import type { ToolBridge } from './bridge';
import { emptyDossier, type DossierStore } from './dossier';
import type { ScenarioStore } from './storage';
import { JOURNEY_TOOL_IDS } from './wizard';

/**
 * Drops drafts, confirmed tools, contacts, and saved «До» comparisons.
 * The color scheme stays. Nothing runs this on page load.
 */
export function resetVisitorProgress(
  dossier: DossierStore,
  bridge: ToolBridge,
  store: ScenarioStore,
): void {
  dossier.update(() => emptyDossier());
  bridge.clear();
  for (const toolId of JOURNEY_TOOL_IDS) {
    store.clear(toolId);
  }
}
