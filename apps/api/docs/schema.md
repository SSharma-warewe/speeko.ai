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

### Human call workspace additions

[Current behavior](../AGENTS.md#human-call-workspace); [additive SQL](human-call-workspace-schema.sql); [column-only DBML](human-call-workspace-schema.dbml). Adds `human_call_sessions.workspace` JSONB with an empty-object default. Apply before the API with synchronization disabled. Canonical Erflow read/update/refetch is outstanding because access was unavailable. On 2026-10-08 the user explicitly selected “Defer Erflow for this release and deploy”; this exception does not waive future schema changes.

### Shared TTS cache additions

[Current behavior and limits](../AGENTS.md#shared-tts-cache); [additive canonical schema delta](tts-cache-schema.dbml). Local isolated schema verification does not replace the required Erflow read/update/refetch workflow. On 2026-10-08 the user explicitly deferred Erflow for this TTS cache release and authorized deployment with caching off. Canonical synchronization remains outstanding; this exception does not waive future schema work.

Persisted speech-caching policy adds two nullable boolean columns to existing agent tables: [column-only canonical delta](tts-cache-policy-schema.dbml). Merge these into the existing canonical tables; the partial DBML declarations do not replace their other columns. The explicit 2026-10-08 release deferral covers both policy columns and shared storage.

### Prepared-sentence policy additions

[Current behavior](../AGENTS.md#prepared-sentences); [column-only DBML delta](tts-prepared-speech-schema.dbml); [additive SQL](tts-prepared-speech-schema.sql). Add nullable `tts_prepared_speech_enabled` to `agents` and `organization_agents`, default null. Canonical Erflow synchronization remains required before rollout; the earlier TTS release deferral does not cover this change.

### WhatsApp harness schema

[Read this section in AGENTS.md](../AGENTS.md#whatsapp-harness-schema).

### CRM provider and schema evolution

[Read this section in AGENTS.md](../AGENTS.md#crm-provider-and-schema-evolution).
