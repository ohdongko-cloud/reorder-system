-- ============================================================
--  MI 리오더 점검 — Neon PostgreSQL 스키마
--  Neon SQL Editor에서 전체 선택 후 실행하세요.
-- ============================================================

CREATE TABLE IF NOT EXISTS reorder_sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  base_date  text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS styles (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid        NOT NULL REFERENCES reorder_sessions(id) ON DELETE CASCADE,
  code               text        NOT NULL,
  type               text        NOT NULL DEFAULT 'normal',
  price              integer     NOT NULL DEFAULT 0,
  days_since_inbound integer     NOT NULL DEFAULT 0,
  stores             integer     NOT NULL DEFAULT 1,
  plc                text        NOT NULL DEFAULT '도입기',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS colors (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id   uuid         NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  color_name text         NOT NULL,
  color_hex  text,
  k          integer      NOT NULL DEFAULT 0,
  l          integer      NOT NULL DEFAULT 0,
  m          integer      NOT NULL DEFAULT 0,
  n          integer      NOT NULL DEFAULT 0,
  r          numeric(6,2) NOT NULL DEFAULT 5,
  s          numeric(6,2) NOT NULL DEFAULT 8,
  t          numeric(6,2) NOT NULL DEFAULT 1.0,
  aj         integer      NOT NULL DEFAULT 0,
  created_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_styles_session ON styles(session_id);
CREATE INDEX IF NOT EXISTS idx_colors_style   ON colors(style_id);
