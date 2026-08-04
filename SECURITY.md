# Security Policy

## Supported versions

DiagramWeave has not published a stable release. Security fixes apply to the default branch until a supported-version table is introduced.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub Security Advisories for this repository. Do not include credentials, proprietary diagrams, or customer source files in public issues.

## Security boundaries

- AI providers receive only explicitly selected context.
- Provider tokens are supplied by the host and are never persisted by DiagramWeave packages.
- Edit proposals are untrusted until local schema, revision, range, and policy validation succeeds.
- Future PlantUML rendering must default to a network- and file-closed sandbox.
