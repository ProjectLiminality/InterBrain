/**
 * UDD Service - Read/Write operations for Universal Dream Description files
 *
 * This service provides centralized .udd file operations for both the main
 * application and git hook scripts. Designed to be lightweight and reusable.
 *
 * Note: Uses synchronous fs operations since UDD files are small JSON files
 * and operations need to be atomic (especially in git hooks).
 */

import { UDDFile, SupermoduleEntry } from '../types/dreamnode';

const fs = require('fs');
const path = require('path');

export class UDDService {
  /**
   * Read and parse a .udd file from a DreamNode repository
   */
  static async readUDD(dreamNodePath: string): Promise<UDDFile> {
    const uddPath = path.join(dreamNodePath, '.udd');

    try {
      const content = fs.readFileSync(uddPath, 'utf-8');
      const udd = JSON.parse(content) as UDDFile;

      // Validate required fields
      if (!udd.uuid || !udd.title || !udd.type) {
        throw new Error(`Invalid .udd file: missing required fields in ${uddPath}`);
      }

      return udd;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to read .udd file from ${dreamNodePath}: ${errorMessage}`);
    }
  }

  /**
   * Write a UDD object to a .udd file
   */
  static async writeUDD(dreamNodePath: string, udd: UDDFile): Promise<void> {
    const uddPath = path.join(dreamNodePath, '.udd');

    try {
      // Pretty-print JSON for readability
      const content = JSON.stringify(udd, null, 2);
      fs.writeFileSync(uddPath, content, 'utf-8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to write .udd file to ${dreamNodePath}: ${errorMessage}`);
    }
  }

  /**
   * Add a supermodule relationship to a DreamNode's .udd file (legacy format)
   * Returns true if the relationship was added, false if it already existed
   * @deprecated Use addSupermoduleEntry for new code - includes historical tracking
   */
  static async addSupermodule(dreamNodePath: string, parentUUID: string): Promise<boolean> {
    const udd = await this.readUDD(dreamNodePath);

    // Check if relationship already exists (handle both formats)
    const exists = udd.supermodules.some(entry =>
      typeof entry === 'string' ? entry === parentUUID : entry.radicleId === parentUUID
    );
    if (exists) {
      return false;
    }

    // Add the relationship (legacy string format for backward compat)
    udd.supermodules.push(parentUUID);
    await this.writeUDD(dreamNodePath, udd);
    return true;
  }

  /**
   * Add an enhanced supermodule entry with historical tracking
   * Returns true if added, false if already exists (by radicleId)
   */
  static async addSupermoduleEntry(
    dreamNodePath: string,
    entry: SupermoduleEntry
  ): Promise<boolean> {
    const udd = await this.readUDD(dreamNodePath);

    // Check if relationship already exists by radicleId
    const exists = udd.supermodules.some(existing =>
      typeof existing === 'string'
        ? existing === entry.radicleId
        : existing.radicleId === entry.radicleId
    );
    if (exists) {
      return false;
    }

    // Add the enhanced entry
    udd.supermodules.push(entry);
    await this.writeUDD(dreamNodePath, udd);
    return true;
  }

  /**
   * Check if a supermodule relationship exists (by radicleId)
   */
  static async hasSupermodule(dreamNodePath: string, radicleId: string): Promise<boolean> {
    const udd = await this.readUDD(dreamNodePath);
    return udd.supermodules.some(entry =>
      typeof entry === 'string' ? entry === radicleId : entry.radicleId === radicleId
    );
  }

  /**
   * Remove a supermodule relationship from a DreamNode's .udd file
   * Returns true if the relationship was removed, false if it didn't exist
   * Handles both legacy (string) and enhanced (SupermoduleEntry) formats
   */
  static async removeSupermodule(dreamNodePath: string, radicleId: string): Promise<boolean> {
    const udd = await this.readUDD(dreamNodePath);

    // Find index handling both formats
    const index = udd.supermodules.findIndex(entry =>
      typeof entry === 'string' ? entry === radicleId : entry.radicleId === radicleId
    );
    if (index === -1) {
      return false;
    }

    // Remove the relationship
    udd.supermodules.splice(index, 1);
    await this.writeUDD(dreamNodePath, udd);
    return true;
  }

  /**
   * Add a submodule relationship to a DreamNode's .udd file
   * Returns true if the relationship was added, false if it already existed
   */
  static async addSubmodule(dreamNodePath: string, childUUID: string): Promise<boolean> {
    const udd = await this.readUDD(dreamNodePath);

    // Check if relationship already exists
    if (udd.submodules.includes(childUUID)) {
      return false;
    }

    // Add the relationship
    udd.submodules.push(childUUID);
    await this.writeUDD(dreamNodePath, udd);
    return true;
  }

  /**
   * Remove a submodule relationship from a DreamNode's .udd file
   * Returns true if the relationship was removed, false if it didn't exist
   */
  static async removeSubmodule(dreamNodePath: string, childUUID: string): Promise<boolean> {
    const udd = await this.readUDD(dreamNodePath);

    // Check if relationship exists
    const index = udd.submodules.indexOf(childUUID);
    if (index === -1) {
      return false;
    }

    // Remove the relationship
    udd.submodules.splice(index, 1);
    await this.writeUDD(dreamNodePath, udd);
    return true;
  }

  /**
   * Get the UUID from a DreamNode's .udd file
   */
  static async getUUID(dreamNodePath: string): Promise<string> {
    const udd = await this.readUDD(dreamNodePath);
    return udd.uuid;
  }

  /**
   * Get the title from a DreamNode's .udd file
   */
  static async getTitle(dreamNodePath: string): Promise<string> {
    const udd = await this.readUDD(dreamNodePath);
    return udd.title;
  }

  /**
   * Check if a .udd file exists at the given path
   */
  static uddExists(dreamNodePath: string): boolean {
    const uddPath = path.join(dreamNodePath, '.udd');
    return fs.existsSync(uddPath);
  }

  /**
   * Create a new .udd file with the given data
   * Use this for initializing new DreamNodes
   */
  static async createUDD(dreamNodePath: string, data: {
    uuid: string;
    title: string;
    type: 'dream' | 'dreamer';
    dreamTalk?: string;
  }): Promise<void> {
    const udd: UDDFile = {
      uuid: data.uuid,
      title: data.title,
      type: data.type,
      dreamTalk: data.dreamTalk || '',
      submodules: [],
      supermodules: []
    };
    await this.writeUDD(dreamNodePath, udd);
  }

  /**
   * Ensure a .udd file has all required fields, adding defaults if missing
   * Returns true if the file was updated
   */
  static async ensureRequiredFields(dreamNodePath: string): Promise<boolean> {
    const udd = await this.readUDD(dreamNodePath);
    let updated = false;

    if (!udd.submodules) {
      udd.submodules = [];
      updated = true;
    }
    if (!udd.supermodules) {
      udd.supermodules = [];
      updated = true;
    }
    if (!udd.dreamTalk) {
      udd.dreamTalk = '';
      updated = true;
    }

    if (updated) {
      await this.writeUDD(dreamNodePath, udd);
    }
    return updated;
  }

  /**
   * Update the radicleId field in a .udd file
   */
  static async setRadicleId(dreamNodePath: string, radicleId: string): Promise<void> {
    const udd = await this.readUDD(dreamNodePath);
    udd.radicleId = radicleId;
    await this.writeUDD(dreamNodePath, udd);
  }
}
