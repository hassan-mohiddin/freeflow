# Spec Shapes

Read this when choosing the structure of a spec-like artifact. These are composable shapes, not mandatory templates. Use only the sections the artifact needs for its intended use.

## Product Spec Or PRD

Use for a product, capability, workflow, or user-facing outcome.

Possible sections:

- problem and motivation;
- intended outcome;
- users or actors;
- scope and non-goals;
- user journeys or observable behavior;
- requirements and constraints;
- product, policy, or domain decisions;
- edge and failure behavior;
- acceptance criteria;
- unresolved questions and source evidence.

Do not turn a PRD into an implementation task list.

## Issue Or Problem Specification

Use when a durable issue must define a problem clearly enough to investigate, fix, or accept.

Possible sections:

- observed problem or requested change;
- affected behavior and users;
- current evidence, reproduction, or examples;
- expected behavior;
- scope and non-goals;
- severity, constraints, and known impact;
- acceptance criteria;
- unresolved facts or owner decisions.

Do not present a guessed cause or requested patch as established fact. A fix sequence belongs in a Plan after the cause and path are sufficiently understood.

## Requirements Or Behavioral Specification

Use when observable behavior and constraints matter more than implementation structure.

Possible sections:

- actors and preconditions;
- required behavior and invariants;
- inputs, outputs, states, and transitions;
- errors, rejection, degradation, and recovery;
- forbidden outcomes;
- compatibility and data guarantees;
- acceptance examples and evidence.

Express behavior precisely without copying implementation logic into the contract.

## Technical Design

Use when the artifact must define an accepted technical direction in depth.

Possible sections:

- problem and current evidence;
- goals and non-goals;
- proposed architecture or design;
- module, interface, state, and ownership boundaries;
- data flow and persistence;
- failure contract and recovery;
- security, privacy, performance, and operational constraints;
- alternatives and rationale;
- compatibility or migration impact;
- risks, validation, and unresolved design questions.

A technical design may contain implementation detail when that detail defines the accepted design. Ordered phases and execution slices still belong in a Plan.

## API, Protocol, Or Interface Contract

Use for a public or internal interface that callers will depend on.

Possible sections:

- interface, endpoint, command, event, or protocol name;
- callers, roles, authentication, and permissions;
- requests, inputs, responses, outputs, and schemas;
- invariants and ordering;
- errors and failure semantics;
- idempotency, retries, versioning, and compatibility;
- privacy, billing, data-safety, and operational constraints;
- examples and acceptance evidence.

Stop rather than inventing caller-visible behavior or compatibility promises.

## Migration Contract

Use when current and target states, compatibility, and safety obligations must be durable before execution is planned.

Possible sections:

- current and target contracts;
- affected consumers, data, traffic, or configuration;
- compatibility and support commitments;
- data and state invariants;
- cutover, rollback, or forward-recovery requirements;
- observation and removal conditions;
- consequential failure behavior;
- acceptance and completion evidence;
- decisions still required.

Include ordering only when it is part of the accepted migration contract. Detailed execution phases belong in a migration or implementation Plan.

## Decision Artifact

Use when a durable choice and its rationale are the artifact's primary job. Read [decision records](decision-records.md) before choosing a task-local decision note, durable decision record, or ADR.

Possible sections:

- context and decision question;
- decision and owner;
- materially different alternatives;
- rationale and evidence;
- consequences and constraints;
- revisit or supersession conditions.

## Combine Carefully

An artifact may combine shapes when it genuinely owns both jobs, such as a technical design containing an API contract. Keep each responsibility legible.

Do not create an omnibus artifact merely to avoid links. Separate artifacts when they have different owners, statuses, audiences, lifecycles, or review boundaries.
