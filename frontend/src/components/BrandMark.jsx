export function BrandMark({ size = 40, className = "" }) {
  return (
    <svg
      className={`brand-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <path className="brand-mark-shadow" d="M32 53 9 40l23-13 23 13-23 13Z" />
      <path className="brand-mark-layer brand-mark-layer-bottom" d="M32 53 9 40l23-13 23 13-23 13Z" />
      <path className="brand-mark-layer brand-mark-layer-mid" d="M32 41 9 28l23-13 23 13-23 13Z" />
      <path className="brand-mark-layer brand-mark-layer-top" d="M32 29 9 16 32 3l23 13-23 13Z" />
      <path className="brand-mark-edge" d="M9 16 32 3l23 13-23 13L9 16Z" />
      <path className="brand-mark-edge" d="M9 28 32 15l23 13-23 13L9 28Z" />
      <path className="brand-mark-edge" d="M9 40 32 27l23 13-23 13L9 40Z" />
    </svg>
  );
}

export function MakeLayerWordmark({ compact = false }) {
  return (
    <span className={`brand-wordmark ${compact ? "brand-wordmark-compact" : ""}`.trim()}>
      <span>Make</span>
      <span>Layer</span>
    </span>
  );
}
