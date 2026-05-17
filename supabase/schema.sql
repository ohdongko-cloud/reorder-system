-- ============================================================
--  MI 리오더 점검 — Supabase 스키마
--  Supabase SQL Editor에서 전체 선택 후 실행하세요.
-- ============================================================

-- ── 1. 테이블 생성 ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reorder_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  base_date   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS styles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES reorder_sessions(id) ON DELETE CASCADE,
  code               text NOT NULL,
  type               text NOT NULL DEFAULT 'normal',
  price              integer NOT NULL DEFAULT 0,
  days_since_inbound integer NOT NULL DEFAULT 0,
  stores             integer NOT NULL DEFAULT 1,
  plc                text NOT NULL DEFAULT '도입기',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS colors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id    uuid NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  color_name  text NOT NULL,
  color_hex   text,
  k           integer NOT NULL DEFAULT 0,
  l           integer NOT NULL DEFAULT 0,
  m           integer NOT NULL DEFAULT 0,
  n           integer NOT NULL DEFAULT 0,
  r           numeric(6,2) NOT NULL DEFAULT 5,
  s           numeric(6,2) NOT NULL DEFAULT 8,
  t           numeric(6,2) NOT NULL DEFAULT 1.0,
  aj          integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. 인덱스 ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_styles_session_id ON styles(session_id);
CREATE INDEX IF NOT EXISTS idx_colors_style_id   ON colors(style_id);

-- ── 3. session_summary 뷰 ─────────────────────────────────────

CREATE OR REPLACE VIEW session_summary AS
SELECT
  s.id,
  s.name,
  s.base_date,
  s.created_at,
  COUNT(st.id)::integer AS style_count
FROM reorder_sessions s
LEFT JOIN styles st ON st.session_id = s.id
GROUP BY s.id, s.name, s.base_date, s.created_at
ORDER BY s.created_at DESC;

-- ── 4. RLS (Row Level Security) ────────────────────────────────

ALTER TABLE reorder_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE styles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE colors            ENABLE ROW LEVEL SECURITY;

-- reorder_sessions
CREATE POLICY "auth_read_sessions"   ON reorder_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_sessions" ON reorder_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_delete_sessions" ON reorder_sessions FOR DELETE TO authenticated USING (true);

-- styles
CREATE POLICY "auth_read_styles"   ON styles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_styles" ON styles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_delete_styles" ON styles FOR DELETE TO authenticated USING (true);

-- colors
CREATE POLICY "auth_read_colors"   ON colors FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_colors" ON colors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_colors" ON colors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_colors" ON colors FOR DELETE TO authenticated USING (true);
