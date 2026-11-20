export interface ProvenanceEntry {
  placeholder: string;
  key: string;
  value: string | number;
  position: number;
}

export interface RenderResult {
  renderedText: string;
  provenance: ProvenanceEntry[];
  errors: string[];
}

/**
 * Replaces placeholders of form `{{key}}` in the template string with values from the facts catalog.
 * Maintains full provenance tracking for number safety audit.
 */
export function renderTemplate(
  templateStr: string,
  facts: Record<string, string | number>
): RenderResult {
  const provenance: ProvenanceEntry[] = [];
  const errors: string[] = [];

  const placeholderRegex = /\{\{([\w.-]+)\}\}/g;

  const renderedText = templateStr.replace(placeholderRegex, (match, key: string, offset: number) => {
    if (Object.prototype.hasOwnProperty.call(facts, key)) {
      const val = facts[key];
      provenance.push({
        placeholder: match,
        key,
        value: val,
        position: offset
      });
      return String(val);
    } else {
      errors.push(`Unknown placeholder: "${match}" at position ${offset}`);
      return match;
    }
  });

  return {
    renderedText,
    provenance,
    errors
  };
}
