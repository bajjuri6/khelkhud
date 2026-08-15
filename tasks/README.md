# tasks/

In-flight work plans. One markdown file per substantive task — name it
`<kebab-case-description>.md`.

The pattern (borrowed from the sibling Kautilya repos) is to write a plan upfront, work
against it, then leave the file behind as a review record. Worth it for multi-session work,
or anything where the rationale matters more than it would fit in a commit message.

For trivial single-session work that fits cleanly in commits, skip the file — `git log
--oneline` carries the same load.

`artifacts/` holds generated or extracted output a plan refers to — verification runs, raw
data pulls, schema dumps. Date-prefix them: `2026-08-15-<what>.md`.
