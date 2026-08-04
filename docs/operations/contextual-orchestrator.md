# Operating DiagramWeave with Contextual Orchestrator

## Scope

`@contextualwisdomlab/diagramweave-contextual-orchestrator` is the default remote LLM adapter for DiagramWeave. It calls Contextual Orchestrator's OpenAI-compatible `POST /v1/chat/completions` endpoint and returns only proposals that pass DiagramWeave Core validation.

The adapter does not install, start, configure, or administer Contextual Orchestrator. Operators own that service, its model pool, provider credentials, access policy, budgets, logs, and availability.

## Transport policy

- Use **HTTPS** for every remote or shared deployment.
- **Loopback HTTP** is accepted only for `localhost`, `127.0.0.1`, or `[::1]` development instances.
- Base URLs cannot contain credentials, query strings, or fragments.
- A path prefix is supported. `https://gateway.example/diagramweave` resolves to `https://gateway.example/diagramweave/v1/chat/completions`.

## Host integration

```js
import {
  createContextualOrchestratorClient,
} from '@contextualwisdomlab/diagramweave-contextual-orchestrator';

const client = createContextualOrchestratorClient({
  baseUrl: 'https://orchestrator.example.com',
  token: await hostKeychain.read('diagramweave_orchestrator_token'),
  model: 'contextual-orchestrator',
  timeoutMs: 30_000,
});

const proposal = await client.requestEditProposal({
  documentId: 'diagram_document_alpha',
  source: '@startuml\nAlice -> Bob: hello\n@enduml\n',
  operationType: 'modify_selection',
  requestedScope: { start: 24, end: 29 },
  instruction: 'Change the selected message label to goodbye.',
});
```

The host shows a diff and invokes DiagramWeave Core preview/application separately. Receiving `proposal` does not modify a document.

## Request contract

The adapter sends:

```json
{
  "model": "contextual-orchestrator",
  "messages": [
    { "role": "system", "content": "bounded DiagramWeave proposal contract" },
    { "role": "user", "content": "JSON-encoded source and request" }
  ],
  "temperature": 0,
  "stream": false
}
```

The user message contains task identifier, proposal schema version, document identifier, exact source revision, operation type, requested range, bounded instruction, and exact source. No provider credential, local file path, workspace inventory, environment variable, or hidden editor state is added.

## Expected assistant output

The assistant returns one JSON object matching `EditProposal`. Raw JSON and one complete JSON code fence are accepted. Prose before or after JSON, tool-call text, multiple objects, malformed JSON, and invalid proposal fields are rejected.

Contextual Orchestrator may internally route to one model or conduct a bounded multi-model workflow. DiagramWeave relies on the published API contract, not a particular worker model.

## Error handling

| Code | Meaning | Host action |
|---|---|---|
| `invalid_client_options` | Unsafe endpoint, token, model, timeout, or fetch boundary | Correct configuration; no automatic retry |
| `invalid_request` | Source, instruction, operation, or range violates contract | Correct local request |
| `provider_timeout` | Deadline elapsed | Offer explicit retry or manual editing |
| `provider_unavailable` | Network or transport failed | Check service and network |
| `provider_http_error` | Non-success HTTP status | Inspect authorization and server logs without exposing body |
| `provider_response_invalid` | Unexpected JSON or chat response shape | Check gateway compatibility |
| `assistant_json_invalid` | Assistant content is not strict JSON | Review orchestration policy or continue manually |
| `invalid_edit_proposal` | Parsed output violates Core schema | Treat as untrusted model failure |
| `revision_conflict` | Proposal targets another source revision | Regenerate against current source |
| `scope_expansion_required` | Edit exceeds requested range | Show reason and request approval |

Hosts branch on `error.code`, preserve source, and avoid displaying raw provider bodies or credentials.

## Readiness and health

Before routing user work, operators verify Contextual Orchestrator's health and authenticated API path according to its operations documentation. A health response does not prove every upstream model is configured, in budget, or available; production routing needs model-pool, credential, egress, quota, and latency evidence.

## Authentication

DiagramWeave receives a bearer token from its host. The host retrieves it from an OS keychain, enterprise secret manager, or equivalent store. The adapter intentionally does not read environment variables so an embedding product controls secret lifecycle.

Contextual Orchestrator upstream provider secrets belong in its KV credential registry. Do not copy provider API keys into DiagramWeave.

## Timeouts and retries

The adapter enforces one request deadline from 10 milliseconds to 120 seconds; default is 30 seconds. It performs no automatic retry because retries may duplicate expensive orchestrated work. The host may offer an explicit retry after distinguishing timeout from availability failure. Contextual Orchestrator owns provider retry, failover, and circuit-breaker behavior.

## Privacy checklist

1. Identify service owner and processing region.
2. Document provider retention and training policy.
3. Configure access control and audit without source-body logging.
4. Show users exact source context leaving the device.
5. Support redaction and local-only manual mode.
6. Verify incident response and credential revocation.
7. Test that errors and telemetry omit source and tokens.

## Troubleshooting

### `invalid_client_options`

Confirm the base URL is absolute. Remote HTTP, URL credentials, query strings, fragments, controls, and unbounded values are rejected.

### `provider_http_error`

Confirm authorization and endpoint routing. The adapter intentionally does not read response bodies. Use server-side logs with source-body redaction.

### `provider_response_invalid`

Confirm the endpoint implements `choices[0].message.content` as a string.

### `assistant_json_invalid`

Review orchestration prompts and worker behavior. The adapter will not extract JSON from surrounding prose because that weakens the trust boundary.
