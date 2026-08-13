import { describe, expect, it } from 'vitest';
import { parseFindings } from '$lib/report';

// Verbatim `buf breaking --error-format=json` output.
const REAL = `{"path":"zentria/vitrine/demo/v1/complex.proto","start_line":1,"start_column":1,"end_line":1,"end_column":1,"type":"MESSAGE_NO_DELETE","message":"Previously present message \\"LegacyCluster\\" was deleted from file."}
{"path":"zentria/vitrine/demo/v1/complex.proto","start_line":113,"start_column":3,"end_line":113,"end_column":9,"type":"FIELD_SAME_TYPE","message":"Field \\"3\\" with name \\"target_utilization\\" on message \\"Autoscale\\" changed type from \\"float\\" to \\"double\\"."}`;

describe('parseFindings', () => {
    it('parses buf JSON lines', () => {
        const findings = parseFindings(REAL);

        expect(findings).toHaveLength(2);
        expect(findings[1]).toMatchObject({
            path: 'zentria/vitrine/demo/v1/complex.proto',
            line: 113,
            column: 3,
            type: 'FIELD_SAME_TYPE'
        });
        expect(findings[1].message).toContain('float');
    });

    it('is empty for an empty report, which is a real result', () => {
        expect(parseFindings('')).toEqual([]);
        expect(parseFindings('\n\n')).toEqual([]);
    });

    it('skips lines that are not findings', () => {
        // The recipe captures stderr too, so diagnostics land in the same stream.
        const noisy = `Failure: something buf wanted to say\n${REAL.split('\n')[0]}\nnot json`;
        expect(parseFindings(noisy)).toHaveLength(1);
    });

    it('survives malformed JSON without throwing', () => {
        expect(parseFindings('{"path":"a.proto",')).toEqual([]);
    });
});
