# DreamNode: TEMPLATE_TITLE_PLACEHOLDER

This is a DreamNode - a git repository representing a thought-form or person in the **InterBrain** knowledge management system.

## Universal Dream Description (UDD)

The `.udd` file contains the essential metadata for this DreamNode:

```json
{
  "uuid": "Unique identifier (constant)",
  "title": "Display name/title", 
  "type": "dream or dreamer",
  "dreamTalk": "Path to symbolic representation",
  "liminalWebRelationships": ["Connected DreamNode UUIDs"],
  "submodules": ["Child DreamNode UUIDs"],
  "supermodules": ["Parent DreamNode UUIDs"]
}
```

## Relationships

### Liminal Web (Horizontal)
- **Dreams** connect to **Dreamers** who hold them
- **Dreamers** connect to **Dreams** they carry
- Forms the social fabric of shared knowledge

### Holonic Structure (Vertical)  
- **Submodules**: Ideas that are part of this idea
- **Supermodules**: Larger ideas this idea participates in
- Enables fractal knowledge organization

## Coherence Beacons

This DreamNode includes git hooks that maintain relationship coherence:

- **pre-commit**: Integrates external references as submodules
- **post-commit**: Updates bidirectional relationship tracking

Changes propagate through the peer-to-peer network via **Radicle**.

## License

This DreamNode is shared under the **GNU Affero General Public License v3.0** - a strong copyleft license ensuring this knowledge remains free and open for all.

## InterBrain

Part of the **InterBrain** project: transcending personal knowledge management toward collective knowledge gardening.

- **Repository**: https://github.com/ProjectLiminality/InterBrain
- **Vision**: Building DreamOS - a decentralized operating system for collective sensemaking