import React from 'react';

/**
 * Shared SVG Pattern definitions for severity rendering.
 * Injected once into SVG containers or at root level.
 */
export function SeveritySvgPatterns() {
  return (
    <svg width="0" height="0" className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
      <defs>
        {/* NONE / Plain */}
        <pattern id="svg-pattern-none" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#CFE3D4" />
        </pattern>

        {/* MINOR / Dots */}
        <pattern id="svg-pattern-minor" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#F5E6B3" />
          <circle cx="4" cy="4" r="1.2" fill="#7A6420" opacity="0.6" />
        </pattern>

        {/* MODERATE / Light Stripes */}
        <pattern id="svg-pattern-moderate" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#F6C9A6" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="#8A4F1F" strokeWidth="3" opacity="0.4" />
        </pattern>

        {/* SEVERE / Dense Stripes */}
        <pattern id="svg-pattern-severe" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#EBA5A0" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#8C2F2A" strokeWidth="2.5" opacity="0.5" />
        </pattern>

        {/* CANCELLED / Cross Hatch */}
        <pattern id="svg-pattern-cancelled" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#D9D5CE" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="#5E5A52" strokeWidth="2" opacity="0.5" />
          <line x1="0" y1="0" x2="10" y2="0" stroke="#5E5A52" strokeWidth="2" opacity="0.5" />
        </pattern>

        {/* Ground Hold / Arrival Hold Waves */}
        <pattern id="svg-pattern-hold" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#C9776B" fillOpacity="0.15" />
          <circle cx="4" cy="4" r="1.5" fill="#C9776B" fillOpacity="0.4" />
        </pattern>
      </defs>
    </svg>
  );
}

/**
 * Returns the fill attribute for an SVG element based on severity.
 */
export function getSeveritySvgFill(severity: string, isDelayExtension = false): string {
  if (isDelayExtension) {
    switch (severity) {
      case 'MINOR':
        return 'url(#svg-pattern-minor)';
      case 'MODERATE':
        return 'url(#svg-pattern-moderate)';
      case 'SEVERE':
        return 'url(#svg-pattern-severe)';
      default:
        return '#EBA5A0';
    }
  }

  switch (severity) {
    case 'NONE':
      return '#CFE3D4';
    case 'MINOR':
      return '#F5E6B3';
    case 'MODERATE':
      return '#F6C9A6';
    case 'SEVERE':
      return '#EBA5A0';
    case 'CANCELLED':
      return 'url(#svg-pattern-cancelled)';
    default:
      return '#CFE3D4';
  }
}

/**
 * Returns text color for a given severity.
 */
export function getSeverityTextColor(severity: string): string {
  switch (severity) {
    case 'NONE':
      return '#3F6B4E';
    case 'MINOR':
      return '#7A6420';
    case 'MODERATE':
      return '#8A4F1F';
    case 'SEVERE':
      return '#8C2F2A';
    case 'CANCELLED':
      return '#5E5A52';
    default:
      return '#2B2F3A';
  }
}
