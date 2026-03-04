-- Fix latency columns to accept decimal values
ALTER TABLE call_records ALTER COLUMN llm_latency_p50 TYPE DECIMAL(10,2);
ALTER TABLE call_records ALTER COLUMN llm_latency_p90 TYPE DECIMAL(10,2);
ALTER TABLE call_records ALTER COLUMN llm_latency_p99 TYPE DECIMAL(10,2);
ALTER TABLE call_records ALTER COLUMN e2e_latency_p50 TYPE DECIMAL(10,2);
ALTER TABLE call_records ALTER COLUMN e2e_latency_p90 TYPE DECIMAL(10,2);
ALTER TABLE call_records ALTER COLUMN e2e_latency_p99 TYPE DECIMAL(10,2);