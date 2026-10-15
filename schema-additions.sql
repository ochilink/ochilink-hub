
-- Additions for Vercel fullstack
CREATE TABLE IF NOT EXISTS behavior_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT,
  element_selector TEXT,
  page_path TEXT
);
CREATE TABLE IF NOT EXISTS behavior_scroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT,
  page_path TEXT,
  max_depth_pct INT,
  time_on_page_sec INT
);
CREATE TABLE IF NOT EXISTS security_auth_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  event_type TEXT,
  user_identity TEXT,
  client_ip INET,
  failure_reason TEXT
);
