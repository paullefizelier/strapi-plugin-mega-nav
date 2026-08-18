import * as React from "react";
import { Box } from "@strapi/design-system";
import Preview from "./Preview";
import { sampleTreeFor } from "../editor/sampleTree";
import type { LayoutSpec } from "../types";

/**
 * A layout rendered with generated sample content, for browsing rather than
 * editing: selection and the field↔zone cross-highlighting are inert here.
 *
 * Scaled down rather than re-drawn, so the thumbnail cannot drift from the
 * preview an editor sees once the layout is chosen — the two are the same
 * component.
 */
const LayoutThumbnail = ({ spec, scale = 0.55 }: { spec: LayoutSpec; scale?: number }) => {
  const root = React.useMemo(() => sampleTreeFor(spec), [spec]);
  const noop = React.useCallback(() => {}, []);
  const noZones = React.useMemo(() => new Set<string>(), []);

  return (
    <Box
      // The scaled child keeps its layout width, so the wrapper has to clip it
      // and claw back the empty space the transform leaves behind.
      style={{
        overflow: "hidden",
        pointerEvents: "none",
        userSelect: "none",
      }}
      aria-hidden
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${100 / scale}%`,
          marginBottom: `${-(1 - scale) * 260}px`,
        }}
      >
        <Preview
          root={root}
          spec={spec}
          selectedId={null}
          onSelect={noop}
          highlightZones={noZones}
          onZoneHover={noop}
        />
      </div>
    </Box>
  );
};

export default LayoutThumbnail;
