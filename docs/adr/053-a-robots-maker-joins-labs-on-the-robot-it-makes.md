# ADR 053: A robot's maker joins Labs, on the robot it makes

**Status:** Accepted. Amends [ADR 041](041-labs-are-unscored-records-of-who-develops-the-catalogs-models.md) and [ADR 048](048-a-research-group-may-be-admitted-on-a-system-it-developed.md).

## Context

Robots arrived late and Labs did not follow. Seven robot records name five organizations — Boston Dynamics, Figure AI, 1X Technologies, Hello Robot, and Unitree Robotics — and not one of them is a lab record. That is not because they fail the gate. It is because the gate has nothing they can satisfy.

The three bases each need a record the organization *develops*: a reviewed model release (ADR 041), a reviewed system (ADR 048), or its own published statement that it is building frontier models (ADR 044). A robot maker here has none of the three. Each has hardware, most have their own models, and the catalog reviews neither: Figure's Helix, 1X's Redwood, and Unitree's UnifoLM-X1-0 are policies that act on a robot, which is the boundary the robotics scope decision draws against the Models collection, so the strongest join the catalog holds for all five is a robot.

The cost was real rather than cosmetic. `headquarters` on a lab is the only geography the collection records, and [ADR 052](052-a-lab-records-where-its-work-happens-separately-from-its-headquarters.md) gave a lab a reviewed work location, which the page paints as a circle on the lab's card and on every card that joins to a lab. A robot card with no lab had nothing to inherit, and a reader looking at Unitree's G1 saw a Hangzhou manufacturer's product with no way to reach the organization that built it.

## Decision

Robots join Labs the way every other collection's records do: by name. A robot's `manufacturer` is a catalog name, so it appears in the owning lab's `catalog_names` and is validated against the published robot records exactly as a model's `developer` is validated against published releases. A robot record therefore resolves to at most one lab, and a robot card, its dialog, and the lab's own dialog all cross-link.

`lab_admission_bases` gains a fourth basis, `reviewed_robot`, ordered between `reviewed_system` and `frontier_announcement`. A lab on it has reviewed at least one robot it makes, and no reviewed release or reviewed system of its own. Validation refuses every mismatched direction, as it already does for the other three: a maker with a reviewed release must use `reviewed_release`, a maker with a reviewed system must use `reviewed_system`, and only a maker with a reviewed robot and nothing stronger may use `reviewed_robot`.

`systems` widens by one collection. It still lists ids the catalog curates, and a robot id is now one of them, so the field's meaning is "the records of this organization that are systems the catalog reviews" rather than "the projects.json ids". Validation resolves each entry against both collections and the admission bases read the two apart: a robot never counts as evidence of a reviewed system.

The five robot makers are admitted on this basis in the same change, each reviewed on its own pages: entity, headquarters, type, channels, and evidence, with no score and no ranking, as Labs requires.

## Consequences

- Five organizations enter Labs that were previously invisible in it, and the collection holds 53 records covering the same 316 reviewed releases: none of the five develops a release the catalog reviews, which is the same reason each joins on a robot.
- A hardware maker is now a lab record, which is a real widening and not a renaming. The gate that keeps the collection honest is still the collection's own: an organization is recorded because the catalog curates a record it made, not because it is prominent, funded, or well known. A robot maker with a reviewed release is recorded on that release instead.
- Unitree's UnifoLM-X1-0, Figure's Helix, and 1X's Redwood stay out of Models, and each record says so rather than implying the organization publishes no model. A maker whose model is a language release, or whose action model is reviewed as an open model interface in its own right, is recorded on that release.
- Robot records gain what every other collection's records have: an organization the catalog states they belong to, joinable in both directions. The robot guide's boundary is unchanged — a robot record still says what a vendor documents, never what the robot does — and this ADR adds a join, not a field.
- `manufacturer` becomes a join field, so a robot's manufacturer string is now catalog data that validation checks: renaming it without the lab record changes fails the build, which is the same protection the other organization strings have.
- The card flag row reaches robots, models, and systems through the lab they join to, so a reader sees the same circles on a robot card that the maker's lab card carries, and a record that joins to no lab prints none.
