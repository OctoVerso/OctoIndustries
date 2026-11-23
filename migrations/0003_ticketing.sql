CREATE TABLE feedback_submissions_new (
  id TEXT PRIMARY KEY,
  ticket_number INTEGER NOT NULL UNIQUE,
  access_token_hash TEXT,
  type TEXT NOT NULL CHECK (type IN ('suggestion', 'issue')),
  game_id TEXT,
  message TEXT NOT NULL,
  device_info TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'under_review', 'awaiting_user', 'planned', 'in_progress', 'awaiting_user_reply', 'implemented', 'resolved', 'rejected', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  admin_notes TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO feedback_submissions_new (
  id, ticket_number, access_token_hash, type, game_id, message, device_info,
  status, priority, admin_notes, archived_at, deleted_at, created_at, updated_at
)
SELECT
  id,
  1000 + ROW_NUMBER() OVER (ORDER BY created_at, id),
  NULL,
  type,
  game_id,
  message,
  device_info,
  CASE status
    WHEN 'seen' THEN 'under_review'
    WHEN 'working' THEN 'in_progress'
    WHEN 'important' THEN 'under_review'
    WHEN 'archived' THEN 'closed'
    ELSE status
  END,
  CASE WHEN status = 'important' THEN 'high' ELSE 'medium' END,
  admin_notes,
  CASE WHEN status = 'archived' THEN updated_at ELSE NULL END,
  NULL,
  created_at,
  updated_at
FROM feedback_submissions;

DROP TABLE feedback_submissions;
ALTER TABLE feedback_submissions_new RENAME TO feedback_submissions;

CREATE INDEX feedback_created_at ON feedback_submissions (created_at);
CREATE INDEX feedback_status_created ON feedback_submissions (status, created_at);
CREATE INDEX feedback_ticket_number ON feedback_submissions (ticket_number);
CREATE INDEX feedback_archived_status ON feedback_submissions (archived_at, status);
CREATE INDEX feedback_deleted ON feedback_submissions (deleted_at);

CREATE TABLE feedback_ticket_sequence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_number INTEGER NOT NULL
);
INSERT INTO feedback_ticket_sequence (id, next_number)
SELECT 1, COALESCE(MAX(ticket_number), 1000) + 1 FROM feedback_submissions;

CREATE TABLE feedback_conversations (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('user', 'admin')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX feedback_conversation_ticket ON feedback_conversations (feedback_id, created_at);

CREATE TABLE feedback_activity (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'admin')),
  created_at TEXT NOT NULL
);
CREATE INDEX feedback_activity_ticket ON feedback_activity (feedback_id, created_at);