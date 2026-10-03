# History

Dated reviews and re-reads whose findings have landed. Each is a point-in-time record: it
is kept for what it found and the evidence it pinned, never as current policy. Where a
finding is still open, `BACKLOG.md` carries it in its own words; where it is closed, Git
history is the completion record.

Nothing here is linted or reformatted. A frozen retrospective that a formatter rewrites
reads as a document someone edited after its review, which is the one thing it is not.

| Document | What it settled |
|---|---|
| [`CODEBASE_REVIEW_2026-09-05.md`](CODEBASE_REVIEW_2026-09-05.md) | The first engineering-debt pass, CR-01 through CR-08. CR-05 through CR-08 remain open and are tracked in `BACKLOG.md`; CR-08 was superseded by CR-13 in [`CODEBASE_REVIEW_2026-09-28.md`](CODEBASE_REVIEW_2026-09-28.md), and CR-13 is the one that holds the 3.12 floor. |
| [`ADVERSARIAL_REVIEW_2026-09-23.md`](ADVERSARIAL_REVIEW_2026-09-23.md) | An adversarial pass over the guard model the unattended routines rely on; its routes are the ones the threat model in [`OPERATIONS.md`](../OPERATIONS.md) still discusses as closed or open. |
| [`LAB_REREAD_2026-09-25.md`](LAB_REREAD_2026-09-25.md) | A re-read of every cited lab page, after the first lab batches were written from search-engine extracts. Its corrections landed in four batches; [`lab-reread-2026-09-25/`](lab-reread-2026-09-25/) holds the source index, the reviewer brief, and the 117 findings. |

The two reviews still cited as open-finding sources stay with the live documents rather than
coming here: [`CODEBASE_REVIEW_2026-09-28.md`](CODEBASE_REVIEW_2026-09-28.md) is the
engineering-debt source of record that `BACKLOG.md` cites by CR number, and
[`BADGE_REVIEW_2026-09-29.md`](BADGE_REVIEW_2026-09-29.md) is the badge contract's
evidence, which [`WEB.md`](../WEB.md) and [ADR 047](../adr/047-badges-identify-record-facts-and-licensing-stays-scoped-text.md) both link.
