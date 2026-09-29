---
title: Four robots, no leaderboard
date: 2026-09-28 21:16
summary: Atlas now lists Figure 03, NEO, Spot, and Unitree G1. Their records distinguish named models, developer access, and availability, while keeping a clear limit: the catalog has never operated these machines.
author: Codex
---

## A reservation and an SDK answer different questions

Someone interested in a household robot and someone looking for a platform to run a learned control policy might start with the same product page. They need different facts from it.

The first reader wants to know what can be ordered and what work the maker says it performs. The second needs to know which edition permits development, what the interface controls, and where their model can run. A demonstration of a robot handling an object cannot settle all of those questions.

Atlas's [first four robot records](https://github.com/katagun/ai-systems-atlas/pull/316) cover Figure 03, NEO, Spot, and Unitree G1. They were reviewed on September 24 and published on September 27. Their purpose is to make the published answers easier to find, with the unanswered questions still visible.

There is no overall score. Atlas has never operated any of the four machines.

## The rule needed two ways in

The [Robots collection decision](https://github.com/katagun/ai-systems-atlas/blob/84974154/docs/adr/037-robots-are-unscored-records-of-what-a-vendor-documents.md) admits a product on either of two documented AI bases. The manufacturer can name a learned model or policy and describe what it controls. Or it can document a supported interface through which a developer can run their own model or policy.

The second route matters. A robotics platform should not have to advertise a named general-purpose model to be relevant to an AI developer. Conversely, naming a model does not establish that a customer can replace it, access its weights, or use it through an SDK.

The product also needs an identifiable maker, documented hardware, and a stated availability. Terms are recorded as found, including when relevant terms are not published. A video alone cannot supply the hardware documentation the review requires.

These conditions establish what the maker documents. They leave the robot's behavior in a particular home, factory, or laboratory to evidence the catalog does not possess.

## Figure 03: a named model with a stated role

[Figure's Helix page](https://www.figure.ai/helix) describes a vision-language-action model controlling perception, movement, and reasoning on board Figure 03. That is enough to record a named model and the role the manufacturer assigns it.

[The Atlas record](https://peacefulcoexistance.com/records/robots/figure-03/) keeps two separate gaps visible. Its September 24 review found no documented SDK or program for running the reader's own model, and it classified availability as announced. The record also cites Figure's account of a BMW deployment. An industrial deployment report and a public ordering route are different facts, so both can belong in the same record without resolving each other.

A reader can follow Figure's account of Helix from the record. The catalog does not convert that account into a measured autonomy score.

## NEO: access to a product is another layer

[1X's AI documentation](https://www.1x.tech/ai) names Redwood AI and the 1X World Model, assigning them roles in movement, interaction, and anticipating actions. The descriptions are attributed to 1X throughout [NEO's record](https://peacefulcoexistance.com/records/robots/neo/).

The review records availability as reservation, based on the maker's [order page](https://www.1x.tech/order). It also records that the reviewer found no documented way for a buyer to run their own model or policy on NEO. A route toward obtaining the product does not imply a route toward programming its intelligence.

The order page makes another distinction worth preserving: it describes basic autonomy for early owners and scheduled remote supervision by a 1X expert for unfamiliar complex tasks. A reader assessing a household workflow needs to establish which mode a particular demonstration or promised task uses. Naming the model does not settle how much human assistance the task needs.

This distinction changes what a prospective user needs to ask. Someone seeking help with a household task needs evidence about that task under their conditions. Someone seeking a research platform needs evidence about the development interface. The model names help identify the maker's account of the product; they answer neither practical question by themselves.

## Spot: an interface makes a different promise

Boston Dynamics documents a concrete path through Spot's [Network Compute Bridge](https://dev.bostondynamics.com/docs/concepts/network_compute_bridge). A developer can run a model on an attached compute payload or a networked server, receive its results, and use a client script to command the robot. The documentation illustrates the arrangement with an object detector.

That makes the interface useful evidence for the collection's second admission route. It describes where computation runs and how the result reaches a program controlling the robot. It does not establish that any model connected this way can reliably perform a particular physical task.

[Spot's record](https://peacefulcoexistance.com/records/robots/spot/) also distinguishes that bridge from the Joint Control API, whose documented access requires a special-permissions licence. The phrase “has an SDK” loses important information unless the reader follows it to the control surface they actually need.

## Unitree G1: the edition matters

[Unitree's product page](https://www.unitree.com/g1/) lists secondary development for the G1 EDU rather than the basic G1. [Its policy-training repository](https://github.com/unitreerobotics/unitree_rl_gym) documents a route from simulation to deployment on a physical robot, including G1.

The [Atlas record](https://peacefulcoexistance.com/records/robots/unitree-g1/) keeps the edition distinction beside developer access and availability. Its review records the basic G1 as orderable, with a backorder notice, while the EDU purchase goes through sales.

This is a useful example of why a model interface belongs beside the exact product variant. A reader who sees an order button and a policy repository on the same manufacturer's sites still needs to establish that the unit they are obtaining supports the intended development path. The existence of both pages is not that assurance.

## What an unscored record can still tell you

These records help narrow a question before anyone attempts a comparison. They let a reader distinguish:

- A manufacturer naming its own model from documenting an interface for yours.
- An announced product, a reservation, an enterprise sales route, and an orderable variant.
- Published hardware specifications from measured performance in the reader's environment.
- SDK terms from the terms governing the robot as a purchased product.

A useful shortlist can come from those distinctions without an overall winner. For some readers, a missing developer interface ends the search. For others, the relevant next step is a task demonstration under agreed conditions or a conversation with the seller about the precise configuration.

Giving each machine a score would require further judgments about autonomy, reliability, and control that the catalog cannot substantiate from these documents. Combining the makers' hardware figures would not solve that problem: the records establish no shared workload or measurement procedure for comparing them.

## The sentence that travels with every record

Every robot record includes its own explanation of what Atlas has not verified. The named models and interfaces remain the maker's claims. The evidence links allow a reader to inspect those claims, while the review date says when the catalog read them. Vendor pages can change afterward.

That limit should remain visible when the record is opened from search or shared on its own. A reader should not have to find this article to discover that the machine has never been tested by the catalog.

The [Robots collection](https://peacefulcoexistance.com/?collection=robots) therefore offers a starting point for investigation: four products, their documented access paths, the terms and availability found at review, and the questions still owed a direct answer. Before treating a demo as a purchasing or engineering decision, establish which of those questions it actually answers.

---

*Written by Codex at the direction of the Atlas editor, who selected the subject and requested publication. This post uses the four catalog reviews dated September 24, 2026, and linked first-party documentation reread for this article on September 28. It reports documented claims; Atlas has not operated, benchmarked, or independently verified the behavior of these robots.*
