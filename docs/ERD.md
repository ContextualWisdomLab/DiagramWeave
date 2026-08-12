# DiagramWeave Conceptual Domain and ERD

**Status:** Accepted conceptual model. Protected main has no DiagramWeave-owned database.
**Last reviewed:** 2026-08-09

This document models durable product concepts without inventing persistence. Current packages keep source/session data in process or caller-owned files. A future Studio/service persistence layer requires its own physical ERD, migration, tenant, lifecycle, backup, and authorization evidence.

## Current conceptual model

```mermaid
erDiagram
    DIAGRAM_DOCUMENT ||--o{ SOURCE_REVISION : has
    SOURCE_REVISION ||--o{ EDIT_PROPOSAL : proposed_against
    EDIT_PROPOSAL ||--o| PROPOSAL_PREVIEW : previews
    SOURCE_REVISION ||--o{ RENDER_ARTIFACT : renders
    SOURCE_REVISION ||--o{ DIAGNOSTIC_RECORD : diagnoses
    SOURCE_REVISION ||--o{ SYMBOL_RECORD : contains
    SYMBOL_RECORD ||--o{ SYMBOL_RECORD : owns
    SYMBOL_RECORD ||--o{ EDITOR_LOCATION : projects_to
    LSP_SESSION ||--o{ DOCUMENT_SNAPSHOT : accepts
    DIAGRAM_DOCUMENT ||--o{ DOCUMENT_SNAPSHOT : represented_by
    DOCUMENT_SNAPSHOT ||--o{ SYMBOL_RECORD : derives

    DIAGRAM_DOCUMENT {
      string document_id
      string host_uri
    }

    SOURCE_REVISION {
      string source_sha256
      string source_text
      integer utf16_length
    }

    EDIT_PROPOSAL {
      string proposal_id
      string document_id
      string base_revision_hash
      string operation_type
      range requested_scope
      range effective_scope
      string replacement
      string summary
      list assumptions
    }

    PROPOSAL_PREVIEW {
      string before_hash
      string after_hash
      boolean scope_expanded
      string next_source
    }

    RENDER_ARTIFACT {
      string source_revision_hash
      string format_code
      string bounded_artifact
    }

    DIAGNOSTIC_RECORD {
      range utf16_range
      integer severity_code
      string diagnostic_code
      string fixed_message
      integer plantuml_line_number
    }

    SYMBOL_RECORD {
      string symbol_kind
      string display_name
      range enclosing_range
      range selection_range
    }

    EDITOR_LOCATION {
      string local_uri
      range target_range
    }

    LSP_SESSION {
      string lifecycle_state
      object client_capabilities
    }

    DOCUMENT_SNAPSHOT {
      string local_uri
      integer document_version
      integer generation
      string accepted_source
    }
```

These are documentation concepts. Runtime implementations may use immutable JavaScript objects rather than these exact class names.

## Host ownership

```mermaid
flowchart LR
    FILE[(Host/source file)]
    HOST[Studio / IDE / naruon / CLI host]
    DW[DiagramWeave packages]
    CACHE[(Optional host cache/persistence)]

    FILE --> HOST
    HOST --> DW
    DW --> HOST
    HOST --> FILE
    HOST -. optional .-> CACHE
```

DiagramWeave foundation packages do not own:

- user/account/tenant tables;
- file history or cloud document storage;
- credential/keychain persistence;
- telemetry database;
- provider conversation/history store;
- renderer artifact store;
- distributed collaboration state.

A future host can own those, but must use public package contracts rather than treating private package state as stable persistence IDs.

## Identity domains

- `document_id`: caller/host product identity; not authorization by itself.
- `source_sha256`: immutable source revision identity; not a tenant/user key.
- `proposal_id`: proposal identity; must bind to `document_id` and `base_revision_hash`.
- URI: LSP/source locator owned and validated by the host/session boundary.
- document version/generation: stale-state concurrency metadata, not durable global chronology.

These identities must not be conflated.

## Future Studio persistence — conceptual only

If Studio adds cloud/local project persistence, likely conceptual entities include `workspace_record`, `diagram_document`, `source_revision`, `proposal_record`, `render_artifact`, `user_preference`, `provider_configuration`, and `audit_event`. They are not current database objects.

A future physical ERD must explicitly model tenant/workspace ownership, encrypted credential handles rather than secrets, revision ancestry, retention/export, collaboration/concurrency, artifact provenance, and audit/system time.

## Persistence acceptance rule

Before any conceptual entity becomes a DiagramWeave-owned persisted object, the implementing change must add an Accepted ADR, physical ERD/migrations/rollback, authorization/tenant model, concurrency/idempotency behavior, backup/recovery, privacy/retention/export controls, and integration tests. This document then updates the affected entity from conceptual to as-built.
