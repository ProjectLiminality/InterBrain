//! UUID → on-disk path index.
//!
//! Walks every registered vault and reads `.udd` files to build a map from
//! DreamNode UUID to its current location. Used by `git-remote-interbrain` to
//! resolve `interbrain://<uuid>` URLs locally before falling back to peer
//! transport. Supports the case where the same UUID is checked out at more
//! than one location — both are returned, caller picks.

use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

#[derive(Debug, Deserialize)]
struct UddFile {
    uuid: String,
}

#[derive(Debug, Default)]
pub struct UuidIndex {
    /// Many-to-many: a single UUID may exist at multiple paths (sovereign
    /// instance + submodule clone in another DreamNode).
    by_uuid: RwLock<HashMap<String, Vec<PathBuf>>>,
}

impl UuidIndex {
    pub fn new() -> Self {
        Self::default()
    }

    /// Rebuild the index from a list of vault root paths. Idempotent — safe
    /// to call repeatedly. Cheap for hundreds of nodes; would want
    /// incremental updates only if the vault gets very large.
    pub fn rebuild_from_vaults(&self, vault_paths: &[impl AsRef<Path>]) -> Result<()> {
        let mut next: HashMap<String, Vec<PathBuf>> = HashMap::new();
        for vault in vault_paths {
            walk_vault(vault.as_ref(), &mut next);
        }
        let count: usize = next.values().map(|v| v.len()).sum();
        tracing::info!("[uuid-index] indexed {} DreamNode instances across {} vaults", count, vault_paths.len());
        *self.by_uuid.write().unwrap() = next;
        Ok(())
    }

    /// Resolve a UUID. Returns all known paths that hold a DreamNode with
    /// this UUID. Empty vec means we don't have it locally.
    pub fn resolve(&self, uuid: &str) -> Vec<PathBuf> {
        self.by_uuid
            .read()
            .unwrap()
            .get(uuid)
            .cloned()
            .unwrap_or_default()
    }

    /// Pick the best local path for a UUID. Preference order:
    /// 1. Path that lives directly at a vault root (sovereign instance)
    /// 2. First path in arbitrary order
    pub fn resolve_preferred(&self, uuid: &str, vault_paths: &[impl AsRef<Path>]) -> Option<PathBuf> {
        let candidates = self.resolve(uuid);
        if candidates.is_empty() {
            return None;
        }
        for cand in &candidates {
            for vault in vault_paths {
                if cand.parent() == Some(vault.as_ref()) {
                    return Some(cand.clone());
                }
            }
        }
        candidates.into_iter().next()
    }
}

/// Recursively walk a vault directory, reading every `.udd` and recording its
/// containing folder. Skips `.git`, `.obsidian`, `node_modules`, and other
/// hidden / vendored dirs.
fn walk_vault(root: &Path, into: &mut HashMap<String, Vec<PathBuf>>) {
    fn walk(dir: &Path, into: &mut HashMap<String, Vec<PathBuf>>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
            if name == ".udd" && path.is_file() {
                if let Ok(text) = std::fs::read_to_string(&path) {
                    if let Ok(udd) = serde_json::from_str::<UddFile>(&text) {
                        if let Some(parent) = path.parent() {
                            into.entry(udd.uuid).or_default().push(parent.to_path_buf());
                        }
                    }
                }
                continue;
            }
            if !path.is_dir() {
                continue;
            }
            // Skip noise directories.
            if name.starts_with('.') {
                // .git, .obsidian, .DS_Store, etc.
                continue;
            }
            if matches!(name, "node_modules" | "target" | "dist" | "viewer-bundle" | "venv") {
                continue;
            }
            walk(&path, into);
        }
    }
    walk(root, into);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn write_udd(dir: &Path, uuid: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(
            dir.join(".udd"),
            serde_json::json!({ "uuid": uuid, "title": "Test", "type": "dream" }).to_string(),
        )
        .unwrap();
    }

    #[test]
    fn finds_root_level_dreamnode() {
        let tmp = TempDir::new().unwrap();
        write_udd(&tmp.path().join("Foo"), "uuid-1");
        let index = UuidIndex::new();
        index.rebuild_from_vaults(&[tmp.path()]).unwrap();
        assert_eq!(index.resolve("uuid-1").len(), 1);
        assert_eq!(index.resolve("uuid-missing"), Vec::<PathBuf>::new());
    }

    #[test]
    fn finds_nested_dreamnode_and_prefers_root() {
        let tmp = TempDir::new().unwrap();
        write_udd(&tmp.path().join("Parent"), "uuid-parent");
        write_udd(&tmp.path().join("Parent").join("Child"), "uuid-child");
        write_udd(&tmp.path().join("Child"), "uuid-child"); // also at root
        let index = UuidIndex::new();
        index.rebuild_from_vaults(&[tmp.path()]).unwrap();
        let candidates = index.resolve("uuid-child");
        assert_eq!(candidates.len(), 2);
        let preferred = index.resolve_preferred("uuid-child", &[tmp.path()]).unwrap();
        assert_eq!(preferred, tmp.path().join("Child"));
    }
}
