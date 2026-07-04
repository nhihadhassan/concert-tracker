# Baseline Fixtures

These committed fixtures describe the legacy application immediately before the staged rebuild.

- `current-stats.json` captures dashboard totals.
- `current-rankings.json` captures the historical ranked order and both current/planned weighted suggestions.
- `cloud-stats.json` and `cloud-rankings.json` capture the protected Supabase state separately from the local dashboard baseline.
- `field-schema.json` captures legacy fields and conditional requirements.
- `source-comparison.json` records counts, checksums, source drift, private backup location, and cloud-export status.

Raw records, notes, companion names, source files, and browser storage exports stay under ignored `data/backups/`.

The live browser and embedded app data are identical across the compared core fields. The older workbook contains the same 45 concert identities but predates 17 genre updates and 12 Spotify-link updates.

The protected cloud export contains 46 concerts. It includes every browser identity plus J Cole on July 28, 2026. ASAP Rocky on May 31, 2026, and Don Toliver on June 5, 2026, have newer cloud status and review data. Supabase is authoritative for these migration conflicts.
