/**
 * Coherence Beacon Service Tests
 *
 * Tests beacon parsing for both reading (incoming) and writing (outgoing) flows.
 */

import { describe, it, expect } from 'vitest';

// Direct regex test (same pattern used in service.ts)
const BEACON_REGEX = /COHERENCE_BEACON:\s*({.*?})/;

describe('CoherenceBeacon parsing', () => {
  describe('checkCommitsForBeacons regex', () => {
    it('should parse beacon with atCommit field', () => {
      const commitBody = `Add supermodule relationship: Cylinder

COHERENCE_BEACON: {"type":"supermodule","radicleId":"rad:z2N2LRCMhxK9Wba3oF2br8s9qZM5w","title":"Cylinder","atCommit":"657bd3fae37442b83b483bf6ea6bde6171d93e75"}`;

      const match = BEACON_REGEX.exec(commitBody);
      expect(match).not.toBeNull();

      const beaconData = JSON.parse(match![1]);
      expect(beaconData.type).toBe('supermodule');
      expect(beaconData.radicleId).toBe('rad:z2N2LRCMhxK9Wba3oF2br8s9qZM5w');
      expect(beaconData.title).toBe('Cylinder');
      expect(beaconData.atCommit).toBe('657bd3fae37442b83b483bf6ea6bde6171d93e75');
    });

    it('should parse beacon without atCommit field (backwards compatibility)', () => {
      const commitBody = `Add supermodule relationship: OldProject

COHERENCE_BEACON: {"type":"supermodule","radicleId":"rad:zOldId123","title":"OldProject"}`;

      const match = BEACON_REGEX.exec(commitBody);
      expect(match).not.toBeNull();

      const beaconData = JSON.parse(match![1]);
      expect(beaconData.type).toBe('supermodule');
      expect(beaconData.radicleId).toBe('rad:zOldId123');
      expect(beaconData.title).toBe('OldProject');
      expect(beaconData.atCommit).toBeUndefined();
    });

    it('should handle beacon in subject line', () => {
      const commitSubject = 'COHERENCE_BEACON: {"type":"supermodule","radicleId":"rad:zInline","title":"InlineTest","atCommit":"abc123"}';

      const match = BEACON_REGEX.exec(commitSubject);
      expect(match).not.toBeNull();

      const beaconData = JSON.parse(match![1]);
      expect(beaconData.title).toBe('InlineTest');
      expect(beaconData.atCommit).toBe('abc123');
    });

    it('should not match invalid JSON', () => {
      const commitBody = 'COHERENCE_BEACON: {invalid json here}';
      const match = BEACON_REGEX.exec(commitBody);
      // Regex matches, but JSON parse would fail
      expect(match).not.toBeNull();
      expect(() => JSON.parse(match![1])).toThrow();
    });

    it('should not match non-beacon commits', () => {
      const commitBody = 'Just a normal commit message about beacons';
      const match = BEACON_REGEX.exec(commitBody);
      expect(match).toBeNull();
    });
  });

  describe('beacon data integrity', () => {
    it('should preserve all fields when round-tripping', () => {
      // Simulates write → commit → read flow
      const originalData = {
        type: 'supermodule' as const,
        radicleId: 'rad:z2N2LRCMhxK9Wba3oF2br8s9qZM5w',
        title: 'Cylinder',
        atCommit: '657bd3fae37442b83b483bf6ea6bde6171d93e75'
      };

      // Write: serialize to commit message
      const beaconString = JSON.stringify(originalData);
      const commitMessage = `Add supermodule relationship: ${originalData.title}\n\nCOHERENCE_BEACON: ${beaconString}`;

      // Read: parse from commit message
      const match = BEACON_REGEX.exec(commitMessage);
      const parsedData = JSON.parse(match![1]);

      expect(parsedData.type).toBe(originalData.type);
      expect(parsedData.radicleId).toBe(originalData.radicleId);
      expect(parsedData.title).toBe(originalData.title);
      expect(parsedData.atCommit).toBe(originalData.atCommit);
    });
  });
});
