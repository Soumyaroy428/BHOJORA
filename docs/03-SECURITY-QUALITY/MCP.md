# Model Context Protocol (MCP) Policy

## 1. Purpose

MCP may be used by authorized internal AI agents to access narrowly
scoped tools and resources. It is not required for the core customer
ordering experience.

## 2. Approved use cases

-   Read-only product documentation lookup
-   Read-only operational analytics summaries
-   Drafting support responses for human approval
-   Inspection report summarization for authorized reviewers
-   Controlled developer tooling in non-production environments

## 3. Prohibited by default

-   AI agent directly approving kitchen inspection
-   AI agent changing safety score or status
-   AI agent issuing refunds or payouts without explicit authorized
    workflow
-   AI agent reading unrestricted customer PII or private evidence
-   Unreviewed production database writes
-   Exposing admin tools to public users
-   Storing secrets in prompts or MCP resources

## 4. Tool design

-   Least-privilege tool scopes
-   Explicit user/agent identity
-   Resource-level authorization on every call
-   Input/output schemas and validation
-   Audit log with request ID and purpose
-   Read-only by default
-   Human confirmation for consequential writes
-   Rate limits, timeouts and output size limits
-   Tool allowlist and versioning

## 5. Security

Treat tool output as untrusted data. Defend against prompt injection in
restaurant descriptions, uploaded reports, reviews and external web
content. Never let retrieved text override system policies. Redact
sensitive fields.

## 6. Environment

Use mock data in development. Staging access requires approval.
Production access must be separately authorized, monitored and
revocable.

## 7. Testing

Test tool authorization, malicious document content, cross-tenant
access, data leakage, tool timeout, replay, audit completeness and human
approval gates.
