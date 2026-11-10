// Database schema: every table as it was on the VPS (building.db, photos.db, pinkbook.db merged into
// one database) plus the tables added for serverless hosting at the end. Applied by ensureSchema() in
// api.mjs; every statement is idempotent.
export const SCHEMA_SQL = `
-- building.building_inspections
CREATE TABLE IF NOT EXISTS building_inspections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            date TEXT,
            inspector TEXT,
            building TEXT,
            room TEXT,
            item1 INTEGER,
            item2 INTEGER,
            item3 INTEGER,
            item4 INTEGER,
            item5 INTEGER,
            total INTEGER,
            note TEXT
        , images TEXT DEFAULT '[]');

-- building.building_inspections_v2
CREATE TABLE IF NOT EXISTS building_inspections_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        date TEXT,
        inspector1 TEXT,
        inspector2 TEXT,
        inspector3 TEXT,
        building TEXT,
        floor TEXT,
        room TEXT,
        status TEXT,
        overall_image_url TEXT
    );

-- building.building_issues_v2
CREATE TABLE IF NOT EXISTS building_issues_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inspection_id INTEGER,
        issue_name TEXT,
        image_url TEXT,
        is_cancelled INTEGER DEFAULT 0,
        FOREIGN KEY(inspection_id) REFERENCES building_inspections_v2(id) ON DELETE CASCADE
    );

-- photos.albums
CREATE TABLE IF NOT EXISTS albums (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cover_image_id TEXT,
        photo_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    , is_locked INTEGER DEFAULT 0, password_hash TEXT, event_date INTEGER, pinned_at INTEGER, parent_id TEXT, deleted_at INTEGER, trash_root_id TEXT, custom_cover_id TEXT);

-- photos.images
CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        album_id TEXT NOT NULL,
        original_name TEXT,
        width INTEGER,
        height INTEGER,
        size_bytes INTEGER,
        preview_b64 TEXT,
        r2_key_preview TEXT,
        r2_key_thumb TEXT,
        r2_key_medium TEXT,
        r2_key_original TEXT,
        created_at INTEGER NOT NULL, processing_status TEXT DEFAULT 'done', retry_count INTEGER DEFAULT 0, last_error TEXT, processed_at INTEGER, processing_started_at INTEGER, folder_id TEXT, file_type TEXT DEFAULT 'image', r2_key_sd TEXT, convert_format TEXT, r2_key_4k TEXT, idle_4k_fails INTEGER DEFAULT 0, deleted_at INTEGER, trash_root_id TEXT, taken_at INTEGER,
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
    );

-- photos.folders
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL,
    parent_folder_id TEXT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

-- photos.shares
CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    include_subfolders INTEGER DEFAULT 1,
    allow_download INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    revoked_at INTEGER,
    view_count INTEGER DEFAULT 0,
    last_viewed_at INTEGER
, role TEXT DEFAULT 'viewer');

-- photos.video_sources
CREATE TABLE IF NOT EXISTS video_sources (
        source_key TEXT PRIMARY KEY,
        width INTEGER, height INTEGER, fps REAL, duration REAL, has_audio INTEGER,
        probed_at INTEGER, probe_error TEXT, probe_fails INTEGER DEFAULT 0
    );

-- photos.video_renditions
CREATE TABLE IF NOT EXISTS video_renditions (
        source_key TEXT NOT NULL,
        height INTEGER NOT NULL,
        fps INTEGER,
        status TEXT NOT NULL DEFAULT 'queued',
        r2_key TEXT, size_bytes INTEGER,
        fails INTEGER DEFAULT 0, last_error TEXT, updated_at INTEGER,
        PRIMARY KEY (source_key, height)
    );

-- photos.app_migrations
CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, ran_at INTEGER);

-- photos.idx_images_album
CREATE INDEX IF NOT EXISTS idx_images_album ON images(album_id, created_at);

-- photos.idx_images_status
CREATE INDEX IF NOT EXISTS idx_images_status ON images(album_id, processing_status);

-- photos.idx_images_pending
CREATE INDEX IF NOT EXISTS idx_images_pending ON images(processing_status, created_at);

-- photos.idx_folders_album
CREATE INDEX IF NOT EXISTS idx_folders_album ON folders(album_id, parent_folder_id);

-- photos.idx_albums_parent
CREATE INDEX IF NOT EXISTS idx_albums_parent ON albums(parent_id);

-- photos.idx_shares_target
CREATE INDEX IF NOT EXISTS idx_shares_target ON shares(target_id);

-- photos.idx_images_taken_at
CREATE INDEX IF NOT EXISTS idx_images_taken_at ON images(taken_at);

-- photos.idx_video_renditions_status
CREATE INDEX IF NOT EXISTS idx_video_renditions_status ON video_renditions(status);

-- pinkbook.pinkbook_records
CREATE TABLE IF NOT EXISTS pinkbook_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspector_name TEXT,
    inspected_week INTEGER,
    grade TEXT NOT NULL,
    room TEXT NOT NULL,
    group_name TEXT NOT NULL,
    issues TEXT NOT NULL,
    unsubmitted_weeks TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , raw_issues TEXT, term TEXT DEFAULT '1/2569');

-- pinkbook.pinkbook_logs
CREATE TABLE IF NOT EXISTS pinkbook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER,
    inspected_week INTEGER NOT NULL,
    grade TEXT NOT NULL,
    room TEXT NOT NULL,
    group_name TEXT NOT NULL,
    action TEXT NOT NULL,
    action_by TEXT NOT NULL,
    status TEXT,
    issues TEXT,
    unsubmitted_weeks TEXT DEFAULT '[]',
    raw_issues TEXT DEFAULT '{}',
    diff_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, term TEXT DEFAULT '1/2569');

-- pinkbook.pinkbook_drafts
CREATE TABLE IF NOT EXISTS pinkbook_drafts (draft_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);

-- pinkbook.idx_records_term_week
CREATE INDEX IF NOT EXISTS idx_records_term_week ON pinkbook_records (term, inspected_week);

-- pinkbook.idx_logs_term
CREATE INDEX IF NOT EXISTS idx_logs_term ON pinkbook_logs (term);


-- ===== Added for serverless hosting =====

-- JSON documents that used to be files next to server.js (see kv.mjs).
CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

-- Login / upload rate limits (were in-memory Maps; serverless instances do not share memory).
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);

-- Photo upload batches ("<session>:<block>" from X-Upload-Order): order anchor and cancel state.
CREATE TABLE IF NOT EXISTS upload_runs (run_key TEXT PRIMARY KEY, anchor_t INTEGER NOT NULL, anchor_base INTEGER NOT NULL, cancelled TEXT, at INTEGER NOT NULL);

-- LINE bot conversation state per LINE user (was an in-memory Map in lineBot/index.js).
CREATE TABLE IF NOT EXISTS line_sessions (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS line_queue (user_id TEXT NOT NULL, message_id TEXT NOT NULL, type TEXT NOT NULL, seq INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, message_id));
CREATE TABLE IF NOT EXISTS line_image_sets (set_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, total INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, warned INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
`
