/**
 * Reference lines — while you scroll one grid cell, the others draw a line where
 * that slice cuts through them. Scroll an axial series on the left and the
 * coronal on the right shows exactly which level you are looking at.
 *
 * One viewport is the *source* at a time (normally the focused cell); every other
 * viewport in the same tool group is a target. Cornerstone draws nothing when:
 *
 * - the two planes are parallel (axial ↔ axial has no meaningful intersection),
 * - or the viewports don't share a frame of reference — the default
 *   `enforceSameFrameOfReference` is deliberately left on, because a line drawn
 *   across unregistered geometry would be confidently wrong.
 *
 * Parallel to scroll sync: that moves the other viewports, this only draws on
 * them. The two are independent toggles and compose freely.
 */
import { ToolGroupManager, ReferenceLinesTool } from "@cornerstonejs/tools";
import { TOOL_GROUP_ID } from "./init";

export interface ReferenceLinesHandle {
  /**
   * Point the lines at a viewport, or pass `null` to draw none. Idempotent:
   * repeating the current source does nothing, so callers can re-declare it on
   * every relevant change (focus moving, a cell loading, the feature toggling).
   */
  setSource: (viewportId: string | null) => void;
  /** The current source viewport id, or null when the lines are off. */
  getSource: () => string | null;
  destroy: () => void;
}

/**
 * Drive the ReferenceLines tool on a tool group. The tool is added to the group
 * once at init (see `cornerstone/init.ts`) and sits Disabled until a source is
 * set, so a viewer that never turns the feature on renders nothing extra.
 */
export function createReferenceLines(toolGroupId: string = TOOL_GROUP_ID): ReferenceLinesHandle {
  const toolName = ReferenceLinesTool.toolName;
  let source: string | null = null;
  let destroyed = false;

  const toolGroup = () => ToolGroupManager.getToolGroup(toolGroupId);

  const disable = () => {
    source = null;
    try {
      toolGroup()?.setToolDisabled(toolName);
    } catch {
      /* group already torn down */
    }
  };

  return {
    setSource(viewportId) {
      if (destroyed || viewportId === source) return;
      if (!viewportId) {
        disable();
        return;
      }
      const tg = toolGroup();
      if (!tg) return;
      source = viewportId;
      // Configuration BEFORE enabling: setToolEnabled immediately re-initializes
      // the tool, and the first thing it does is read sourceViewportId out of the
      // configuration. Enabling first would init against a stale (or empty)
      // source and draw the wrong line until the next camera change.
      tg.setToolConfiguration(toolName, { sourceViewportId: viewportId });
      tg.setToolEnabled(toolName);
    },
    getSource() {
      return source;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      disable();
    },
  };
}
