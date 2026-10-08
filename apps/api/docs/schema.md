# Schema and Erflow reference

Detailed instructions and reference material now live directly in the [owning AGENTS.md](../AGENTS.md). Update that guide when behavior changes.

## Data model (Erflow)

[Read this section in AGENTS.md](../AGENTS.md#data-model-erflow).

### Required workflow after any schema change

[Read this section in AGENTS.md](../AGENTS.md#required-workflow-after-any-schema-change).

### Organization hub

[Read this section in AGENTS.md](../AGENTS.md#organization-hub).

### Schema (current)

[Read this section in AGENTS.md](../AGENTS.md#schema-current).

### Human CRM call additions

[Current behavior and schema workflow](../AGENTS.md#human-crm-calling); [additive Erflow schema delta](human-call-schema.dbml). Canonical synchronization is outstanding and was explicitly deferred for this change by the user on 2026-10-07.

### Shared TTS cache additions

[Current behavior and limits](../AGENTS.md#shared-tts-cache); [additive canonical schema delta](tts-cache-schema.dbml). Local isolated schema verification does not replace the required Erflow read/update/refetch workflow. On 2026-10-08 the user explicitly deferred Erflow for this TTS cache release and authorized deployment with caching off. Canonical synchronization remains outstanding; this exception does not waive future schema work.

Persisted speech-caching policy adds two nullable boolean columns to existing agent tables: [column-only canonical delta](tts-cache-policy-schema.dbml). Merge these into the existing canonical tables; the partial DBML declarations do not replace their other columns. The explicit 2026-10-08 release deferral covers both policy columns and shared storage.

### WhatsApp harness schema

[Read this section in AGENTS.md](../AGENTS.md#whatsapp-harness-schema).

### CRM provider and schema evolution

[Read this section in AGENTS.md](../AGENTS.md#crm-provider-and-schema-evolution).
