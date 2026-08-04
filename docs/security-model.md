# DiagramWeave Security Model

## Security objective

DiagramWeave lets users benefit from model-assisted editing without surrendering control of source files, credentials, network access, or renderer permissions. Every boundary assumes that source text, diagram labels, comments, include directives, model output, raw renderer diagnostics, and remote responses may be hostile.

## Assets

- diagram source and local workspace paths;
- architecture, network, security, and business information contained in diagrams;
- Contextual Orchestrator bearer tokens and upstream provider credentials;
- accepted source revisions and review history;
- rendered artifacts;
- source locations and diagnostic metadata;
- organization policy, templates, and allowlists.

## Trust boundaries

### Manual editing boundary

Manual editing is local and works without an LLM. A host must never require model availability to open, edit, save, validate, or recover source text. Hidden editor state cannot silently replace the file as the source of truth.

### Model context boundary

Source content is **untrusted data**. Comments, labels, stereotypes, macros, and included text cannot change system instructions or authorize tools. The adapter:

- accepts only an explicit source string supplied by the host;
- limits source to 262,144 UTF-16 code units;
- limits instructions to 8,192 characters;
- sends no files, directories, environment variables, or credentials automatically;
- emits a two-message contract that labels source content as untrusted;
- requires strict assistant JSON before Core validation.

A future Context Inspector must show users the exact files, ranges, character counts, and metadata leaving the device.

### Proposal boundary

Model output is never executable and never authoritative. Core validates:

- fixed `schemaVersion`;
- bounded identifiers and text;
- lowercase SHA-256 base revision;
- supported operation type;
- requested and effective source ranges;
- replacement size;
- summary and assumptions;
- scope-expansion reason.

A stale proposal fails with `revision_conflict`. An expanded proposal fails with `scope_expansion_required` unless the host explicitly approves it. Applying a proposal returns a new string; it does not save, commit, push, execute, or render anything.

### Contextual Orchestrator transport boundary

The adapter permits:

- HTTPS endpoints for remote deployments;
- HTTP only for `localhost`, `127.0.0.1`, and `[::1]` development endpoints.

It rejects URL credentials, query strings, fragments, unsupported protocols, control characters in bearer tokens, unbounded timeouts, and non-callable fetch implementations. It does not read provider error bodies, preventing secret or prompt reflection into user-visible errors. The package does not read environment variables or persist tokens.

Contextual Orchestrator remains responsible for its provider-host egress checks, credential registry, authentication, routing, budget, and verifier policy. DiagramWeave does not bypass those controls by calling providers directly through this adapter.

### PlantUML renderer boundary

The local renderer package runs PlantUML with `SANDBOX` as a fixed profile. It requires absolute Java and JAR paths, invokes no shell, receives source only through stdin, passes an empty environment, and disables generated source metadata.

The implemented boundary enforces:

- no remote or local include mode;
- no source or output temporary files;
- UTF-8 source-size limits;
- independent stdout and stderr limits;
- a wall-clock deadline and forced termination;
- SVG/PNG structure validation;
- source-free public errors;
- immutable artifacts tied to the SHA-256 source revision.

The foundation does not yet impose an operating-system cgroup, job-object, or container memory/CPU quota. Hosts that process hostile or high-volume diagrams must add an outer process sandbox and resource controller. PlantUML allowlist modes are not equivalent to `SANDBOX`; an include-capable mode requires a separate explicit security design and administrator policy.

Rendered SVG remains untrusted active content. Studio and embedding hosts must not inject it through `innerHTML`; they must use a constrained image boundary or independently reviewed SVG sanitization and Content Security Policy. PNG output is likewise untrusted binary input to the platform image decoder.

### Structured diagnostic boundary

PlantUML stderr is bounded but remains untrusted. The renderer never returns raw stderr, a raw PlantUML `label`, an unstructured suffix line, a source excerpt, an absolute workspace parent, a Java path, a JAR path, or an environment value.

`parsePlantUmlStandardReport` recognizes only the documented protocol version, status, and line-number fields. It maps a valid one-based PlantUML line to a zero-based, zero-width Language Server Protocol range and publishes only:

- severity `1`;
- code `plantuml.syntax`;
- source `plantuml`;
- fixed message `PlantUML reported a syntax error.`;
- bounded integer positions and `data.plantUmlLineNumber`.

Malformed known fields, invalid UTF-8, unsupported protocol versions, and missing locations fail closed. An error without a valid line remains an error but carries no fabricated range.

`sanitizePlantUmlDiagnostics` bounds the collection, validates the exact record, clones every nested object, and deeply freezes the result. `PlantUmlRendererError` invokes that sanitizer before exposure. The CLI invokes it again before publication, isolating hostile getters, Proxy objects, arbitrary thrown errors, and caller mutation.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| Prompt injection in comments or labels | System message treats all source as data; no tools; strict JSON and Core validation |
| Stale AI edit overwrites manual work | Exact SHA-256 base revision and fail-closed conflict |
| AI edits more than requested | Requested/effective ranges, expansion reason, explicit approval |
| Malformed or oversized output | Bounded fields and strict parse/validation |
| Raw stderr or label reflects private source | Parser ignores raw labels and narrative text; only fixed diagnostic values cross the boundary |
| Hostile diagnostic object mutates reports | Exact-schema sanitizer, bounded array, deep clone, deep freeze, getter isolation |
| Credential leakage in errors | No package logging, no response-body reads on HTTP errors, token-free messages |
| Plaintext remote interception | Remote HTTPS only; HTTP restricted to loopback |
| SSRF through orchestrator endpoint | Adapter URL policy plus Contextual Orchestrator egress controls |
| Renderer reads local files or URLs | Fixed PlantUML `SANDBOX`; no include mode in this package |
| Renderer denial of service | Separate child, byte caps, deadline, kill; host-level CPU/memory sandbox for hostile scale |
| Hidden automatic mutation | Core returns values only; approval and write action are separate |
| Supply-chain replacement | Lockfile, immutable Action SHAs, review and exact-head checks |

## Logging and telemetry

Foundation packages emit no logs or telemetry. A host adding observability excludes source, prompts, assistant content, bearer tokens, raw renderer diagnostics, file paths, and rendered images by default. Safe measurements include operation name, duration, bounded size bucket, error code, diagnostic code, provider identifier, and non-reversible revision hashes. Enterprise deployments must support full telemetry disablement.

## Secret handling

- The adapter accepts an operator-supplied token in memory.
- It does not load `.env`, process environment variables, keychains, or files.
- Studio or another host retrieves secrets from an OS keychain or managed secret store.
- Tokens never belong in a base URL, query string, workflow input, command line, repository file, trace, or crash report.
- Contextual Orchestrator provider credentials remain in its KV credential registry.

## Supply-chain policy

- GitHub Actions are pinned to immutable commit SHAs.
- npm workspace metadata is lockfile-backed.
- CI runs syntax, behavior, 100% line/branch/function coverage, and production JSDoc gates.
- Autonomous tasks cannot merge, publish, release, or weaken branch protection.
- Releases require dependency, secret, SAST, package-content, license, provenance, and rollback evidence.

## Vulnerability reporting

Report suspected vulnerabilities according to `SECURITY.md`. Never disclose a live exploit, token, private diagram, customer source, or raw diagnostic in a public issue.
