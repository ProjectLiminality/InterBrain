/**
 * Unit Tests for CollaborationMemoryService
 *
 * Tests the core logic of tracking accepted/rejected commits.
 * These tests focus on the pure logic functions that don't require file system access.
 *
 * For tests that involve file operations, see the integration tests in:
 * src/features/social-resonance-filter/__tests__/collaboration/
 */

import { describe, it, expect } from 'vitest';
import { CollaborationMemoryService } from './collaboration-memory-service';

describe('CollaborationMemoryService', () => {

  describe('parseOriginalHash (static method)', () => {
    it('should extract hash from cherry-pick message', () => {
      const body = 'Some commit message\n\n(cherry picked from commit abc123def456)';
      const result = CollaborationMemoryService.parseOriginalHash(body);
      expect(result).toBe('abc123def456');
    });

    it('should return null when no cherry-pick marker', () => {
      const body = 'Regular commit message without cherry-pick info';
      const result = CollaborationMemoryService.parseOriginalHash(body);
      expect(result).toBeNull();
    });

    it('should handle case-insensitive matching', () => {
      const body = '(Cherry Picked From Commit abc123)';
      const result = CollaborationMemoryService.parseOriginalHash(body);
      expect(result).toBe('abc123');
    });

    it('should handle full 40-character hashes', () => {
      const fullHash = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const body = `(cherry picked from commit ${fullHash})`;
      const result = CollaborationMemoryService.parseOriginalHash(body);
      expect(result).toBe(fullHash);
    });

    it('should handle hash in middle of message', () => {
      const body = `Feature: Added new functionality

This is the body of the commit.

(cherry picked from commit deadbeef1234)

Signed-off-by: Someone`;
      const result = CollaborationMemoryService.parseOriginalHash(body);
      expect(result).toBe('deadbeef1234');
    });

    it('should handle short hashes', () => {
      const body = '(cherry picked from commit abc1234)';
      const result = CollaborationMemoryService.parseOriginalHash(body);
      expect(result).toBe('abc1234');
    });

    it('should return null for empty body', () => {
      const result = CollaborationMemoryService.parseOriginalHash('');
      expect(result).toBeNull();
    });

    it('should return null for malformed cherry-pick message', () => {
      const body = '(cherry picked from)'; // Missing commit hash
      const result = CollaborationMemoryService.parseOriginalHash(body);
      expect(result).toBeNull();
    });
  });

  describe('getEffectiveOriginalHash (static method)', () => {
    it('should return cherry-picked hash when present in body', () => {
      const hash = 'aabbccdd1234';
      const body = 'Message\n\n(cherry picked from commit deadbeef5678)';
      const result = CollaborationMemoryService.getEffectiveOriginalHash(hash, body);
      expect(result).toBe('deadbeef5678');
    });

    it('should return the commit hash when no cherry-pick marker', () => {
      const hash = 'abc123def789';
      const body = 'Regular commit message without cherry-pick info';
      const result = CollaborationMemoryService.getEffectiveOriginalHash(hash, body);
      expect(result).toBe('abc123def789');
    });

    it('should return commit hash when body is empty', () => {
      const hash = 'abc123';
      const result = CollaborationMemoryService.getEffectiveOriginalHash(hash, '');
      expect(result).toBe('abc123');
    });

    it('should handle real-world cherry-pick message format', () => {
      const hash = '9f8e7d6c5b4a';
      const body = `Add collaboration memory service

Implements tracking of accepted/rejected commits per peer.

(cherry picked from commit 1a2b3c4d5e6f7890abcdef1234567890abcdef12)`;
      const result = CollaborationMemoryService.getEffectiveOriginalHash(hash, body);
      expect(result).toBe('1a2b3c4d5e6f7890abcdef1234567890abcdef12');
    });
  });

  describe('Hash deduplication scenarios', () => {
    // These tests verify the logic used to deduplicate commits across relay chains
    // Note: Git hashes are hexadecimal (0-9, a-f), so we use valid hex strings

    it('should treat same original hash from different relays as same commit', () => {
      // Scenario: Alice and Bob both relay Charlie's commit
      const charliesOriginalHash = 'c0ffee123456';

      // Alice cherry-picks Charlie's commit
      const alicesHash = 'a11ce0001234';
      const alicesBody = `Charlie's feature\n\n(cherry picked from commit ${charliesOriginalHash})`;
      const fromAlice = CollaborationMemoryService.getEffectiveOriginalHash(alicesHash, alicesBody);

      // Bob cherry-picks Charlie's commit
      const bobsHash = 'b0b000005678';
      const bobsBody = `Charlie's feature\n\n(cherry picked from commit ${charliesOriginalHash})`;
      const fromBob = CollaborationMemoryService.getEffectiveOriginalHash(bobsHash, bobsBody);

      // Both should resolve to Charlie's original hash
      expect(fromAlice).toBe(charliesOriginalHash);
      expect(fromBob).toBe(charliesOriginalHash);
      expect(fromAlice).toBe(fromBob);
    });

    it('should distinguish original commits from relayed commits', () => {
      const originalHash = 'deadbeef1234';

      // Original commit (no cherry-pick marker)
      const directCommit = CollaborationMemoryService.getEffectiveOriginalHash(
        originalHash,
        'Some feature'
      );

      // Relayed commit (has cherry-pick marker)
      const relayedCommit = CollaborationMemoryService.getEffectiveOriginalHash(
        'aabbccdd5678',
        `Some feature\n\n(cherry picked from commit ${originalHash})`
      );

      // Both should resolve to the same original hash
      expect(directCommit).toBe(originalHash);
      expect(relayedCommit).toBe(originalHash);
    });

    it('should handle multi-hop relay chains', () => {
      // Scenario: Charlie -> Alice -> Bob -> You
      // Each cherry-pick preserves Charlie's original hash

      const charliesHash = 'c0ffee000000';
      const alicesHash = 'a11ce0000000';
      const bobsHash = 'b0b000000000';

      // Alice cherry-picks from Charlie
      const alicesBody = `Feature\n\n(cherry picked from commit ${charliesHash})`;

      // Bob cherry-picks from Alice (but the message still has Charlie's hash)
      // Because -x preserves the ORIGINAL hash, not Alice's hash
      const bobsBody = `Feature\n\n(cherry picked from commit ${charliesHash})`;

      const fromAlice = CollaborationMemoryService.getEffectiveOriginalHash(alicesHash, alicesBody);
      const fromBob = CollaborationMemoryService.getEffectiveOriginalHash(bobsHash, bobsBody);

      // Both trace back to Charlie
      expect(fromAlice).toBe(charliesHash);
      expect(fromBob).toBe(charliesHash);
    });
  });

  describe('Memory file structure validation', () => {
    // These tests document the expected structure of collaboration-memory.json

    it('should document the expected empty structure', () => {
      const emptyMemory = {
        version: 1,
        dreamNodes: {}
      };

      expect(emptyMemory.version).toBe(1);
      expect(emptyMemory.dreamNodes).toEqual({});
    });

    it('should document the expected structure with data', () => {
      const memoryWithData = {
        version: 1,
        dreamNodes: {
          'dreamnode-uuid-123': {
            accepted: [
              {
                originalHash: 'abc123',
                appliedHash: 'def456',
                relayedBy: ['peer-uuid-1', 'peer-uuid-2'],
                subject: 'Add feature X',
                acceptedAt: 1700000000000
              }
            ],
            rejected: [
              {
                originalHash: 'ghi789',
                subject: 'Unwanted change',
                rejectedAt: 1700000001000,
                reason: 'Does not fit architecture'
              }
            ]
          }
        }
      };

      // Validate structure
      expect(memoryWithData.version).toBe(1);
      expect(Object.keys(memoryWithData.dreamNodes)).toHaveLength(1);

      const nodeState = memoryWithData.dreamNodes['dreamnode-uuid-123'];
      expect(nodeState.accepted).toHaveLength(1);
      expect(nodeState.rejected).toHaveLength(1);

      // Accepted commit has required fields
      const accepted = nodeState.accepted[0];
      expect(accepted.originalHash).toBeDefined();
      expect(accepted.appliedHash).toBeDefined();
      expect(accepted.relayedBy).toBeInstanceOf(Array);
      expect(accepted.subject).toBeDefined();
      expect(accepted.acceptedAt).toBeTypeOf('number');

      // Rejected commit has required fields
      const rejected = nodeState.rejected[0];
      expect(rejected.originalHash).toBeDefined();
      expect(rejected.subject).toBeDefined();
      expect(rejected.rejectedAt).toBeTypeOf('number');
      // reason is optional
      expect(rejected.reason).toBeDefined();
    });
  });
});
