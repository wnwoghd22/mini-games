//! `*.dialogue.txt` parser (see FORMAT.md), mirrored by `editor/media/dialogue.ts`.
//!
//! ```text
//! [elder.1] elder
//! The council has spoken.
//! The old bell is failing.
//! ```

use bevy::{platform::collections::HashMap, prelude::*};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Line {
    pub speaker: String,
    pub text: String,
}

#[derive(Asset, TypePath, Debug, Default, Clone)]
pub struct Dialogue {
    pub lines: HashMap<String, Line>,
    pub warnings: Vec<String>,
}

impl Dialogue {
    pub fn parse(source: &str) -> Self {
        let mut out = Self::default();
        let mut current: Option<(String, String, Vec<String>)> = None;
        for raw in source.lines() {
            let line = raw.trim_end();
            if line.starts_with('#') {
                continue;
            }
            if let Some((id, speaker)) = parse_header(line) {
                out.flush(&mut current);
                current = Some((id, speaker, Vec::new()));
            } else if line.is_empty() {
                out.flush(&mut current);
            } else if let Some((_, _, body)) = current.as_mut() {
                body.push(line.to_string());
            } else {
                out.warnings
                    .push(format!("text outside of any [id] block: {line}"));
            }
        }
        out.flush(&mut current);
        out
    }

    fn flush(&mut self, current: &mut Option<(String, String, Vec<String>)>) {
        if let Some((id, speaker, body)) = current.take() {
            if self.lines.contains_key(&id) {
                self.warnings
                    .push(format!("duplicate id {id}; later one wins"));
            }
            self.lines.insert(
                id,
                Line {
                    speaker,
                    text: body.join("
").trim().to_string(),
                },
            );
        }
    }

    pub fn text(&self, id: &str) -> Option<&str> {
        self.lines.get(id).map(|l| l.text.as_str())
    }
}

/// `[id] speaker` → (id, speaker). The id allows letters, digits, `_` and `.`.
fn parse_header(line: &str) -> Option<(String, String)> {
    let rest = line.strip_prefix('[')?;
    let end = rest.find(']')?;
    let id = &rest[..end];
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
    {
        return None;
    }
    Some((id.to_string(), rest[end + 1..].trim().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_headers_bodies_comments_and_duplicates() {
        let src = "# c\n[elder.1] elder\nThe council has spoken.\nThe old bell is failing.\n\n[me.1]\nhm\n\n[me.1] me\nagain\n";
        let d = Dialogue::parse(src);
        assert_eq!(
            d.text("elder.1"),
            Some("The council has spoken.\nThe old bell is failing.")
        );
        assert_eq!(d.lines["elder.1"].speaker, "elder");
        assert_eq!(d.text("me.1"), Some("again"));
        assert_eq!(d.warnings.len(), 1);
        assert_eq!(d.text("missing"), None);
    }
}
