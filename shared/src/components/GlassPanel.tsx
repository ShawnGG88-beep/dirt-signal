import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type GlassLayer = 1 | 2 | 3;

export interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  layer?: GlassLayer;
  /** Wrap children in an opaque reading zone for body text. */
  readingZone?: boolean;
  children: ReactNode;
  as?: "div" | "section" | "article" | "aside";
}

const LAYER_CLASS: Record<GlassLayer, string> = {
  1: "glass-l1",
  2: "glass-l2",
  3: "glass-l3",
};

/**
 * Frosted glass panel at depth L1, L2 or L3.
 * Glass is the frame: put prose inside readingZone when possible.
 */
export function GlassPanel({
  layer = 1,
  readingZone = false,
  children,
  className,
  as: Tag = "div",
  style,
  ...rest
}: GlassPanelProps) {
  const classes = [LAYER_CLASS[layer], className].filter(Boolean).join(" ");
  const mergedStyle: CSSProperties | undefined = style;

  return (
    <Tag className={classes} style={mergedStyle} {...rest}>
      {readingZone ? (
        <div className="glass-reading-zone">{children}</div>
      ) : (
        children
      )}
    </Tag>
  );
}
