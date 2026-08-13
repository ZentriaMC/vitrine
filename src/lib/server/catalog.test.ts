import { describe, expect, it } from 'vitest';
import { compareVersions } from '$lib/server/catalog';

// This module imports $env/dynamic/private, so it only resolves through Vite --
// which is the reason the suite runs on vitest rather than `bun test`.
describe('compareVersions', () => {
    it('sorts newest first', () => {
        expect(['v1.0.0', 'v2.0.0', 'v1.9.0'].sort(compareVersions)).toEqual([
            'v2.0.0',
            'v1.9.0',
            'v1.0.0'
        ]);
    });

    it('compares numeric runs, not text', () => {
        // The bug this exists to prevent: v1.10.0 sorts below v1.9.0 lexically.
        expect(['v1.9.0', 'v1.10.0'].sort(compareVersions)).toEqual(['v1.10.0', 'v1.9.0']);
    });

    it('handles bare versions, with no v prefix', () => {
        expect(['0.1.0', '0.10.0', '0.2.0'].sort(compareVersions)).toEqual([
            '0.10.0',
            '0.2.0',
            '0.1.0'
        ]);
    });

    it('handles calver', () => {
        expect(['v2026.8.1', 'v2026.10.1', 'v2025.12.3'].sort(compareVersions)).toEqual([
            'v2026.10.1',
            'v2026.8.1',
            'v2025.12.3'
        ]);
    });

    it('groups by prefix when styles are mixed, which is why not to mix them', () => {
        // Documented behaviour rather than desired behaviour: every v-prefixed
        // tag sorts above every bare one regardless of number. Pick one style
        // per module.
        expect(['1.0.0', 'v1.0.0', '2.0.0', 'v0.9.0'].sort(compareVersions)).toEqual([
            'v1.0.0',
            'v0.9.0',
            '2.0.0',
            '1.0.0'
        ]);
    });
});
