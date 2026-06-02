-- Phase A.1: Enable extensions needed by hadith-search.
-- pgvector >= 0.7.0 provides halfvec (half-precision 1024-d vectors, 2x storage savings).
-- pg_trgm is used for narrator-substring filtering via ILIKE on englishText.
create extension if not exists vector;
create extension if not exists pg_trgm;
-- pgcrypto: gen_random_uuid() default on feedback.id. (Built into core on PG13+,
-- but kept explicit so a fresh reset doesn't depend on the server version.)
create extension if not exists pgcrypto;
