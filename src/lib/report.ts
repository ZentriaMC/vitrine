/**
 * `buf breaking --error-format=json` output.
 *
 * buf emits one JSON object per line, already carrying the rule id, the file
 * and the position -- so nothing here parses prose. The rule id is the useful
 * part: it groups findings by category and is stable enough to filter on.
 */

/** Attachments carrying `buf breaking` output. See docs/oci-artifact.md. */
export const BREAKING_ARTIFACT_TYPE = 'application/vnd.zentria.protoschema.breaking.v1';

export interface BreakingFinding {
    /** Module-relative, matching FileDescriptorProto.name. */
    path: string;
    line: number;
    column: number;
    /** buf rule id, e.g. `FIELD_SAME_TYPE`. */
    type: string;
    message: string;
    /** Symbol the position resolves to, when one contains it. */
    fqn?: string;
}

interface RawFinding {
    path?: string;
    start_line?: number;
    start_column?: number;
    type?: string;
    message?: string;
}

/**
 * Parses JSONL, skipping anything that is not a finding.
 *
 * buf writes diagnostics to the same stream, and the recipe captures stderr
 * too, so a line that will not parse is expected rather than exceptional.
 */
export function parseFindings(text: string): BreakingFinding[] {
    const out: BreakingFinding[] = [];

    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;

        let raw: RawFinding;
        try {
            raw = JSON.parse(trimmed) as RawFinding;
        } catch {
            continue;
        }
        if (!raw.message) continue;

        out.push({
            path: raw.path ?? '',
            line: raw.start_line ?? 0,
            column: raw.start_column ?? 0,
            type: raw.type ?? 'UNKNOWN',
            message: raw.message
        });
    }

    return out;
}
