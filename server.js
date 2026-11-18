// JM Performance — backend
// Autenticação por identidade plataforma legada. Professor = dono do projeto.
// Todas as permissões são validadas no servidor, nunca no frontend.
import { BRAND } from "./config/brand.js";
import { normalizeVideoUrl } from "./config/video.js";
import { createPushNotificationPayload } from "./utils/notificationCopy.js";
import { isSupportedNotificationPath } from "./utils/notificationNavigation.js";

const CHECKOUT_PLANS = Object.freeze({
  EVOLVE: { amountCents: 20000, durationDays: 30, currency: "BRL" },
  ASCEND: { amountCents: 50000, durationDays: 90, currency: "BRL" },
});
const MP_WEBHOOK_PATH = "/api/payments/mercadopago/webhook";
const MP_MAX_WEBHOOK_BYTES = 16 * 1024;

const schema = `
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE,
    username TEXT,
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    subscription_required INTEGER NOT NULL DEFAULT 1,
    experience_started_at TEXT,
    experience_ends_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS students_user ON students (user_id);

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT,
    actor_role TEXT,
    action TEXT,
    entity TEXT,
    entity_id TEXT,
    before TEXT,
    after TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS audit_actor ON audit_log (actor_id);

  CREATE TABLE IF NOT EXISTS anamnesis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER UNIQUE NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pendente',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS anamnesis_student ON anamnesis (student_id);

  CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    weight REAL,
    height REAL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'ativa',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS eval_student ON evaluations (student_id);

  CREATE TABLE IF NOT EXISTS evaluation_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evaluation_id INTEGER NOT NULL,
    metric TEXT NOT NULL,
    value REAL,
    unit TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS evm_eval ON evaluation_measurements (evaluation_id);

  CREATE TABLE IF NOT EXISTS evaluation_skinfolds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evaluation_id INTEGER NOT NULL,
    protocol TEXT NOT NULL DEFAULT '',
    site TEXT NOT NULL,
    value REAL,
    unit TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS evs_eval ON evaluation_skinfolds (evaluation_id);

  CREATE TABLE IF NOT EXISTS evaluation_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evaluation_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    result REAL,
    unit TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS evt_eval ON evaluation_tests (evaluation_id);

  CREATE TABLE IF NOT EXISTS evaluation_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evaluation_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'outras',
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS evp_eval ON evaluation_photos (evaluation_id);

  CREATE TABLE IF NOT EXISTS exercise_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    sort INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO exercise_categories (name, sort) VALUES
    ('Peito', 1), ('Costas', 2), ('Ombros', 3), ('Bíceps', 4), ('Tríceps', 5),
    ('Quadríceps', 6), ('Posteriores', 7), ('Glúteos', 8), ('Panturrilhas', 9),
    ('Core', 10), ('Cardio', 11), ('Mobilidade', 12), ('Alongamento', 13), ('Específico', 14);

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    tags TEXT,
    equipment TEXT,
    description TEXT,
    instructions TEXT,
    common_errors TEXT,
    observations TEXT,
    video_url TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    visibility TEXT NOT NULL DEFAULT 'privado',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS exercises_category ON exercises (category);
  CREATE INDEX IF NOT EXISTS exercises_status ON exercises (status);

  CREATE TABLE IF NOT EXISTS training_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS tp_student ON training_programs (student_id);

  CREATE TABLE IF NOT EXISTS training_phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    target TEXT,
    order_idx INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativo',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS tph_program ON training_phases (program_id);

  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_id INTEGER NOT NULL,
    label TEXT,
    name TEXT,
    order_idx INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ativo',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS wk_phase ON workouts (phase_id);

  CREATE TABLE IF NOT EXISTS prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL,
    exercise_id INTEGER,
    exercise_name TEXT,
    kind TEXT NOT NULL DEFAULT 'exercise',
    order_idx INTEGER NOT NULL DEFAULT 0,
    sets INTEGER,
    reps_min INTEGER,
    reps_max INTEGER,
    load TEXT,
    rir TEXT,
    rest TEXT,
    cadence TEXT,
    time_sec INTEGER,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS pr_workout ON prescriptions (workout_id);

  CREATE TABLE IF NOT EXISTS executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prescription_id INTEGER NOT NULL,
    workout_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    flags TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ex_prescription ON executions (prescription_id);
  CREATE INDEX IF NOT EXISTS ex_student ON executions (student_id);

  CREATE TABLE IF NOT EXISTS execution_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER NOT NULL,
    set_number INTEGER NOT NULL DEFAULT 1,
    weight REAL,
    load_label TEXT,
    reps INTEGER,
    rir TEXT,
    completed INTEGER NOT NULL DEFAULT 1,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS exs_execution ON execution_sets (execution_id);

  CREATE TABLE IF NOT EXISTS checkin_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    periodicity TEXT NOT NULL DEFAULT 'semanal',
    custom_days INTEGER,
    questions TEXT NOT NULL DEFAULT '{}',
    threshold TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO checkin_config (id, periodicity, custom_days, questions, threshold) VALUES (1, 'semanal', NULL, '{}', '{}');

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    period_start TEXT NOT NULL,
    answers TEXT NOT NULL DEFAULT '{}',
    flags TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    answered_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ci_student ON checkins (student_id, period_start);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    sender TEXT NOT NULL,
    sender_user_id TEXT,
    user_id TEXT,
    text TEXT,
    file_url TEXT,
    file_name TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS chat_student ON chat_messages (student_id, id);

  CREATE TABLE IF NOT EXISTS chat_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uploader_user_id TEXT NOT NULL,
    student_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS chat_uploads_token ON chat_uploads (token);
  CREATE INDEX IF NOT EXISTS chat_uploads_student ON chat_uploads (student_id);

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'Atendimento',
    type TEXT NOT NULL DEFAULT 'atendimento',
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'agendado',
    location TEXT,
    notes TEXT,
    evaluation_id INTEGER,
    booking_source TEXT NOT NULL DEFAULT 'professor',
    booked_by_user_id TEXT,
    user_id TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS appointments_student ON appointments (student_id);
  CREATE INDEX IF NOT EXISTS appointments_start ON appointments (starts_at);
  CREATE INDEX IF NOT EXISTS appointments_status ON appointments (status);

  CREATE TABLE IF NOT EXISTS financial_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT 'Mensalidade',
    category TEXT NOT NULL DEFAULT 'mensalidade',
    amount_cents INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    paid_at TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    payment_method TEXT,
    notes TEXT,
    reference TEXT,
    subscription_id INTEGER,
    payment_id INTEGER,
    user_id TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS financial_student ON financial_entries (student_id);
  CREATE INDEX IF NOT EXISTS financial_due_date ON financial_entries (due_date);
  CREATE INDEX IF NOT EXISTS financial_status ON financial_entries (status);

  CREATE TABLE IF NOT EXISTS pain_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    region TEXT NOT NULL,
    side TEXT,
    onset_date TEXT,
    resolved_date TEXT,
    intensity INTEGER,
    status TEXT NOT NULL DEFAULT 'ativa',
    description TEXT,
    triggers TEXT,
    limitations TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS pain_student ON pain_records (student_id);
  CREATE INDEX IF NOT EXISTS pain_status ON pain_records (status);

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 30,
    benefits TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'ativo',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS plans_status ON plans (status);

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    price_cents INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    auto_renew INTEGER NOT NULL DEFAULT 0,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS subscriptions_student ON subscriptions (student_id);
  CREATE INDEX IF NOT EXISTS subscriptions_status ON subscriptions (status);

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    subscription_id INTEGER,
    amount_cents INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    paid_at TEXT,
    received_at TEXT,
    reason TEXT,
    charge_id INTEGER,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payment_method TEXT,
    transaction_reference TEXT,
    notes TEXT,
    legacy_financial_id INTEGER UNIQUE,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS payments_student ON payments (student_id);
  CREATE INDEX IF NOT EXISTS payments_status ON payments (status);
  CREATE INDEX IF NOT EXISTS payments_due_date ON payments (due_date);

  CREATE TABLE IF NOT EXISTS billing_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pending_tolerance_days INTEGER NOT NULL DEFAULT 7,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO billing_settings (id, pending_tolerance_days) VALUES (1, 7);

  CREATE TABLE IF NOT EXISTS availability_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'blocked',
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS availability_blocks_start ON availability_blocks (starts_at);

  CREATE TABLE IF NOT EXISTS student_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    invited_username TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TEXT,
    invited_by TEXT,
    accepted_user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS invitations_student ON student_invitations (student_id);
  CREATE INDEX IF NOT EXISTS invitations_status ON student_invitations (status);

  CREATE TABLE IF NOT EXISTS appointment_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL,
    reminder_type TEXT NOT NULL,
    recipient_user_id TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (appointment_id, reminder_type, recipient_user_id)
  );
  CREATE INDEX IF NOT EXISTS appointment_reminders_appointment ON appointment_reminders (appointment_id);

  CREATE TABLE IF NOT EXISTS preview_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL,
    student_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS preview_sessions_token ON preview_sessions (token);

  CREATE TABLE IF NOT EXISTS dashboard_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_key TEXT NOT NULL UNIQUE,
    owner_user_id TEXT,
    type TEXT NOT NULL,
    student_id INTEGER,
    entity_type TEXT,
    entity_id TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS dashboard_alerts_status ON dashboard_alerts (status);

  CREATE TABLE IF NOT EXISTS professional_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    name TEXT,
    username TEXT,
    email TEXT,
    phone TEXT,
    cref TEXT,
    professional_info TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profile_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    object_key TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS profile_uploads_user ON profile_uploads(user_id);

  -- Contas próprias do JM Performance (professor e alunos), com credencial
  -- própria independente da conta plataforma legada. Senhas nunca em texto puro.
  CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    username TEXT,
    email TEXT,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL DEFAULT 310000,
    password_format TEXT NOT NULL DEFAULT 'pbkdf2-sha256-v1',
    role TEXT NOT NULL DEFAULT 'student',
    student_id INTEGER,
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS app_users_username ON app_users (username);
  CREATE UNIQUE INDEX IF NOT EXISTS app_users_email ON app_users (email);
  CREATE INDEX IF NOT EXISTS app_users_role ON app_users (role);
  CREATE INDEX IF NOT EXISTS app_users_student ON app_users (student_id);

  CREATE TABLE IF NOT EXISTS professional_bootstrap (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    user_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Sessões de acesso do app (revogáveis no logout no servidor).
  CREATE TABLE IF NOT EXISTS auth_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS auth_sessions_token ON auth_sessions (token);
  CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id);
  CREATE INDEX IF NOT EXISTS auth_sessions_expires ON auth_sessions (expires_at);

  CREATE TABLE IF NOT EXISTS auth_attempts (
    identifier TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    blocked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_rate_limits (
    identifier TEXT PRIMARY KEY,
    hits INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL,
    blocked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS auth_rate_limits_blocked ON auth_rate_limits(blocked_until);

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    consume_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS password_reset_tokens_user ON password_reset_tokens(user_id);
  CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry ON password_reset_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS internal_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    idempotency_key TEXT NOT NULL UNIQUE,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS internal_notifications_recipient ON internal_notifications (recipient_user_id, read_at, id);

  -- Convites de primeiro acesso do aluno ("definir senha").
  CREATE TABLE IF NOT EXISTS student_access_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_by TEXT,
    expires_at TEXT,
    used_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS access_invites_token ON student_access_invites (token);
  CREATE INDEX IF NOT EXISTS access_invites_student ON student_access_invites (student_id);
`;

function emptyIdentity() {
  return { userId: null, username: null, ownerId: null, signedIn: false, isOwner: false, appAuth: false };
}

// ---- Autenticação própria do JM Performance ----
// Senhas processadas com PBKDF2 (nunca em texto puro) e sessões revogáveis
// armazenadas no servidor. A autorização é sempre validada aqui no backend.

const PBKDF2_ITERATIONS = 310000;
const PASSWORD_FORMAT_LEGACY = "pbkdf2-sha256-v1";
const PASSWORD_FORMAT_CURRENT = "pbkdf2-sha256-v2";

const APP_SESSION_HOURS = 8;
const SESSION_COOKIE = "jm_session";

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  return new Uint8Array((hex.match(/.{2}/g) || []).map((h) => parseInt(h, 16)));
}

function newToken() {
  return randomId() + toHex(crypto.getRandomValues(new Uint8Array(16)));
}

function newRecoveryToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256Hex(value) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

// Gera um id curto e aleatório. Prefere crypto.randomUUID, mas tem fallback
// para runtimes onde essa API não está disponível (o mesmo padrão usado na
// geração de todos os ids do app).
function randomId() {
  const u = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  return String(u).replace(/-/g, "");
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function concatBytes(...parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Bytes(input) {
  const blockSize = 64;
  const totalSize = Math.ceil((input.length + 9) / blockSize) * blockSize;
  const padded = new Uint8Array(totalSize);
  padded.set(input);
  padded[input.length] = 0x80;
  new DataView(padded.buffer).setUint32(totalSize - 4, input.length * 8);

  const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  const view = new DataView(padded.buffer);
  for (let offset = 0; offset < totalSize; offset += blockSize) {
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotateRight(words[i - 15], 7) ^ rotateRight(words[i - 15], 18) ^ (words[i - 15] >>> 3);
      const s1 = rotateRight(words[i - 2], 17) ^ rotateRight(words[i - 2], 19) ^ (words[i - 2] >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choose + SHA256_K[i] + words[i]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0; state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0; state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);
  state.forEach((value, index) => outputView.setUint32(index * 4, value));
  return output;
}

function hmacSha256(key, message) {
  const normalizedKey = key.length > 64 ? sha256Bytes(key) : key;
  const paddedKey = new Uint8Array(64);
  paddedKey.set(normalizedKey);
  const inner = new Uint8Array(64); const outer = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) { inner[i] = paddedKey[i] ^ 0x36; outer[i] = paddedKey[i] ^ 0x5c; }
  return sha256Bytes(concatBytes(outer, sha256Bytes(concatBytes(inner, message))));
}

function pbkdf2Sha256Fallback(password, saltHex, iterations) {
  const rounds = Number(iterations);
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error("Invalid PBKDF2 iteration count");
  const salt = fromHex(saltHex);
  const block = concatBytes(salt, new Uint8Array([0, 0, 0, 1]));
  const key = new TextEncoder().encode(password);
  let u = hmacSha256(key, block);
  const result = new Uint8Array(u);
  for (let i = 1; i < rounds; i += 1) {
    u = hmacSha256(key, u);
    for (let j = 0; j < result.length; j += 1) result[j] ^= u[j];
  }
  return toHex(result);
}

async function derivePasswordHash(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: fromHex(saltHex), iterations, hash: "SHA-256" },
      key,
      256
    );
    return toHex(bits);
  } catch {
    return pbkdf2Sha256Fallback(password, saltHex, iterations);
  }
}

async function makePasswordRecord(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derivePasswordHash(password, salt);
  return { salt, hash, iterations: PBKDF2_ITERATIONS, format: PASSWORD_FORMAT_CURRENT };
}

async function verifyPassword(password, saltHex, expectedHash, iterations = PBKDF2_ITERATIONS, format = PASSWORD_FORMAT_LEGACY) {
  if (!saltHex || !expectedHash) return false;
  if (![PASSWORD_FORMAT_LEGACY, PASSWORD_FORMAT_CURRENT].includes(format || PASSWORD_FORMAT_LEGACY)) return false;
  const actual = await derivePasswordHash(password, saltHex, Number(iterations) || PBKDF2_ITERATIONS);
  return actual === expectedHash;
}

function normalizeIdentifier(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^@/, "").toLowerCase().slice(0, 120);
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().normalize("NFKC").toLowerCase().slice(0, 120);
}

function validEmail(value) {
  return value.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeDisplayName(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 120);
}

async function hitAuthRateLimit(env, scope, value, limit, windowMs = 15 * 60 * 1000) {
  const identifier = await sha256Hex(`${scope}:${value}`);
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoffIso = new Date(now.getTime() - windowMs).toISOString();
  const blockedUntil = new Date(now.getTime() + windowMs).toISOString();
  const existing = await env.DB.prepare("SELECT blocked_until FROM auth_rate_limits WHERE identifier=?").bind(identifier).first();
  if (existing?.blocked_until && Date.parse(existing.blocked_until) > now.getTime()) return true;
  await env.DB.prepare(`
    INSERT INTO auth_rate_limits (identifier, hits, window_started_at, blocked_until, updated_at)
    VALUES (?, 1, ?, NULL, ?)
    ON CONFLICT(identifier) DO UPDATE SET
      hits=CASE WHEN auth_rate_limits.window_started_at < ? THEN 1 ELSE auth_rate_limits.hits+1 END,
      window_started_at=CASE WHEN auth_rate_limits.window_started_at < ? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END,
      blocked_until=CASE
        WHEN (CASE WHEN auth_rate_limits.window_started_at < ? THEN 1 ELSE auth_rate_limits.hits+1 END) > ? THEN ?
        WHEN auth_rate_limits.window_started_at < ? THEN NULL
        ELSE auth_rate_limits.blocked_until
      END,
      updated_at=excluded.updated_at
  `).bind(identifier, nowIso, nowIso, cutoffIso, cutoffIso, cutoffIso, limit, blockedUntil, cutoffIso).run();
  const current = await env.DB.prepare("SELECT hits, blocked_until FROM auth_rate_limits WHERE identifier=?").bind(identifier).first();
  return Number(current?.hits || 0) > limit || (!!current?.blocked_until && Date.parse(current.blocked_until) > now.getTime());
}

function passwordRecoveryAvailability(env) {
  let sender;
  let appBase;
  let configured = false;
  try {
    sender = new URL(env.EMAIL_SENDER_URL);
    appBase = new URL(env.APP_BASE_URL);
    const local = env.APP_ENV === "local" || env.APP_ENV === "test";
    const localHttpUrl = (url) => url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    const secureSender = sender.protocol === "https:" || (local && localHttpUrl(sender));
    const secureAppBase = appBase.protocol === "https:" || (local && localHttpUrl(appBase));
    const resendNeedsToken = sender.hostname === "api.resend.com"
      && !(typeof env.EMAIL_SENDER_TOKEN === "string" && env.EMAIL_SENDER_TOKEN.trim());
    configured = !!env.EMAIL_FROM && secureSender && secureAppBase
      && !sender.username && !sender.password && !appBase.username && !appBase.password
      && !sender.search && !sender.hash && !resendNeedsToken;
  } catch {}
  return {
    available: configured,
    message: configured
      ? "Há configuração para solicitar a recuperação por e-mail. A entrega depende do provedor; se não receber instruções, fale com o profissional."
      : "A recuperação por e-mail está indisponível no momento. Fale com o profissional para receber ajuda.",
  };
}

async function sendRecoveryEmail(env, email, displayName, token) {
  if (!passwordRecoveryAvailability(env).available) return false;
  try {
    const sender = new URL(env.EMAIL_SENDER_URL);
    const appBase = new URL(env.APP_BASE_URL);
    const isLocal = env.APP_ENV === "local" || env.APP_ENV === "test";
    if ((!isLocal && sender.protocol !== "https:") || (!isLocal && appBase.protocol !== "https:")) return false;
    if (sender.username || sender.password || appBase.username || appBase.password) return false;
    const resetUrl = new URL("/membros/reset-password", appBase.origin);
    resetUrl.searchParams.set("token", token);
    const response = await fetch(sender.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.EMAIL_SENDER_TOKEN ? { Authorization: `Bearer ${env.EMAIL_SENDER_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: email,
        subject: "Redefinição de senha do JM Performance",
        text: `Olá${displayName ? `, ${displayName}` : ""}. Use este link para redefinir sua senha: ${resetUrl.toString()}\n\nSe você não pediu esta alteração, ignore esta mensagem.`,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function createSession(env, user, clearAttemptKeys = null) {
  const token = newToken();
  const expires = new Date(Date.now() + APP_SESSION_HOURS * 3600000).toISOString();
  const statements = [
    env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ? OR expires_at <= datetime('now')").bind(user.id),
    env.DB.prepare("INSERT INTO auth_sessions (token, user_id, role, expires_at) VALUES (?, ?, ?, ?)").bind(token, user.id, user.role, expires),
  ];
  if (Array.isArray(clearAttemptKeys) && clearAttemptKeys.length) {
    const placeholders = clearAttemptKeys.map(() => "?").join(",");
    statements.push(env.DB.prepare(`DELETE FROM auth_attempts WHERE identifier IN (${placeholders})`).bind(...clearAttemptKeys));
  }
  await env.DB.batch(statements);
  return { token, expires_at: expires };
}

async function destroySession(env, token) {
  if (token) await env.DB.prepare("DELETE FROM auth_sessions WHERE token = ?").bind(token).run();
}

function cookieValue(request, name) {
  const cookies = request.headers.get("cookie") || "";
  return cookies.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1) || null;
}

function sessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

// Resolve a sessão própria (header x-jhoony-auth) e, se válida, sobrepõe a
// identidade plataforma legada pela identidade do app. Titular/profissional = isOwner.
async function appAuth(env, request) {
  const cookies = request.headers.get("cookie") || "";
  const token = cookies.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) || null;
  const base = emptyIdentity();
  if (!token) return base;
  const session = await env.DB.prepare("SELECT * FROM auth_sessions WHERE token = ? AND expires_at > datetime('now')").bind(token).first();
  if (!session) return base;
  const user = await env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(session.user_id).first();
  if (!user || user.status !== "ativo" || session.role !== user.role) return base;
  const isProfessional = user.role === "professional";
  const professional = isProfessional ? user : await env.DB.prepare("SELECT id FROM app_users WHERE role = 'professional' AND status = 'ativo' LIMIT 1").first();
  return {
    ...base,
    appAuth: true,
    appUser: user,
    userId: "app:" + user.id,
    username: user.username,
    signedIn: true,
    isOwner: isProfessional,
    ownerId: professional ? "app:" + professional.id : null,
  };
}

// Encontra app_user pelo login (username ou email).
async function findAppUserByIdentifier(env, identifier) {
  const value = normalizeIdentifier(identifier);
  if (!value) return null;
  return (
    (await env.DB.prepare("SELECT * FROM app_users WHERE username = ? OR email = ?").bind(value, value).first()) || null
  );
}

const LOGIN_FAILURE_LIMIT = 4;
const LOGIN_BLOCK_MINUTES = 15;

function requestAddress(request) {
  const cloudflareAddress = request.headers.get("CF-Connecting-IP")?.trim();
  if (cloudflareAddress) return cloudflareAddress.slice(0, 128);
  const forwarded = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  return (forwarded || "unknown").slice(0, 128);
}

function loginAttemptKeys(identifier, request) {
  const address = requestAddress(request);
  return [`identifier:${identifier}`, `address:${address}`];
}

async function loginBlocked(env, keys) {
  const placeholders = keys.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT blocked_until FROM auth_attempts WHERE identifier IN (${placeholders})`).bind(...keys).all();
  return results.some((row) => row.blocked_until && new Date(row.blocked_until).getTime() > Date.now());
}

async function registerLoginFailure(env, keys) {
  const blocked = new Date(Date.now() + LOGIN_BLOCK_MINUTES * 60000).toISOString();
  await env.DB.batch(keys.map((key) => env.DB.prepare(
    "INSERT INTO auth_attempts(identifier, failures, blocked_until, updated_at) VALUES (?, 1, NULL, datetime('now')) ON CONFLICT(identifier) DO UPDATE SET failures=failures+1, blocked_until=CASE WHEN failures+1 >= ? THEN ? ELSE NULL END, updated_at=datetime('now')"
  ).bind(key, LOGIN_FAILURE_LIMIT, blocked)));
}

async function clearLoginFailures(env, keys) {
  const placeholders = keys.map(() => "?").join(",");
  await env.DB.prepare(`DELETE FROM auth_attempts WHERE identifier IN (${placeholders})`).bind(...keys).run();
}

// Cria ou atualiza a conta de acesso de um aluno, sempre vinculada ao
// student_id exato. Retorna { user } ou { error }.
async function upsertStudentAccess(env, studentId, { username, email, password }) {
  const cleanUsername = normalizeIdentifier(username);
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase().slice(0, 160) || null : null;
  if (!cleanUsername && !cleanEmail) return { error: "Informe um usuário de acesso para o aluno." };
  if (!password || typeof password !== "string" || password.length < 6) return { error: "A senha deve ter no mínimo 6 caracteres." };

  const existing = (await env.DB.prepare("SELECT * FROM app_users WHERE student_id = ?").bind(studentId).first()) || null;
  if (existing && existing.role !== "student") return { error: "Este cadastro já tem acesso de profissional." };

  const usernameTaken = cleanUsername && await env.DB.prepare("SELECT id FROM app_users WHERE username = ? AND (student_id IS NULL OR student_id <> ?)").bind(cleanUsername, studentId).first();
  if (usernameTaken) return { error: "Este usuário já está em uso." };
  const emailTaken = cleanEmail && await env.DB.prepare("SELECT id FROM app_users WHERE email = ? AND (student_id IS NULL OR student_id <> ?)").bind(cleanEmail, studentId).first();
  if (emailTaken) return { error: "Este e-mail já está em uso." };

  const record = await makePasswordRecord(password);
  const student = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(studentId).first();
  if (!student) return { error: "Aluno não encontrado." };

  if (existing) {
    await env.DB.batch([
      env.DB.prepare("UPDATE app_users SET username = ?, email = ?, password_hash = ?, password_salt = ?, password_iterations = ?, password_format = ?, display_name = COALESCE(?, display_name), status = 'ativo', updated_at = datetime('now') WHERE id = ?").bind(cleanUsername || null, cleanEmail || null, record.hash, record.salt, record.iterations, record.format, null, existing.id),
      env.DB.prepare("UPDATE students SET user_id = ?, username = COALESCE(?, username), updated_at = datetime('now') WHERE id = ? AND COALESCE(user_id, '') <> ?").bind("app:" + existing.id, cleanUsername || null, studentId, "app:" + existing.id),
    ]);
    await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(existing.id).run();
    const updated = await env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(existing.id).first();
    return { user: updated, created: false };
  }

  const id = "u_" + crypto.randomUUID().replace(/-/g, "");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO app_users (id, username, email, password_hash, password_salt, password_iterations, password_format, role, student_id, display_name, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'student', ?, ?, 'ativo')").bind(id, cleanUsername || null, cleanEmail || null, record.hash, record.salt, record.iterations, record.format, studentId, student.display_name || null),
    env.DB.prepare("UPDATE students SET user_id = ?, username = COALESCE(?, username), updated_at = datetime('now') WHERE id = ?").bind("app:" + id, cleanUsername || null, studentId),
  ]);
  const created = await env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(id).first();
  return { user: created, created: true };
}

function isDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const PAIN_STATUSES = ["ativa", "monitorar", "resolvida"];
const APPOINTMENT_TYPES = ["chamada_acompanhamento", "avaliacao_fisica", "reavaliacao", "consultoria", "outro", "atendimento", "avaliacao", "chamada"];

function appointmentType(value) {
  return APPOINTMENT_TYPES.includes(value) ? value : "consultoria";
}

function painInput(body, current = {}) {
  const region = typeof body.region === "string" && body.region.trim() ? body.region.trim() : current.region || "";
  if (!region) return { error: "Informe a região da dor." };
  const intensityRaw = body.intensity === undefined ? current.intensity : body.intensity;
  const intensity = intensityRaw === "" || intensityRaw === null || intensityRaw === undefined ? null : Number(intensityRaw);
  if (intensity !== null && (!Number.isInteger(intensity) || intensity < 0 || intensity > 10)) return { error: "A intensidade deve estar entre 0 e 10." };
  const onsetDate = body.onset_date === undefined ? current.onset_date || null : body.onset_date || null;
  const resolvedDate = body.resolved_date === undefined ? current.resolved_date || null : body.resolved_date || null;
  if ((onsetDate && !isDateOnly(onsetDate)) || (resolvedDate && !isDateOnly(resolvedDate))) return { error: "Informe datas válidas." };
  const status = PAIN_STATUSES.includes(body.status) ? body.status : current.status || "ativa";
  return {
    data: {
      region,
      side: typeof body.side === "string" ? body.side.trim() : current.side || null,
      onset_date: onsetDate,
      resolved_date: resolvedDate,
      intensity,
      status,
      description: typeof body.description === "string" ? body.description.trim() : current.description || null,
      triggers: typeof body.triggers === "string" ? body.triggers.trim() : current.triggers || null,
      limitations: typeof body.limitations === "string" ? body.limitations.trim() : current.limitations || null,
    },
  };
}

async function studentByUser(env, userId) {
  if (!userId) return null;
  return (
    (await env.DB.prepare("SELECT * FROM students WHERE user_id = ?").bind(userId).first()) ?? null
  );
}

async function previewStudent(env, request, me) {
  const token = request.headers.get("x-jm-preview-token");
  if (!token || !me.isOwner) return null;
  const session = await env.DB.prepare(
    "SELECT ps.*, s.* FROM preview_sessions ps JOIN students s ON s.id = ps.student_id WHERE ps.token = ? AND ps.owner_id = ? AND ps.expires_at > datetime('now')"
  ).bind(token, me.userId).first();
  return session ? { ...session, preview: true } : null;
}

async function studentForRequest(env, request, me) {
  return (await previewStudent(env, request, me)) || (me.signedIn ? await studentByUser(env, me.userId) : null);
}

async function recordAlert(env, { alertKey, type, studentId, entityType, entityId }) {
  if (!alertKey) return null;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO dashboard_alerts (alert_key, type, student_id, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)"
  ).bind(alertKey, type || "generic", studentId || null, entityType || null, entityId == null ? null : String(entityId)).run();
  return env.DB.prepare("SELECT * FROM dashboard_alerts WHERE alert_key = ?").bind(alertKey).first();
}

async function alertStatus(env, alertKey) {
  const row = await env.DB.prepare("SELECT status FROM dashboard_alerts WHERE alert_key = ?").bind(alertKey).first();
  return row?.status || "new";
}

async function persistDashboardAlerts(env, alerts, ownerId) {
  const items = alerts.map((alert) => {
    const entityType = alert.entityType || ({ dor: "pain_record", checkin: "checkin", recuperacao: "checkin", adesao: "checkin", divergencia: "execution", agendamento: "appointment", pagamento: "payment", avaliacao: "evaluation", mensagem: "message", arquivo: "message" }[alert.kind] || null);
    const alertId = `${ownerId || "owner:unknown"}:${alert.kind || "generic"}:${alert.studentId || 0}:${alert.entityId || alert.createdAt || "current"}`;
    return { ...alert, alertId, entityType };
  });
  const keys = [...new Set(items.map((item) => item.alertId))];
  const current = new Set(keys);

  // Pendências que deixam de existir são resolvidas sem apagar o histórico.
  const { results: openRows } = await env.DB.prepare(
    "SELECT alert_key FROM dashboard_alerts WHERE owner_user_id = ? AND status IN ('new', 'viewed', 'in_progress', 'dismissed')"
  ).bind(ownerId).all();
  const stale = openRows.filter((row) => !current.has(row.alert_key)).map((row) => row.alert_key);
  if (stale.length) {
    const phStale = stale.map(() => "?").join(",");
    await env.DB.prepare(`UPDATE dashboard_alerts SET status = 'resolved', updated_at = datetime('now') WHERE alert_key IN (${phStale})`).bind(...stale).run();
  }

  if (!keys.length) return new Map();
  const placeholders = keys.map(() => "?").join(",");
  const existing = (await env.DB.prepare(`SELECT alert_key, status FROM dashboard_alerts WHERE alert_key IN (${placeholders})`).bind(...keys).all()).results;
  const known = new Set(existing.map((item) => item.alert_key));
  const missing = items.filter((item) => !known.has(item.alertId));
  if (missing.length) {
    await env.DB.batch(missing.map((item) => env.DB.prepare(
      "INSERT OR IGNORE INTO dashboard_alerts (alert_key, owner_user_id, type, student_id, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(item.alertId, ownerId, item.kind || "generic", item.studentId || null, item.entityType || null, item.entityId == null ? null : String(item.entityId))));
  }
  const statusMap = new Map(existing.map((item) => [item.alert_key, item.status]));
  for (const item of missing) statusMap.set(item.alertId, "new");
  return new Map(items.map((item) => [item.alertId, statusMap.get(item.alertId) || "new"]));
}

async function studentByUsernameUnclaimed(env, username) {
  if (!username) return null;
  return (
    (await env.DB
      .prepare("SELECT * FROM students WHERE username = ? AND user_id IS NULL")
      .bind(username)
      .first()) ?? null
  );
}

async function upsertAnamnesis(env, studentId, data, status, editor) {
  const row = (await env.DB.prepare("SELECT * FROM anamnesis WHERE student_id = ?").bind(studentId).first()) ?? null;
  const before = row ? row.data : null;
  const beforeStatus = row?.status || null;
  const now = new Date().toISOString();
  if (row) {
    await env.DB
      .prepare("UPDATE anamnesis SET data = ?, status = ?, user_id = ?, updated_at = datetime('now') WHERE student_id = ?")
      .bind(JSON.stringify(data), status, editor, studentId)
      .run();
  } else {
    await env.DB
      .prepare("INSERT INTO anamnesis (student_id, data, status, user_id) VALUES (?, ?, ?, ?)")
      .bind(studentId, JSON.stringify(data), status, editor)
      .run();
  }
  return { before, beforeStatus, after: JSON.stringify(data), status };
}

function parsedAnamnesisData(value) {
  try { const data = JSON.parse(value || "{}"); return data && typeof data === "object" && !Array.isArray(data) ? data : {}; }
  catch { return {}; }
}

async function hydrateAnamnesisData(env, studentId, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const data = { ...value };
  const dietToken = typeof data.diet_file_token === "string" ? data.diet_file_token : "";
  if (dietToken) {
    const file = await env.DB.prepare("SELECT file_name, content_type, bytes, created_at FROM chat_uploads WHERE token=? AND student_id=?").bind(dietToken, studentId).first();
    if (file) data.diet_file = { ...file, file_token: dietToken, file_url: `/api/chat/files/${dietToken}` };
    else { delete data.diet_file_token; delete data.diet_file; }
  }
  const healthTokens = Array.isArray(data.health_document_tokens) ? [...new Set(data.health_document_tokens.filter((token) => typeof token === "string" && /^[a-f0-9-]{36}$/i.test(token)))].slice(0, 10) : [];
  data.health_document_tokens = healthTokens;
  const healthFiles = await Promise.all(healthTokens.map((token) => env.DB.prepare("SELECT file_name, content_type, bytes, created_at FROM chat_uploads WHERE token=? AND student_id=?").bind(token, studentId).first().then((file) => file ? { ...file, file_token: token, file_url: `/api/chat/files/${token}` } : null)));
  data.health_documents = healthFiles.filter(Boolean);
  return data;
}

async function prepareAnamnesisData(env, { incoming, previous, studentId, editorUserId }) {
  const data = { ...incoming };
  delete data.health_documents;
  if (data.health_document_tokens === undefined) data.health_document_tokens = Array.isArray(previous?.health_document_tokens) ? previous.health_document_tokens : [];
  if (!Array.isArray(data.health_document_tokens)) return { error: "Lista de documentos de saúde inválida." };
  const previousHealthTokens = new Set(Array.isArray(previous?.health_document_tokens) ? previous.health_document_tokens : []);
  const healthTokens = [...new Set(data.health_document_tokens)];
  if (healthTokens.length > 10 || healthTokens.some((token) => typeof token !== "string" || !/^[a-f0-9-]{36}$/i.test(token))) return { error: "Lista de documentos de saúde inválida." };
  for (const token of healthTokens) {
    const file = await env.DB.prepare("SELECT uploader_user_id, used_at FROM chat_uploads WHERE token=? AND student_id=?").bind(token, studentId).first();
    if (!file || (file.uploader_user_id !== editorUserId && !previousHealthTokens.has(token)) || (file.used_at && !previousHealthTokens.has(token))) return { error: "Um documento de saúde não está vinculado a esta conta e a este aluno." };
  }
  data.health_document_tokens = healthTokens;
  if (data.diet_following === "sim") {
    if (typeof data.diet_file_token === "string" && data.diet_file_token) {
      const file = await env.DB.prepare("SELECT file_name, uploader_user_id, used_at FROM chat_uploads WHERE token=? AND student_id=?").bind(data.diet_file_token, studentId).first();
      if (!file || (file.uploader_user_id !== editorUserId && previous?.diet_file_token !== data.diet_file_token) || (file.used_at && previous?.diet_file_token !== data.diet_file_token)) return { error: "O arquivo alimentar não está vinculado a esta conta e a este aluno." };
      data.diet_file = { file_name: file.file_name };
    } else { delete data.diet_file_token; delete data.diet_file; }
  } else { delete data.diet_file_token; delete data.diet_file; }
  return { data };
}

function validAnamnesisUploadContent(contentType, extension, bytes) {
  if (!bytes?.byteLength) return false;
  if (contentType === "application/pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (["application/msword", "application/vnd.ms-excel"].includes(contentType)) return [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte);
  if (["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(contentType)) {
    const zipHeader = bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]);
    const zipMetadata = new TextDecoder("latin1").decode(bytes).includes("[Content_Types].xml");
    return zipHeader && zipMetadata;
  }
  if (contentType === "text/plain") {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return !bytes.includes(0); }
    catch { return false; }
  }
  if (contentType === "image/jpeg" && ["jpg", "jpeg"].includes(extension)) return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png" && extension === "png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  return false;
}

async function log(env, { actorId, actorRole, action, entity, entityId, before, after }) {
  await env.DB.prepare(
    "INSERT INTO audit_log (actor_id, actor_role, action, entity, entity_id, before, after) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      actorId ?? null,
      actorRole ?? null,
      action,
      entity ?? null,
      entityId ?? null,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null
    )
    .run();
}

function computeFlags(pres, sets, opts) {
  const flags = [];
  if (!opts.completed) flags.push("incompleto");
  if (opts.pain) flags.push("dor");
  const repsDone = (sets || []).filter((s) => s.completed !== false && s.completed !== 0 && s.set_type !== "preparatory" && s.reps != null).map((s) => Number(s.reps));
  if (repsDone.length && pres) {
    const min = pres.reps_min != null ? Number(pres.reps_min) : null;
    const max = pres.reps_max != null ? Number(pres.reps_max) : null;
    const best = Math.max(...repsDone);
    const worst = Math.min(...repsDone);
    if (min != null && worst < min) flags.push("abaixo_da_faixa");
    if (max != null && best > max) flags.push("acima_da_faixa");
  }
  return flags;
}

async function setsFor(env, executionId) {
  const { results } = await env.DB.prepare("SELECT * FROM execution_sets WHERE execution_id = ? ORDER BY set_number").bind(executionId).all();
  return results;
}

async function execWithSets(env, id) {
  const e = (await env.DB.prepare("SELECT * FROM executions WHERE id = ?").bind(id).first());
  if (!e) return null;
  const sets = await setsFor(env, id);
  return { ...e, sets: sets.map((set) => {
    let techniqueData = null;
    try { techniqueData = set.technique_data ? JSON.parse(set.technique_data) : null; } catch {}
    return { ...set, technique_data: techniqueData };
  }) };
}

async function readRequestBodyWithinLimit(request, maxBytes) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return { error: "too_large" };
  if (!request.body) return { bytes: new Uint8Array() };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { error: "too_large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes };
}

async function techniquesForPrescriptions(env, prescriptionIds) {
  const ids = [...new Set((prescriptionIds || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return {};
  const placeholders = ids.map(() => "?").join(",");
  const rows = (await env.DB.prepare(`SELECT * FROM prescription_techniques WHERE prescription_id IN (${placeholders}) ORDER BY prescription_id, order_idx, id`).bind(...ids).all()).results;
  const grouped = {};
  for (const row of rows) {
    let applyToSets = [], exerciseIds = [];
    try { applyToSets = JSON.parse(row.apply_to_sets || "[]"); } catch {}
    try { exerciseIds = JSON.parse(row.exercise_ids || "[]"); } catch {}
    (grouped[row.prescription_id] = grouped[row.prescription_id] || []).push({
      ...row,
      apply_to_sets: Array.isArray(applyToSets) ? applyToSets : [],
      exercise_ids: Array.isArray(exerciseIds) ? exerciseIds : [],
    });
  }
  for (const [prescriptionId, techniques] of Object.entries(grouped)) {
    for (const technique of techniques) {
      if (!["superset", "biset", "triset"].includes(technique.technique_type)) continue;
      for (const linkedId of technique.exercise_ids) {
        if (Number(linkedId) === Number(prescriptionId) || !ids.includes(Number(linkedId))) continue;
        const peers = grouped[linkedId] || (grouped[linkedId] = []);
        if (!peers.some((peer) => Number(peer.id) === Number(technique.id))) peers.push({ ...technique, linked_from: Number(prescriptionId) });
      }
    }
  }
  return grouped;
}

function normalizeTechniqueList(rawTechniques, prescriptionId, validSetCount) {
  if (!Array.isArray(rawTechniques) || rawTechniques.length > 5) return { error: "Informe no mÃ¡ximo cinco tÃ©cnicas por exercÃ­cio." };
  const knownTypes = new Set(["superset", "biset", "triset", "drop_set", "rest_pause", "cluster_set", "myo_reps", "isometria", "custom"]);
  const normalized = [];
  for (const [index, raw] of rawTechniques.entries()) {
    if (!raw || typeof raw !== "object" || !knownTypes.has(raw.technique_type)) return { error: "Selecione uma tÃ©cnica avanÃ§ada vÃ¡lida." };
    const type = raw.technique_type;
    const number = (key, min, max, optional = false) => {
      if (optional && (raw[key] === "" || raw[key] == null)) return null;
      const value = Number(raw[key]);
      return Number.isInteger(value) && value >= min && value <= max ? value : NaN;
    };
    const applyToSets = Array.isArray(raw.apply_to_sets) ? raw.apply_to_sets.map(Number) : [];
    if (!applyToSets.length || applyToSets.some((setNumber) => !Number.isInteger(setNumber) || setNumber < 1 || setNumber > validSetCount) || new Set(applyToSets).size !== applyToSets.length) return { error: "Informe sÃ©ries vÃ¡lidas para aplicar cada tÃ©cnica." };
    const exerciseIds = Array.isArray(raw.exercise_ids) ? raw.exercise_ids.map(Number) : [];
    const combo = ["superset", "biset", "triset"].includes(type);
    if (combo) {
      const expected = type === "biset" ? 2 : type === "triset" ? 3 : null;
      if (!exerciseIds.includes(Number(prescriptionId)) || new Set(exerciseIds).size !== exerciseIds.length || exerciseIds.some((id) => !Number.isSafeInteger(id) || id < 1)) return { error: "Selecione os exercÃ­cios vinculados e defina uma ordem vÃ¡lida." };
      if (expected && exerciseIds.length !== expected) return { error: type === "biset" ? "Bi-set combina exatamente dois exercÃ­cios." : "Tri-set combina exatamente trÃªs exercÃ­cios." };
      if (!expected && (exerciseIds.length < 2 || exerciseIds.length > 5)) return { error: "SupersÃ©rie combina de dois a cinco exercÃ­cios." };
    } else if (exerciseIds.length && (exerciseIds.length !== 1 || exerciseIds[0] !== Number(prescriptionId))) return { error: "Somente supersÃ©ries, bi-sets e tri-sets podem vincular outros exercÃ­cios." };
    const reductionMode = raw.reduction_mode === "absolute" ? "absolute" : raw.reduction_mode === "percent" ? "percent" : null;
    const reductionValue = raw.reduction_value === "" || raw.reduction_value == null ? null : Number(raw.reduction_value);
    const reductionCount = number("reduction_count", 1, 6, true);
    const blocks = number("blocks", 1, 20, true);
    const pauseSeconds = number("pause_seconds", 0, 3600, true);
    const repsPerBlock = number("reps_per_block", 1, 200, true);
    const isometricSeconds = number("isometric_seconds", 1, 3600, true);
    if (type === "drop_set" && (!reductionMode || !Number.isFinite(reductionValue) || reductionValue <= 0 || (reductionMode === "percent" && reductionValue > 100) || !Number.isInteger(reductionCount))) return { error: "Preencha o tipo, valor e nÃºmero de reduÃ§Ãµes do drop-set." };
    if (["rest_pause", "cluster_set", "myo_reps"].includes(type) && (!Number.isInteger(blocks) || !Number.isInteger(pauseSeconds) || !Number.isInteger(repsPerBlock))) return { error: "Preencha blocos, pausas e repetiÃ§Ãµes da tÃ©cnica." };
    if (type === "isometria" && !Number.isInteger(isometricSeconds)) return { error: "Informe a duraÃ§Ã£o da isometria em segundos." };
    const customName = typeof raw.custom_name === "string" ? raw.custom_name.trim().slice(0, 80) : "";
    const instructions = typeof raw.instructions === "string" ? raw.instructions.trim().slice(0, 1000) : "";
    if (type === "custom" && (!customName || !instructions)) return { error: "TÃ©cnica personalizada exige nome e instruÃ§Ãµes do profissional." };
    normalized.push({
      technique_type: type, custom_name: type === "custom" ? customName : null,
      apply_to_sets: [...applyToSets].sort((a, b) => a - b),
      reduction_mode: type === "drop_set" ? reductionMode : null,
      reduction_value: type === "drop_set" ? reductionValue : null,
      reduction_count: type === "drop_set" ? reductionCount : null,
      blocks: ["rest_pause", "cluster_set", "myo_reps"].includes(type) ? blocks : null,
      pause_seconds: ["rest_pause", "cluster_set", "myo_reps"].includes(type) ? pauseSeconds : null,
      reps_per_block: ["rest_pause", "cluster_set", "myo_reps"].includes(type) ? repsPerBlock : null,
      isometric_seconds: type === "isometria" ? isometricSeconds : null,
      exercise_ids: combo ? exerciseIds : [Number(prescriptionId)],
      instructions: instructions || null,
      order_idx: index + 1,
    });
  }
  return { techniques: normalized };
}

async function savePrescriptionTechniques(env, prescriptionId, workoutId, techniques) {
  const validSetCount = Number((await env.DB.prepare("SELECT sets FROM prescriptions WHERE id=? AND workout_id=?").bind(prescriptionId, workoutId).first())?.sets) || 3;
  const normalized = normalizeTechniqueList(techniques, prescriptionId, Math.min(20, Math.max(1, validSetCount)));
  if (normalized.error) return normalized.error;
  for (const technique of normalized.techniques) {
    const linkedIds = technique.exercise_ids;
    if (linkedIds.some((id) => !Number.isSafeInteger(id))) return "ExercÃ­cio vinculado invÃ¡lido.";
    if (linkedIds.length) {
      const placeholders = linkedIds.map(() => "?").join(",");
      const found = (await env.DB.prepare(`SELECT id FROM prescriptions WHERE workout_id=? AND kind='exercise' AND id IN (${placeholders}) AND COALESCE(status,'ativo')<>'arquivado'`).bind(workoutId, ...linkedIds).all()).results.map((row) => Number(row.id));
      if (found.length !== linkedIds.length) return "Todos os exercÃ­cios da combinaÃ§Ã£o precisam pertencer ao mesmo treino e estar ativos.";
    }
  }
  const statements = [env.DB.prepare("DELETE FROM prescription_techniques WHERE prescription_id=?").bind(prescriptionId), ...normalized.techniques.map((technique) => env.DB.prepare("INSERT INTO prescription_techniques (prescription_id, technique_type, custom_name, apply_to_sets, reduction_mode, reduction_value, reduction_count, blocks, pause_seconds, reps_per_block, isometric_seconds, exercise_ids, instructions, order_idx) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(prescriptionId, technique.technique_type, technique.custom_name, JSON.stringify(technique.apply_to_sets), technique.reduction_mode, technique.reduction_value, technique.reduction_count, technique.blocks, technique.pause_seconds, technique.reps_per_block, technique.isometric_seconds, JSON.stringify(technique.exercise_ids), technique.instructions, technique.order_idx))];
  await env.DB.batch(statements);
  return null;
}

async function prescriptionWithTechniques(env, row) {
  if (!row) return row;
  const map = await techniquesForPrescriptions(env, [row.id]);
  return { ...row, techniques: map[row.id] || [] };
}

async function lastExecutionPerPrescription(env) {
  const { results } = await env.DB
    .prepare("SELECT e.* FROM executions e JOIN (SELECT prescription_id, MAX(id) mid FROM executions GROUP BY prescription_id) t ON t.mid = e.id")
    .all();
  const map = {};
  for (const r of results) map[r.prescription_id] = r;
  return map;
}

async function studentTree(env, studentId) {
  const [programRows, phaseRows, workoutRows, prescriptionRows, lastEx] = await Promise.all([
    env.DB.prepare("SELECT * FROM training_programs WHERE student_id = ? AND COALESCE(status, 'ativo') <> 'arquivado' ORDER BY created_at").bind(studentId).all(),
    env.DB.prepare("SELECT * FROM training_phases WHERE program_id IN (SELECT id FROM training_programs WHERE student_id = ? AND COALESCE(status, 'ativo') <> 'arquivado') AND COALESCE(status, 'ativo') <> 'arquivado' ORDER BY order_idx").bind(studentId).all(),
    env.DB.prepare("SELECT * FROM workouts WHERE phase_id IN (SELECT id FROM training_phases WHERE program_id IN (SELECT id FROM training_programs WHERE student_id = ? AND COALESCE(status, 'ativo') <> 'arquivado') AND COALESCE(status, 'ativo') <> 'arquivado') AND COALESCE(status, 'ativo') <> 'arquivado' ORDER BY order_idx").bind(studentId).all(),
    env.DB.prepare("SELECT pr.*, e.video_url, e.category AS muscle_group FROM prescriptions pr LEFT JOIN exercises e ON e.id=pr.exercise_id WHERE pr.workout_id IN (SELECT w.id FROM workouts w JOIN training_phases p ON p.id=w.phase_id JOIN training_programs pg ON pg.id=p.program_id WHERE pg.student_id=? AND COALESCE(pg.status, 'ativo') <> 'arquivado' AND COALESCE(p.status, 'ativo') <> 'arquivado' AND COALESCE(w.status, 'ativo') <> 'arquivado') AND COALESCE(pr.status, 'ativo') <> 'arquivado' ORDER BY pr.order_idx").bind(studentId).all(),
    lastExecutionPerPrescription(env),
  ]);
  const progs = programRows.results;
  const phases = phaseRows.results;
  const workouts = workoutRows.results;
  const pres = prescriptionRows.results;
  const techniquesByPrescription = await techniquesForPrescriptions(env, pres.map((item) => item.id));
  const wmap = {};
  for (const p of pres) (wmap[p.workout_id] = wmap[p.workout_id] || []).push({ ...p, techniques: techniquesByPrescription[p.id] || [], last_execution: lastEx[p.id] || null });
  const pmap = {};
  for (const w of workouts) (pmap[w.phase_id] = pmap[w.phase_id] || []).push({ ...w, prescriptions: wmap[w.id] || [] });
  const prmap = {};
  for (const ph of phases) (prmap[ph.program_id] = prmap[ph.program_id] || []).push({ ...ph, workouts: pmap[ph.id] || [] });
  return progs.map((p) => ({ ...p, phases: prmap[p.id] || [] }));
}

async function buildEvolution(env, studentId) {
  const evals = (await env.DB.prepare("SELECT id, date, weight FROM evaluations WHERE student_id = ? ORDER BY date ASC, id ASC").bind(studentId).all()).results;
  const measureSeries = {};
  if (evals.length) {
    const ids = evals.map((e) => e.id);
    const place = ids.map(() => "?").join(",");
    const { results: rows } = await env.DB
      .prepare(`SELECT evaluation_id, metric, value FROM evaluation_measurements WHERE evaluation_id IN (${place}) ORDER BY evaluation_id`)
      .bind(...ids)
      .all();
    const evMap = {};
    for (const e of evals) evMap[e.id] = e.date;
    for (const r of rows) {
      (measureSeries[r.metric] = measureSeries[r.metric] || []).push({ date: evMap[r.evaluation_id], value: r.value });
    }
  }

  // peso vindo do campo weight de cada avaliação
  const weightSeries = evals.map((e) => ({ date: e.date, value: e.weight })).filter((p) => p.value != null);

  // desempenho por exercício (série temporal)
  const prescriptions = (await env.DB.prepare(
    "SELECT pr.id, pr.exercise_name, pr.exercise_id FROM prescriptions pr JOIN workouts w ON w.id=pr.workout_id JOIN training_phases ph ON ph.id=w.phase_id JOIN training_programs pg ON pg.id=ph.program_id WHERE pg.student_id=?"
  ).bind(studentId).all()).results;

  const exProgress = {};
  if (prescriptions.length) {
    const ids = prescriptions.map((p) => p.id);
    const place = ids.map(() => "?").join(",");
    const exs = (await env.DB.prepare(`SELECT id, prescription_id, date FROM executions WHERE student_id=? AND prescription_id IN (${place}) ORDER BY date ASC, id ASC`).bind(studentId, ...ids).all()).results;
    const byPres = {};
    for (const e of exs) (byPres[e.prescription_id] = byPres[e.prescription_id] || []).push(e);
    const prescribed = {};
    for (const p of prescriptions) prescribed[p.id] = p.exercise_name || "";

    // séries para cálculo de carga máxima e volume
    if (exs.length) {
      const xe = exs.map((e) => e.id);
      const xp = xe.map(() => "?").join(",");
      const sets = (await env.DB.prepare(`SELECT execution_id, weight, reps, set_type, completed FROM execution_sets WHERE execution_id IN (${xp})`).bind(...xe).all()).results;
      const setsByEx = {};
      for (const s of sets) (setsByEx[s.execution_id] = setsByEx[s.execution_id] || []).push(s);
      for (const p of prescriptions) {
        const series = (byPres[p.id] || []).map((e) => {
          const ss = setsByEx[e.id] || [];
          const valid = ss.filter((s) => s.completed !== 0 && s.set_type !== "preparatory");
          const weighted = valid.filter((s) => s.weight != null && Number.isFinite(Number(s.weight)));
          const measured = valid.filter((s) => s.weight != null && s.reps != null && Number.isFinite(Number(s.weight)) && Number.isFinite(Number(s.reps)));
          const best = weighted.reduce((m, s) => (Number(s.weight) > m ? Number(s.weight) : m), 0);
          const volume = measured.reduce((m, s) => m + Number(s.weight) * Number(s.reps), 0);
          return { date: e.date, bestWeight: weighted.length ? best : null, volume: measured.length ? volume : null, validSets: valid.length, measuredSets: measured.length, unit: "kg·repetições" };
        });
        if (series.length) {
          exProgress[p.id] = { name: prescribed[p.id] || "Exercício " + p.id, series };
        }
      }
    }
  }

  // frequência: execuções por semana
  const weekly = {};
  const freqs = (await env.DB.prepare("SELECT date, workout_id FROM executions WHERE student_id = ?").bind(studentId).all()).results;
  const seen = new Set();
  for (const f of freqs) {
    const key = f.date + ":" + f.workout_id;
    if (seen.has(key)) continue;
    seen.add(key);
    const iso = isoWeek(f.date);
    weekly[iso] = (weekly[iso] || 0) + 1;
  }
  const weeklySeries = Object.keys(weekly).sort().map((k) => ({ week: k, value: weekly[k] }));

  return { weightSeries, measureSeries, exerciseProgress: exProgress, weeklySeries, evaluationCount: evals.length };
}

const DEFAULT_QUESTIONS = {
  sono_qualidade: { label: "Qualidade do sono", type: "scale", min: 1, max: 5 },
  sono_horas: { label: "Média de horas de sono", type: "number" },
  disposicao: { label: "Disposição", type: "scale", min: 0, max: 10 },
  qualidade_treinos: { label: "Qualidade dos treinos", type: "scale", min: 0, max: 10 },
  dificuldade: { label: "Dificuldade para cumprir os treinos", type: "scale", min: 0, max: 10 },
  dor: { label: "Você sentiu dor ou desconforto?", type: "bool" },
  dor_intensidade: { label: "Intensidade da dor", type: "scale", min: 0, max: 10 },
  recuperacao: { label: "Recuperação", type: "scale", min: 0, max: 10 },
  adesao: { label: "Adesão aos treinos", type: "scale", min: 0, max: 10 },
  treinos_perdidos: { label: "Motivo de treinos perdidos", type: "text" },
  percepcao_evolucao: { label: "Percepção de evolução", type: "scale", min: 0, max: 10 },
  observacoes: { label: "Observações", type: "text" },
};
const DEFAULT_THRESHOLD = { dor: 5, recuperacao_min: 5, sono_min: 3, adesao_min: 7 };

async function getCheckinConfig(env) {
  const row = (await env.DB.prepare("SELECT * FROM checkin_config WHERE id = 1").first()) || null;
  if (!row) return { periodicity: "semanal", custom_days: null, questions: {}, thresholds: DEFAULT_THRESHOLD };
  let questions = {};
  try { questions = JSON.parse(row.questions); } catch (e) { questions = {}; }
  let thresholds = {};
  try { thresholds = JSON.parse(row.threshold); } catch (e) { thresholds = {}; }
  return {
    periodicity: row.periodicity,
    custom_days: row.custom_days,
    questions,
    thresholds: { ...DEFAULT_THRESHOLD, ...thresholds },
  };
}

function periodDays(cfg) {
  if (cfg.periodicity === "semanal") return 7;
  if (cfg.periodicity === "quinzenal") return 15;
  if (cfg.periodicity === "mensal") return 30;
  return cfg.custom_days && cfg.custom_days > 0 ? cfg.custom_days : 7;
}

function computeCheckinFlags(answers, thresholds) {
  const flags = [];
  const a = answers || {};
  const t = thresholds || DEFAULT_THRESHOLD;
  if (a.dor === true || a.dor === "true" || Number(a.dor_intensidade) >= t.dor) flags.push("dor");
  if (a.recuperacao != null && Number(a.recuperacao) <= t.recuperacao_min) flags.push("recuperacao_baixa");
  if (a.adesao != null && Number(a.adesao) <= t.adesao_min) flags.push("adesao_baixa");
  if (a.sono_qualidade != null && Number(a.sono_qualidade) <= t.sono_min) flags.push("sono_baixo");
  return flags;
}

function prescriptionRangeError(prescription) {
  for (const key of ["sets", "reps_min", "reps_max", "time_sec", "warmup_sets", "warmup_reps_min", "warmup_reps_max"]) {
    const value = prescription[key];
    if (value != null && (!Number.isInteger(value) || value < 0)) return `Valor inválido para ${key}.`;
  }
  if (prescription.reps_min != null && prescription.reps_max != null && prescription.reps_min > prescription.reps_max) return "O mínimo de repetições não pode ser maior que o máximo.";
  if (prescription.warmup_reps_min != null && prescription.warmup_reps_max != null && prescription.warmup_reps_min > prescription.warmup_reps_max) return "O mínimo de repetições preparatórias não pode ser maior que o máximo.";
  if (prescription.kind === "exercise" && prescription.sets != null && prescription.sets < 1) return "A prescrição precisa ter ao menos uma série de trabalho.";
  if (prescription.sets != null && prescription.sets > 30) return "A prescrição pode ter no máximo 30 séries de trabalho.";
  if (prescription.warmup_enabled && (!prescription.warmup_sets || prescription.warmup_sets > 20 || !prescription.warmup_reps_min || !String(prescription.warmup_load_value ?? "").trim())) return "Informe quantidade, repetições e carga das séries preparatórias.";
  if (!["fixed", "work_percent"].includes(prescription.warmup_load_mode)) return "Selecione uma forma de carga preparatória válida.";
  if (prescription.warmup_load_mode === "work_percent" && prescription.warmup_load_value != null && (!Number.isFinite(Number(prescription.warmup_load_value)) || Number(prescription.warmup_load_value) <= 0 || Number(prescription.warmup_load_value) > 200)) return "O percentual da carga de trabalho deve estar entre 0 e 200.";
  return null;
}

function alertDestination(alert) {
  const moduleByKind = {
    novo: "alunos", conta: "alunos", anamnese: "anamnese", dor: "dores", recuperacao: "checkins", adesao: "treinos",
    divergencia: "treinos", checkin: "checkins", mensagem: "chat", arquivo: "chat", agendamento: "agenda",
    pagamento: "financeiro", plano: "financeiro", avaliacao: "avaliacoes", video: "videos", sem_registro: "checkins",
  };
  const entityType = alert.entityType || ({ dor: "pain_record", checkin: "checkin", recuperacao: "checkin", adesao: "checkin", divergencia: "execution", agendamento: "appointment", pagamento: "payment", avaliacao: "evaluation", mensagem: "message", arquivo: "message" }[alert.kind] || null);
  const module = entityType === "pain_record" ? "dores" : entityType === "anamnesis" ? "anamnese" : entityType === "video_review" ? "videos" : entityType === "checkin" ? "checkins" : entityType === "execution" ? "treinos" : entityType === "appointment" ? "agenda" : entityType === "payment" || entityType === "charge" || entityType === "subscription" || entityType === "checkout_order" ? "financeiro" : moduleByKind[alert.kind] || "alunos";
  return { module, studentId: alert.studentId || null, entityType, entityId: alert.entityId || null };
}

function isoWeek(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const firstThu = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round((d - firstThu) / (7 * 86400000));
  return d.getFullYear() + "-W" + String(week).padStart(2, "0");
}

async function studentAccess(env, studentId) {
  const student = await env.DB.prepare("SELECT subscription_required, experience_started_at, experience_ends_at FROM students WHERE id=?").bind(studentId).first();
  const subscription = await env.DB.prepare(`
    SELECT s.*, p.name AS plan_name, p.description AS plan_description, p.price_cents, p.duration_days
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id
    WHERE s.student_id = ? ORDER BY s.id DESC LIMIT 1
  `).bind(studentId).first();
  if (!subscription && student?.experience_started_at) {
    const endsAt = student.experience_ends_at || null;
    const endsMs = endsAt ? Date.parse(endsAt) : Number.NaN;
    const active = Number.isFinite(endsMs) && endsMs > Date.now();
    return {
      state: active ? "experience" : "experience_expired",
      restricted: !active,
      subscription_status: active ? "NONE" : "EXPIRED",
      access_status: active ? "ACTIVE" : "EXPIRED",
      subscription: null,
      trial: { name: "EXPERIENCE", duration_days: 7, started_at: student.experience_started_at, ends_at: endsAt },
    };
  }
  // Cadastros legados continuam compatíveis; novos vínculos entram em onboarding até haver assinatura.
  if (!subscription) {
    const required = Number(student?.subscription_required || 0) === 1;
    return required
      ? { state: "onboarding", restricted: true, subscription: null, subscription_status: "NONE", access_status: "PENDING" }
      : { state: "active", restricted: false, subscription: null, subscription_status: "NONE", access_status: "ACTIVE" };
  }
  const tolerance = await env.DB.prepare("SELECT pending_tolerance_days FROM billing_settings WHERE id = 1").first();
  const today = new Date();
  const end = subscription.end_date ? new Date(`${subscription.end_date}T23:59:59Z`) : null;
  const toleranceEnd = end && subscription.status === "PENDING"
    ? new Date(end.getTime() + Number(tolerance?.pending_tolerance_days || 7) * 86400000)
    : end;
  let restricted = false;
  if (subscription.status === "ACTIVE") restricted = !!(end && end < today);
  else if (subscription.status === "PENDING") restricted = !!(toleranceEnd && toleranceEnd < today);
  else restricted = true;
  const effectiveSubscriptionStatus = subscription.status === "ACTIVE" && restricted ? "EXPIRED" : subscription.status;
  const accessStatus = restricted ? (subscription.status === "PENDING" ? "PENDING" : "SUSPENDED") : (subscription.status === "PENDING" ? "PENDING" : "ACTIVE");
  return {
    state: restricted ? "restricted" : subscription.status.toLowerCase(),
    restricted,
    subscription_status: effectiveSubscriptionStatus,
    access_status: accessStatus,
    tolerance_days: Number(tolerance?.pending_tolerance_days || 7),
    subscription,
  };
}

async function studentHasAscend(env, studentId) {
  const access = await studentAccess(env, studentId);
  return !access.restricted && access.subscription_status === "ACTIVE"
    && ["ASCEND", "JM ALLY"].includes(String(access.subscription?.plan_name || "").trim().toUpperCase());
}

function privateStoredObjectResponse(object, contentType, fileName) {
  if (!object) return new Response("Not found", { status: 404 });
  const safeName = String(fileName || "arquivo").normalize("NFC").replace(/[\u0000-\u001F\u007F]/g, "_").trim() || "arquivo";
  const asciiName = safeName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(safeName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(object.body, { headers: {
    "content-type": contentType,
    "content-disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  } });
}

async function handleProfessionalReports(env, request, url, me) {
  const match = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/(report|monthly-summary)$/);
  if (!match) return null;
  if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
  const studentId = Number(match[1]);
  if (!(await professionalOwnsStudent(env, me, studentId))) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
  if (match[2] === "monthly-summary") {
    const month = String(url.searchParams.get("month") || "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: "Informe um mês válido no formato AAAA-MM." }, { status: 400 });
    if (request.method === "GET") {
      const summary = await env.DB.prepare("SELECT month_key, professional_comment, updated_at FROM professional_monthly_summaries WHERE student_id=? AND month_key=?").bind(studentId, month).first();
      return Response.json({ summary: summary || { month_key: month, professional_comment: "", updated_at: null } }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (request.method === "PUT") {
      const body = await request.json().catch(() => ({}));
      const comment = typeof body.professional_comment === "string" ? body.professional_comment.trim().slice(0, 3000) : "";
      await env.DB.prepare("INSERT INTO professional_monthly_summaries (student_id, month_key, professional_comment, author_user_id) VALUES (?, ?, ?, ?) ON CONFLICT(student_id, month_key) DO UPDATE SET professional_comment=excluded.professional_comment, author_user_id=excluded.author_user_id, updated_at=datetime('now')").bind(studentId, month, comment, me.userId).run();
      const summary = await env.DB.prepare("SELECT month_key, professional_comment, updated_at FROM professional_monthly_summaries WHERE student_id=? AND month_key=?").bind(studentId, month).first();
      return Response.json({ ok: true, summary });
    }
    return Response.json({ error: "Método não suportado." }, { status: 405 });
  }
  if (request.method !== "GET") return Response.json({ error: "Método não suportado." }, { status: 405 });
  const from = String(url.searchParams.get("from") || "");
  const to = String(url.searchParams.get("to") || "");
  if (!isDateOnly(from) || !isDateOnly(to) || from > to || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86400000) {
    return Response.json({ error: "Informe um período válido de até 12 meses." }, { status: 400 });
  }
  const [studentRow, executionRows, checkinRows, evaluationRows, messageRows, sessionCount, legacySessionCount, sessionDates, anamnesisRow, painRows, videoRows, appointmentRows] = await Promise.all([
    env.DB.prepare("SELECT display_name, username FROM students WHERE id=? AND owner_user_id=?").bind(studentId, me.userId).first(),
    env.DB.prepare("SELECT e.id, e.session_id, e.date, e.note, e.flags, e.completed, p.exercise_name, p.workout_id, w.name AS workout_name, es.set_number, es.set_type, es.weight, es.reps, es.rir, es.rest_seconds, es.technique_data, es.completed AS set_completed FROM executions e JOIN prescriptions p ON p.id=e.prescription_id JOIN workouts w ON w.id=e.workout_id LEFT JOIN execution_sets es ON es.execution_id=e.id WHERE e.student_id=? AND date(e.date) BETWEEN ? AND ? AND COALESCE(p.status,'ativo')<>'arquivado' ORDER BY e.date, e.id, es.set_number").bind(studentId, from, to).all(),
    env.DB.prepare("SELECT id, period_start, answered_at, answers, review_status, professional_observation, plan_decision, next_step FROM checkins WHERE student_id=? AND date(datetime(answered_at, '-3 hours')) BETWEEN ? AND ? ORDER BY answered_at").bind(studentId, from, to).all(),
    env.DB.prepare("SELECT id, date, weight, height, notes FROM evaluations WHERE student_id=? AND date BETWEEN ? AND ? AND COALESCE(status,'ativa')<>'arquivada' ORDER BY date").bind(studentId, from, to).all(),
    env.DB.prepare("SELECT created_at, sender, CASE WHEN file_url IS NOT NULL THEN 1 ELSE 0 END AS has_attachment FROM chat_messages WHERE student_id=? AND date(datetime(created_at, '-3 hours')) BETWEEN ? AND ? AND (COALESCE(text,'')<>'' OR file_url IS NOT NULL) ORDER BY created_at LIMIT 150").bind(studentId, from, to).all(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM workout_sessions WHERE student_id=? AND completed_at IS NOT NULL AND date(datetime(completed_at, '-3 hours')) BETWEEN ? AND ?").bind(studentId, from, to).first("count"),
    env.DB.prepare("SELECT COUNT(DISTINCT e.workout_id || ':' || date(e.date)) AS count FROM executions e JOIN prescriptions p ON p.id=e.prescription_id WHERE e.student_id=? AND e.session_id IS NULL AND e.completed=1 AND date(e.date) BETWEEN ? AND ? AND COALESCE(p.status,'ativo')<>'arquivado'").bind(studentId, from, to).first("count"),
    env.DB.prepare("SELECT local_date FROM (SELECT date(datetime(completed_at, '-3 hours')) AS local_date FROM workout_sessions WHERE student_id=? AND completed_at IS NOT NULL AND date(datetime(completed_at, '-3 hours')) BETWEEN ? AND ? UNION SELECT date(e.date) AS local_date FROM executions e JOIN prescriptions p ON p.id=e.prescription_id WHERE e.student_id=? AND e.session_id IS NULL AND e.completed=1 AND date(e.date) BETWEEN ? AND ? AND COALESCE(p.status,'ativo')<>'arquivado') ORDER BY local_date").bind(studentId, from, to, studentId, from, to).all(),
    env.DB.prepare("SELECT data, status, updated_at FROM anamnesis WHERE student_id=?").bind(studentId).first(),
    env.DB.prepare("SELECT id, created_at, region, side, onset_date, intensity, description, triggers, limitations, status, resolved_date FROM pain_records WHERE student_id=? AND date(datetime(created_at, '-3 hours')) BETWEEN ? AND ? ORDER BY created_at").bind(studentId, from, to).all(),
    env.DB.prepare("SELECT id, created_at, exercise_name, session_date, status, response_text, next_step, reviewed_at FROM video_reviews WHERE student_id=? AND date(datetime(created_at, '-3 hours')) BETWEEN ? AND ? ORDER BY created_at").bind(studentId, from, to).all(),
    env.DB.prepare("SELECT id, title, type, starts_at, ends_at, status FROM appointments WHERE student_id=? AND date(datetime(starts_at, '-3 hours')) BETWEEN ? AND ? ORDER BY starts_at").bind(studentId, from, to).all(),
  ]);
  const workouts = new Map();
  for (const row of executionRows.results) {
    let record = workouts.get(row.id);
    if (!record) {
      record = { id: row.id, session_id: row.session_id, date: row.date, workout_name: row.workout_name, exercise_name: row.exercise_name, note: row.note, flags: row.flags, completed: !!row.completed, sets: [] };
      workouts.set(row.id, record);
    }
    if (row.set_number != null) {
      let techniqueData = null;
      try { techniqueData = row.technique_data ? JSON.parse(row.technique_data) : null; } catch {}
      record.sets.push({ number: row.set_number, type: row.set_type || "valid", weight_kg: row.weight, reps: row.reps, rir: row.rir, rest_seconds: row.rest_seconds, technique_data: techniqueData, completed: !!row.set_completed });
    }
  }
  let anamnesisData = {};
  try { const parsed = JSON.parse(anamnesisRow?.data || "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) anamnesisData = parsed; } catch {}
  const dietToken = typeof anamnesisData.diet_file_token === "string" ? anamnesisData.diet_file_token : "";
  delete anamnesisData.diet_file;
  if (dietToken) {
    const dietUpload = await env.DB.prepare("SELECT file_name FROM chat_uploads WHERE token=? AND student_id=?").bind(dietToken, studentId).first();
    if (dietUpload) anamnesisData.diet_file = { file_name: dietUpload.file_name, file_url: `/api/chat/files/${dietToken}` };
    else { delete anamnesisData.diet_file; delete anamnesisData.diet_file_token; }
  }
  const anamnesisFields = [
    ["nome", "Nome"], ["data_nascimento", "Data de nascimento"], ["objetivo_principal", "Objetivo principal"], ["ja_treinou", "Experiência anterior"],
    ["frequencia_semanal", "Frequência semanal"], ["historico_lesoes", "Histórico de lesões"], ["dor_atual_onde", "Dores atuais"], ["condicoes_saude", "Condições de saúde"],
    ["restricoes", "Restrições"], ["horas_sono", "Horas de sono"], ["rotina_descricao", "Descrição da rotina"], ["vezes_desejadas", "Frequência desejada"],
    ["dias_disponiveis", "Dias disponíveis"], ["onde_treina", "Local de treino"], ["equipamentos", "Equipamentos"],
  ];
  const missingAnamnesis = anamnesisFields.filter(([key]) => anamnesisData[key] == null || anamnesisData[key] === "").map(([, label]) => label);
  const evaluations = [];
  for (const row of evaluationRows.results) {
    const [measurements, tests, skinfolds] = await Promise.all([
      env.DB.prepare("SELECT metric, value, unit FROM evaluation_measurements WHERE evaluation_id=? AND COALESCE(status,'ativo')<>'arquivado' ORDER BY id").bind(row.id).all(),
      env.DB.prepare("SELECT name, result, unit, note FROM evaluation_tests WHERE evaluation_id=? AND COALESCE(status,'ativo')<>'arquivado' ORDER BY id").bind(row.id).all(),
      env.DB.prepare("SELECT protocol, site, value, unit FROM evaluation_skinfolds WHERE evaluation_id=? AND COALESCE(status,'ativo')<>'arquivado' ORDER BY id").bind(row.id).all(),
    ]);
    evaluations.push({ ...row, measurements: measurements.results, tests: tests.results, skinfolds: skinfolds.results, source: "avaliação profissional" });
  }
  return Response.json({
    student_id: studentId,
    student_name: studentRow?.display_name || "Aluno",
    student_username: studentRow?.username || null,
    period: { from, to },
    source: "Registros do aplicativo no período selecionado",
    completed_sessions: Number(sessionCount || 0) + Number(legacySessionCount || 0),
    training_days: (sessionDates.results || []).length,
    workouts: [...workouts.values()],
    checkins: checkinRows.results.map((row) => ({ ...row, answers: JSON.parse(row.answers || "{}"), source: "check-in do aluno" })),
    evaluations,
    anamnesis: { status: anamnesisRow?.status || "pendente", updated_at: anamnesisRow?.updated_at || null, data: anamnesisData, pending_fields: missingAnamnesis },
    pains: painRows.results,
    video_reviews: videoRows.results,
    appointments: appointmentRows.results,
    messages: messageRows.results,
    note: "Este relatório organiza registros para apoiar a decisão do profissional. Não gera diagnóstico nem recomendação automática.",
  }, { headers: { "Cache-Control": "private, no-store" } });
}

async function handleProfessionalVideoReviews(env, request, url, me) {
  const match = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/video-reviews(?:\/(\d+)(?:\/(file|audio))?)?$/);
  if (!match) return null;
  if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
  const studentId = Number(match[1]);
  if (!(await professionalOwnsStudent(env, me, studentId))) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
  const reviewId = match[2] ? Number(match[2]) : null;
  const fileKind = match[3] || "";
  if (!reviewId && request.method === "GET") {
    const monthKey = new Date().toISOString().slice(0, 7);
    const [quota, reviews] = await Promise.all([
      env.DB.prepare("SELECT used_count FROM video_review_monthly_quotas WHERE student_id=? AND month_key=?").bind(studentId, monthKey).first(),
      env.DB.prepare("SELECT id, session_id, file_name, exercise_name, session_date, status, response_text, response_audio_url, response_audio_type, next_step, reviewed_at, created_at FROM video_reviews WHERE student_id=? ORDER BY created_at DESC LIMIT 60").bind(studentId).all(),
    ]);
    return Response.json({ month: monthKey, used: Number(quota?.used_count || 0), reviews: reviews.results.map((item) => ({ ...item, file_url: `/api/professor/students/${studentId}/video-reviews/${item.id}/file`, response_audio_url: item.response_audio_url ? `/api/professor/students/${studentId}/video-reviews/${item.id}/audio` : null })) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const review = reviewId ? await env.DB.prepare("SELECT * FROM video_reviews WHERE id=? AND student_id=?").bind(reviewId, studentId).first() : null;
  if (!review) return Response.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (fileKind && request.method === "GET") {
    if (!env.BLOB) return new Response("Not found", { status: 404 });
    const isAudio = fileKind === "audio";
    const objectKey = isAudio ? review.response_audio_url : review.file_url;
    if (!objectKey) return new Response("Not found", { status: 404 });
    return privateStoredObjectResponse(await env.BLOB.get(objectKey), isAudio ? (review.response_audio_type || "audio/webm") : review.content_type, isAudio ? "retorno" : review.file_name);
  }
  if (fileKind === "audio" && request.method === "POST") {
    if (!env.BLOB) return Response.json({ error: "Armazenamento privado indisponível." }, { status: 503 });
    const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const audioExtensions = { "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/mp4": ".m4a" };
    if (!audioExtensions[contentType]) return Response.json({ error: "Envie um áudio WebM, OGG, MP3, WAV ou M4A." }, { status: 400 });
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 12 * 1024 * 1024) return Response.json({ error: "O áudio deve ter no máximo 12 MB." }, { status: 413 });
    const objectKey = `video-reviews/${studentId}/responses/${reviewId}-${randomId()}${audioExtensions[contentType]}`;
    try { await env.BLOB.put(objectKey, bytes, { httpMetadata: { contentType } }); }
    catch { return Response.json({ error: "Não foi possível guardar o áudio." }, { status: 503 }); }
    await env.DB.prepare("UPDATE video_reviews SET response_audio_url=?, response_audio_type=?, reviewer_user_id=?, updated_at=datetime('now') WHERE id=? AND student_id=?").bind(objectKey, contentType, me.userId, reviewId, studentId).run();
    return Response.json({ ok: true, response_audio_url: `/api/professor/students/${studentId}/video-reviews/${reviewId}/audio` });
  }
  if (request.method === "PATCH" && !fileKind) {
    const body = await request.json().catch(() => ({}));
    if (body.status === "in_progress") {
      await env.DB.prepare("UPDATE video_reviews SET status='in_progress', reviewer_user_id=?, updated_at=datetime('now') WHERE id=? AND student_id=? AND status<>'responded'").bind(me.userId, reviewId, studentId).run();
      return Response.json({ ok: true, status: "in_progress" });
    }
    const responseText = typeof body.response_text === "string" ? body.response_text.trim().slice(0, 2000) : "";
    const nextStep = typeof body.next_step === "string" ? body.next_step.trim().slice(0, 1000) : "";
    if (!nextStep || (!responseText && !review.response_audio_url)) return Response.json({ error: "Registre uma orientação em texto ou áudio e o próximo passo." }, { status: 400 });
    await env.DB.prepare("UPDATE video_reviews SET status='responded', response_text=?, next_step=?, reviewer_user_id=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND student_id=?").bind(responseText || null, nextStep, me.userId, reviewId, studentId).run();
    const student = await env.DB.prepare("SELECT user_id FROM students WHERE id=?").bind(studentId).first();
    await notify(env, { recipients: [student?.user_id].filter(Boolean), title: "Retorno da análise de vídeo", body: "O profissional registrou a orientação e o próximo passo.", path: `/treinos?student_id=${studentId}&focus=videos&entity_type=video_review&entity_id=${reviewId}`, idempotencyKey: `video-review-reply:${reviewId}:${Date.now()}` });
    return Response.json({ ok: true, status: "responded" });
  }
  return Response.json({ error: "Método não suportado." }, { status: 405 });
}

async function planDependencies(env, planId) {
  const subscription = (await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE plan_id=?").bind(planId).first())?.n || 0;
  const financial = (await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM financial_entries f
    JOIN subscriptions s ON s.id = f.subscription_id
    WHERE s.plan_id=? AND f.deleted_at IS NULL
  `).bind(planId).first())?.n || 0;
  const payments = (await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM payments p
    JOIN subscriptions s ON s.id = p.subscription_id
    WHERE s.plan_id=?
  `).bind(planId).first())?.n || 0;
  const students = (await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM students st
    JOIN subscriptions s ON s.student_id = st.id
    WHERE s.plan_id=?
  `).bind(planId).first())?.n || 0;
  const has = subscription > 0 || financial > 0 || payments > 0 || students > 0;
  return { has, subscription, financial, payments, students };
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return new Uint8Array();
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function webPushConfiguration(env) {
  const publicKey = typeof env.WEB_PUSH_VAPID_PUBLIC_KEY === "string" ? env.WEB_PUSH_VAPID_PUBLIC_KEY.trim() : "";
  const privateKey = typeof env.WEB_PUSH_VAPID_PRIVATE_KEY === "string" ? env.WEB_PUSH_VAPID_PRIVATE_KEY.trim() : "";
  const subject = typeof env.WEB_PUSH_SUBJECT === "string" ? env.WEB_PUSH_SUBJECT.trim() : "";
  let publicKeyBytes;
  let privateKeyBytes;
  try {
    publicKeyBytes = base64UrlDecode(publicKey);
    privateKeyBytes = base64UrlDecode(privateKey);
  } catch {}
  const subjectValid = subject.startsWith("mailto:") || subject.startsWith("https://");
  return {
    available: publicKeyBytes?.length === 65 && publicKeyBytes[0] === 4 && privateKeyBytes?.length === 32 && subjectValid,
    publicKey: publicKeyBytes?.length === 65 && publicKeyBytes[0] === 4 ? publicKey : "",
    privateKey,
    subject,
  };
}

function allowedPushEndpoint(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const supportedHost = host === "fcm.googleapis.com"
      || host === "web.push.apple.com"
      || host === "notify.windows.com"
      || host.endsWith(".notify.windows.com")
      || host === "push.services.mozilla.com"
      || host.endsWith(".push.services.mozilla.com");
    return url.protocol === "https:" && !url.username && !url.password && supportedHost && url.href.length <= 4096 ? url : null;
  } catch { return null; }
}

function safePushPath(value) {
  return typeof value === "string" && /^\/(?!\/)[^\u0000-\u001f]{0,190}$/.test(value) ? value : "/membros/";
}

async function hmacWebPushSha256(keyBytes, valueBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, valueBytes));
}

async function hkdfExpand(prk, info, length) {
  const result = new Uint8Array(length);
  let previous = new Uint8Array();
  let offset = 0;
  for (let counter = 1; offset < length; counter += 1) {
    const input = new Uint8Array(previous.length + info.length + 1);
    input.set(previous, 0);
    input.set(info, previous.length);
    input[input.length - 1] = counter;
    previous = await hmacWebPushSha256(prk, input);
    const take = Math.min(previous.length, length - offset);
    result.set(previous.subarray(0, take), offset);
    offset += take;
  }
  return result;
}

async function encryptWebPushPayload(subscription, payload) {
  const authSecret = base64UrlDecode(subscription.auth_secret || subscription.keys?.auth || "");
  const receiverPublicBytes = base64UrlDecode(subscription.p256dh || subscription.keys?.p256dh || "");
  if (authSecret.length < 16 || receiverPublicBytes.length !== 65 || receiverPublicBytes[0] !== 4) throw new Error("Inscrição Web Push inválida.");
  const receiverPublic = await crypto.subtle.importKey("raw", receiverPublicBytes, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ephemeralPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: receiverPublic }, ephemeral.privateKey, 256));
  const keyInfoPrefix = new TextEncoder().encode("WebPush: info\0");
  const keyInfo = new Uint8Array(keyInfoPrefix.length + receiverPublicBytes.length + ephemeralPublic.length);
  keyInfo.set(keyInfoPrefix, 0);
  keyInfo.set(receiverPublicBytes, keyInfoPrefix.length);
  keyInfo.set(ephemeralPublic, keyInfoPrefix.length + receiverPublicBytes.length);
  const authPrk = await hmacWebPushSha256(authSecret, sharedSecret);
  const inputKeyMaterial = await hkdfExpand(authPrk, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacWebPushSha256(salt, inputKeyMaterial);
  const contentKey = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const plaintext = new TextEncoder().encode(`${JSON.stringify(payload)}\u0002`);
  const aesKey = await crypto.subtle.importKey("raw", contentKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext));
  const header = new Uint8Array(16 + 4 + 1 + ephemeralPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = ephemeralPublic.length;
  header.set(ephemeralPublic, 21);
  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header, 0);
  body.set(ciphertext, header.length);
  return body;
}

async function vapidAuthorization(env, audience) {
  const config = webPushConfiguration(env);
  if (!config.available) return null;
  const publicBytes = base64UrlDecode(config.publicKey);
  const jwk = {
    kty: "EC", crv: "P-256",
    x: base64UrlEncode(publicBytes.subarray(1, 33)),
    y: base64UrlEncode(publicBytes.subarray(33, 65)),
    d: config.privateKey,
    ext: true,
    key_ops: ["sign"],
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const encodePart = (value) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encodePart({ typ: "JWT", alg: "ES256" })}.${encodePart({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: config.subject })}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned)));
  return { token: `${unsigned}.${base64UrlEncode(signature)}`, publicKey: config.publicKey };
}

async function sendWebPush(env, subscription, notification) {
  const endpoint = allowedPushEndpoint(subscription.endpoint);
  const config = webPushConfiguration(env);
  if (!endpoint || !config.available) return { sent: false, invalid: !endpoint };
  try {
    const vapid = await vapidAuthorization(env, endpoint.origin);
    const body = await encryptWebPushPayload(subscription, createPushNotificationPayload({
      ...notification,
      path: safePushPath(notification.path),
    }));
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${vapid.token}, k=${vapid.publicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "60",
        Urgency: "normal",
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    return { sent: response.ok, invalid: response.status === 404 || response.status === 410 };
  } catch {
    return { sent: false, invalid: false };
  }
}

async function sendPushToRecipient(env, recipient, notification) {
  if (!webPushConfiguration(env).available) return;
  let results = [];
  try { results = (await env.DB.prepare("SELECT endpoint_hash, endpoint, p256dh, auth_secret FROM push_subscriptions WHERE owner_user_id=?").bind(recipient).all()).results || []; }
  catch { return; }
  await Promise.allSettled((results || []).map(async (subscription) => {
    const result = await sendWebPush(env, subscription, notification);
    if (result.invalid) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint_hash=?").bind(subscription.endpoint_hash).run();
  }));
}

function notificationAccountId(value) {
  return String(value || "").replace(/^app:/, "");
}

async function notificationStudentContext(env, recipient, path) {
  let target;
  try { target = new URL(path, "https://jm.local"); } catch { return { authorized: false }; }
  const rawStudentId = target.searchParams.get("student_id");
  if (!rawStudentId) return { authorized: true, student: null, professional: false };
  if (!/^\d{1,10}$/.test(rawStudentId) || Number(rawStudentId) < 1) return { authorized: false };
  const student = await env.DB.prepare("SELECT id, display_name, username, user_id, owner_user_id FROM students WHERE id=?").bind(Number(rawStudentId)).first();
  if (!student) return { authorized: false };
  const recipientAccountId = notificationAccountId(recipient);
  if (student.owner_user_id && notificationAccountId(student.owner_user_id) === recipientAccountId) return { authorized: true, student, professional: true };
  if (student.user_id && notificationAccountId(student.user_id) === recipientAccountId) return { authorized: true, student, professional: false };
  const accountId = recipientAccountId;
  const account = await env.DB.prepare("SELECT role, student_id FROM app_users WHERE id=? AND status='ativo'").bind(accountId).first();
  if (account?.role === "student" && Number(account.student_id) === Number(student.id)) return { authorized: true, student, professional: false };
  return { authorized: false };
}

function personalizeNotificationBody(body, student) {
  const name = String(student?.display_name || student?.username || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  const copy = String(body || "").trim();
  if (!name || !copy || copy.toLocaleLowerCase("pt-BR").startsWith(name.toLocaleLowerCase("pt-BR"))) return copy;
  return `${name}: ${copy}`.slice(0, 500);
}

async function notificationTargetStudentId(env, me, target) {
  const studentRole = me?.appUser?.role === "student";
  if (!me?.isOwner && !studentRole) return null;
  const rawStudentId = target.searchParams.get("student_id");
  if (rawStudentId && !/^\d{1,10}$/.test(rawStudentId)) return null;
  let studentId = rawStudentId ? Number(rawStudentId) : null;
  if (studentId && studentRole) {
    const ownStudent = await studentByUser(env, me.userId);
    if (!ownStudent || Number(ownStudent.id) !== studentId) return null;
  }
  const entityType = target.searchParams.get("entity_type") || (target.searchParams.has("appointment_id") ? "appointment" : "");
  const rawEntityId = target.searchParams.get("entity_id") || target.searchParams.get("appointment_id");
  if (entityType && !rawEntityId) return null;
  if (rawEntityId) {
    const eventId = rawEntityId;
    const eventQueries = {
      student: ["SELECT s.id AS student_id FROM students s WHERE s.id=?", [eventId]],
      anamnesis: ["SELECT a.student_id FROM anamnesis a JOIN students s ON s.id=a.student_id WHERE a.student_id=?", [eventId]],
      message: ["SELECT c.student_id FROM chat_messages c JOIN students s ON s.id=c.student_id WHERE c.id=?", [eventId]],
      appointment: ["SELECT a.student_id FROM appointments a JOIN students s ON s.id=a.student_id WHERE a.id=? AND a.status<>'excluido'", [eventId]],
      charge: ["SELECT f.student_id FROM financial_entries f JOIN students s ON s.id=f.student_id WHERE f.id=? AND f.deleted_at IS NULL", [eventId]],
      payment: ["SELECT p.student_id FROM payments p JOIN students s ON s.id=p.student_id WHERE p.id=?", [eventId]],
      checkout_order: ["SELECT co.student_id FROM checkout_orders co JOIN students s ON s.id=co.student_id WHERE co.id=?", [eventId]],
      subscription: ["SELECT sub.student_id FROM subscriptions sub JOIN students s ON s.id=sub.student_id WHERE sub.id=?", [eventId]],
      checkin: ["SELECT c.student_id FROM checkins c JOIN students s ON s.id=c.student_id WHERE c.id=?", [eventId]],
      evaluation: ["SELECT e.student_id FROM evaluations e JOIN students s ON s.id=e.student_id WHERE e.id=?", [eventId]],
      execution: ["SELECT e.student_id FROM executions e JOIN students s ON s.id=e.student_id WHERE e.id=?", [eventId]],
      video_review: ["SELECT v.student_id FROM video_reviews v JOIN students s ON s.id=v.student_id WHERE v.id=?", [eventId]],
      pain_record: ["SELECT p.student_id FROM pain_records p JOIN students s ON s.id=p.student_id WHERE p.id=?", [eventId]],
      workout_session: ["SELECT w.student_id FROM workout_sessions w JOIN students s ON s.id=w.student_id WHERE w.id=?", [eventId]],
    };
    const query = eventQueries[entityType];
    if (!query) return null;
    if (studentId) query[0] += " AND s.id=?";
    const args = studentId ? [...query[1], studentId] : query[1];
    if (me.isOwner) {
      query[0] += " AND s.owner_user_id IN (?,?)";
      args.push(me.userId, notificationAccountId(me.userId));
    }
    const event = await env.DB.prepare(query[0]).bind(...args).first();
    if (!event) return null;
    if (studentId && Number(event.student_id) !== studentId) return null;
    studentId = Number(event.student_id);
    if (studentRole && entityType === "message") {
      const source = await env.DB.prepare("SELECT sender FROM chat_messages WHERE id=? AND student_id=?").bind(eventId, studentId).first();
      if (source?.sender !== "professor") return null;
    }
  }
  if (!studentId) return entityType || rawStudentId ? null : 0;
  const studentQuery = me.isOwner
    ? await env.DB.prepare("SELECT id FROM students WHERE id=? AND owner_user_id IN (?,?)").bind(studentId, me.userId, notificationAccountId(me.userId)).first()
    : await env.DB.prepare("SELECT id FROM students WHERE id=?").bind(studentId).first();
  if (!studentQuery) return null;
  if (studentRole) {
    const ownStudent = await studentByUser(env, me.userId);
    if (!ownStudent || Number(ownStudent.id) !== studentId) return null;
  }
  return studentId;
}

async function notify(env, { recipients, title, body, path = "/", idempotencyKey, email = false, ctx = null }) {
  const safePath = safePushPath(path);
  const requestedRecipients = [...new Set((recipients || [])
    .filter((recipient) => typeof recipient === "string" && recipient.length > 0)
    .map((recipient) => recipient.startsWith("app:") ? recipient : `app:${recipient}`))];
  const recipientCopies = [];
  for (const recipient of requestedRecipients) {
    const target = await notificationStudentContext(env, recipient, safePath);
    if (!target.authorized) continue;
    const accountId = recipient.startsWith("app:") ? recipient.slice(4) : recipient;
    const account = await env.DB.prepare("SELECT role FROM app_users WHERE id=? AND status='ativo'").bind(accountId).first();
    const role = account?.role === "professional" && (target.professional || !new URL(safePath, "https://jm.local").searchParams.has("student_id"))
      ? "professional"
      : account?.role === "student" ? "student" : "";
    if (!role || !isSupportedNotificationPath(safePath, role)) continue;
    const routeAccess = await notificationTargetStudentId(env, {
      isOwner: role === "professional",
      appUser: { role },
      userId: recipient,
    }, new URL(safePath, "https://jm.local"));
    if (routeAccess === null) continue;
    recipientCopies.push({
      recipient,
      body: target.professional ? personalizeNotificationBody(body, target.student) : String(body || "").slice(0, 500),
    });
  }
  const uniqueRecipients = recipientCopies.map((item) => item.recipient);
  if (!uniqueRecipients.length || !idempotencyKey) return;
  const inserted = await env.DB.batch(uniqueRecipients.map((recipient) => env.DB.prepare(
    "INSERT OR IGNORE INTO internal_notifications (recipient_user_id, title, body, path, idempotency_key) VALUES (?, ?, ?, ?, ?)"
  ).bind(recipient, String(title).slice(0, 160), recipientCopies.find((item) => item.recipient === recipient)?.body || String(body).slice(0, 500), safePath.slice(0, 200), `${idempotencyKey}:${recipient}`)));

  const pushWork = [];
  for (let index = 0; index < uniqueRecipients.length; index += 1) {
    if (!Number(inserted?.[index]?.meta?.changes || 0)) continue;
    const recipient = uniqueRecipients[index];
    const notification = await env.DB.prepare(
      "SELECT id, title, body, path FROM internal_notifications WHERE recipient_user_id=? AND idempotency_key=?"
    ).bind(recipient, `${idempotencyKey}:${recipient}`).first();
    if (notification) pushWork.push(sendPushToRecipient(env, recipient, notification));
  }
  const pushDelivery = Promise.allSettled(pushWork);
  if (ctx?.waitUntil) ctx.waitUntil(pushDelivery);
  else await pushDelivery;

  // E-mail é opcional e só sai no staging quando Resend e destinatário estão configurados.
  // A notificação interna já foi persistida e nunca depende da disponibilidade do remetente.
  if (!email || env.APP_ENV !== "staging" || !env.EMAIL_SENDER_URL || !env.EMAIL_FROM || !env.EMAIL_SENDER_TOKEN || !env.APP_BASE_URL) return;
  for (const recipient of uniqueRecipients) {
    const notification = await env.DB.prepare(
      "SELECT id, title, body, path FROM internal_notifications WHERE recipient_user_id=? AND idempotency_key=?"
    ).bind(recipient, `${idempotencyKey}:${recipient}`).first();
    if (!notification) continue;
    const inserted = await env.DB.prepare(
      "INSERT OR IGNORE INTO notification_deliveries (notification_id, channel, status, attempts) VALUES (?, 'email', 'PENDING', 0)"
    ).bind(notification.id).run();
    if (!inserted.meta?.changes) continue;
    const delivery = sendNotificationEmail(env, notification.id, recipient, notification);
    if (ctx?.waitUntil) ctx.waitUntil(delivery);
    else await delivery;
  }
}

function mercadoPagoExpectedLiveMode(env) {
  if (env.APP_ENV === "production" && env.MP_MODE === "live") return true;
  if (["local", "staging"].includes(env.APP_ENV) && env.MP_MODE === "test") return false;
  return null;
}

function mercadoPagoModeMatches(env, liveMode) {
  const expected = mercadoPagoExpectedLiveMode(env);
  return expected !== null && typeof liveMode === "boolean" && liveMode === expected;
}

function mercadoPagoAccessToken(env) {
  return mercadoPagoExpectedLiveMode(env) === true ? env.MP_LIVE_ACCESS_TOKEN : env.MP_ACCESS_TOKEN;
}

function mercadoPagoWebhookSecret(env) {
  return mercadoPagoExpectedLiveMode(env) === true ? env.MP_LIVE_WEBHOOK_SECRET : env.MP_WEBHOOK_SECRET;
}

function paymentModeReady(env) {
  const liveMode = mercadoPagoExpectedLiveMode(env);
  if (liveMode === null) return false;
  const accessToken = liveMode ? env.MP_LIVE_ACCESS_TOKEN : env.MP_ACCESS_TOKEN;
  const webhookSecret = liveMode ? env.MP_LIVE_WEBHOOK_SECRET : env.MP_WEBHOOK_SECRET;
  return typeof accessToken === "string"
    && accessToken.trim().length > 0
    && accessToken.length <= 4096
    && typeof webhookSecret === "string"
    && webhookSecret.length >= 16
    && webhookSecret.length <= 512;
}

function checkoutAppOrigin(env) {
  try {
    const base = new URL(env.APP_BASE_URL);
    if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) return null;
    if (env.APP_ENV === "production") {
      const publicOrigin = new URL(env.PUBLIC_APP_ORIGIN);
      if (base.origin !== "https://jmperformance.app.br" || publicOrigin.origin !== base.origin
        || publicOrigin.protocol !== "https:" || publicOrigin.pathname !== "/" || publicOrigin.search || publicOrigin.hash
        || publicOrigin.username || publicOrigin.password) return null;
    } else if (env.APP_ENV === "staging") {
      const publicOrigin = new URL(env.PUBLIC_APP_ORIGIN);
      if (publicOrigin.protocol !== "https:" || publicOrigin.origin !== base.origin
        || publicOrigin.pathname !== "/" || publicOrigin.search || publicOrigin.hash
        || publicOrigin.username || publicOrigin.password) return null;
    }
    return base.origin;
  } catch { return null; }
}

function mpApiOrigin(env) {
  if (env.APP_ENV === "local" && env.MP_TEST_API_ORIGIN) {
    try {
      const candidate = new URL(env.MP_TEST_API_ORIGIN);
      if (candidate.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(candidate.hostname)
        && candidate.pathname === "/" && !candidate.search && !candidate.hash && !candidate.username && !candidate.password) {
        return candidate.origin;
      }
    } catch {}
    return null;
  }
  return "https://api.mercadopago.com";
}

function mpCheckoutUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    const marketplaceHost = parsed.hostname === "mercadopago.com.br"
      || parsed.hostname.endsWith(".mercadopago.com.br")
      || parsed.hostname === "mercadopago.com"
      || parsed.hostname.endsWith(".mercadopago.com");
    if (parsed.protocol !== "https:" || !marketplaceHost || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch { return null; }
}

async function mpApiFetch(env, path, init = {}) {
  const origin = mpApiOrigin(env);
  if (!origin || !paymentModeReady(env)) throw new Error("MP_CONFIGURATION");
  const response = await fetch(new URL(path, origin), {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${mercadoPagoAccessToken(env)}`,
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  if (text.length > 64 * 1024) throw new Error("MP_RESPONSE_TOO_LARGE");
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("MP_INVALID_RESPONSE"); }
  return { response, data };
}

function safeSignatureEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

async function verifyMercadoPagoSignature(signature, requestId, dataId, secret) {
  if (typeof signature !== "string" || signature.length > 512
    || typeof requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)
    || typeof dataId !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(dataId)
    || typeof secret !== "string" || !secret) return false;
  const fields = new Map();
  for (const segment of signature.split(",")) {
    const separator = segment.indexOf("=");
    if (separator < 1) return false;
    const key = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if ((key !== "ts" && key !== "v1") || fields.has(key)) return false;
    fields.set(key, value);
  }
  const timestamp = fields.get("ts");
  const providedHash = fields.get("v1");
  if (!timestamp || !/^\d{1,16}$/.test(timestamp) || !providedHash || !/^[a-f0-9]{64}$/i.test(providedHash)) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
  const expectedHash = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  return safeSignatureEqual(expectedHash, providedHash.toLowerCase());
}

async function readRequestTextLimited(request, maxBytes) {
  const advertised = Number(request.headers.get("content-length") || 0);
  if (advertised > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

async function sendNotificationEmail(env, notificationId, recipientId, notification) {
  let state = "FAILED";
  let errorCode = "network_error";
  try {
    const sender = new URL(env.EMAIL_SENDER_URL);
    const base = new URL(env.APP_BASE_URL);
    if (sender.protocol !== "https:" || base.protocol !== "https:" || sender.username || sender.password || base.username || base.password) {
      errorCode = "sender_configuration";
    } else {
      const appUserId = recipientId.startsWith("app:") ? recipientId.slice(4) : recipientId;
      const destination = await env.DB.prepare("SELECT email FROM app_users WHERE id=? AND role='professional' AND status='ativo'").bind(appUserId).first();
      if (!destination?.email) {
        errorCode = "missing_recipient";
      } else {
        const actionUrl = new URL(notification.path || "/", base.origin);
        const response = await fetch(sender.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.EMAIL_SENDER_TOKEN}`,
            "Idempotency-Key": `jm-notification-${notificationId}`,
          },
          body: JSON.stringify({
            from: env.EMAIL_FROM,
            to: destination.email,
            subject: String(notification.title).slice(0, 120),
            text: `${String(notification.body).slice(0, 400)}\n\nAcesse o JM Performance para agir: ${actionUrl.toString()}`,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          errorCode = `sender_http_${response.status}`;
        } else {
          state = "SENT";
          errorCode = null;
        }
      }
    }
  } catch (error) {
    errorCode = error?.name === "TimeoutError" ? "sender_timeout" : error?.message === "Invalid URL" ? "sender_configuration" : "network_error";
  }
  await env.DB.prepare("UPDATE notification_deliveries SET status=?, attempts=attempts+1, last_error_code=?, sent_at=CASE WHEN ?='SENT' THEN datetime('now') ELSE sent_at END, updated_at=datetime('now') WHERE notification_id=? AND channel='email'")
    .bind(state, errorCode, state, notificationId).run();
  if (state === "FAILED") console.warn(JSON.stringify({ event: "notification_email_failed", code: errorCode || "unknown" }));
}

function mercadoPagoAmountCents(value) {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value.toFixed(2)
    : typeof value === "string" ? value : "";
  const match = normalized.match(/^(\d{1,8})(?:\.(\d{1,2}))?$/);
  if (!match) return -1;
  return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
}

function mercadoPagoPaymentStatus(payment) {
  const status = String(payment?.status || "").toLowerCase();
  const detail = String(payment?.status_detail || "").toLowerCase();
  if (["charged_back", "in_mediation", "contested"].includes(status) || ["charged_back", "in_mediation"].includes(detail)) return "CONTESTED";
  if (["refunded", "partially_refunded"].includes(status) || detail === "partially_refunded") return "REFUNDED";
  if (["processed", "approved"].includes(status) && detail === "accredited") return "APPROVED";
  if (["failed", "rejected"].includes(status)) return "REJECTED";
  if (["canceled", "cancelled"].includes(status)) return "CANCELLED";
  if (["created", "processing", "in_process", "action_required", "authorized", "pending"].includes(status)) return "PENDING";
  return null;
}

function mercadoPagoOrderStatus(order) {
  const payments = Array.isArray(order?.transactions?.payments) ? order.transactions.payments : [];
  const paymentStatuses = payments.map((payment) => mercadoPagoPaymentStatus(payment));
  if (["charged_back", "in_mediation", "contested"].includes(String(order?.status || "").toLowerCase())
    || paymentStatuses.includes("CONTESTED")) return "CONTESTED";
  if (["refunded", "partially_refunded"].includes(String(order?.status || "").toLowerCase())
    || String(order?.status_detail || "").toLowerCase() === "partially_refunded"
    || paymentStatuses.includes("REFUNDED")) return "REFUNDED";
  if (["processed", "approved"].includes(String(order?.status || "").toLowerCase())) {
    const totalAmount = mercadoPagoAmountCents(order.total_amount);
    const fullyPaid = mercadoPagoAmountCents(order.total_paid_amount) >= 0
      && mercadoPagoAmountCents(order.total_paid_amount) === totalAmount;
    return String(order?.status_detail || "").toLowerCase() === "accredited"
      && fullyPaid && paymentStatuses.includes("APPROVED") ? "APPROVED" : null;
  }
  if (["failed", "rejected"].includes(String(order?.status || "").toLowerCase()) || paymentStatuses.includes("REJECTED")) return "REJECTED";
  if (["canceled", "cancelled"].includes(String(order?.status || "").toLowerCase()) || paymentStatuses.includes("CANCELLED")) return "CANCELLED";
  if (["created", "processing", "action_required", "pending"].includes(String(order?.status || "").toLowerCase())
    || paymentStatuses.includes("PENDING")) return "PENDING";
  return null;
}

async function processOrderWebhookEvent(env, eventId) {
  const claimed = await env.DB.prepare(
    "UPDATE payment_webhook_events SET status='PROCESSING', attempts=attempts+1, updated_at=datetime('now'), last_error_code=NULL " +
    "WHERE id=? AND attempts < 12 AND (status IN ('RECEIVED','FAILED') OR (status='PROCESSING' AND updated_at < datetime('now','-5 minutes')))"
  ).bind(eventId).run();
  if (!claimed.meta?.changes) return;
  const mark = async (status, code = null) => env.DB.prepare(
    "UPDATE payment_webhook_events SET status=?, processed_at=CASE WHEN ? IN ('PROCESSED','IGNORED') THEN datetime('now') ELSE processed_at END, last_error_code=?, updated_at=datetime('now') WHERE id=?"
  ).bind(status, status, code, eventId).run();
  try {
    const event = await env.DB.prepare("SELECT * FROM payment_webhook_events WHERE id=?").bind(eventId).first();
    if (!event || !paymentModeReady(env) || !mercadoPagoModeMatches(env, event.live_mode === 1)) {
      await mark("IGNORED", "environment_mismatch");
      return;
    }

    const result = await mpApiFetch(env, "/v1/orders/" + encodeURIComponent(event.resource_id));
    if (result.response.status === 404) {
      await mark("IGNORED", "order_not_found");
      console.info(JSON.stringify({ event: "mp_order_webhook_ignored", code: "order_not_found" }));
      return;
    }
    if (!result.response.ok) throw new Error("MP_API_HTTP_" + result.response.status);
    const providerOrder = result.data;
    const providerOrderId = typeof providerOrder?.id === "string" ? providerOrder.id : "";
    if (providerOrderId !== event.resource_id
      || (providerOrder?.live_mode !== undefined && !mercadoPagoModeMatches(env, providerOrder.live_mode))
      || providerOrder?.type !== "online" || providerOrder?.processing_mode !== "manual") {
      await mark("IGNORED", "order_environment_or_type_mismatch");
      return;
    }

    const externalReference = typeof providerOrder.external_reference === "string" ? providerOrder.external_reference : "";
    if (!/^[A-Za-z0-9]{1,64}$/.test(externalReference)) {
      await mark("IGNORED", "order_reference_missing");
      return;
    }
    const order = await env.DB.prepare([
      "SELECT co.*, s.owner_user_id, s.user_id AS student_user_id, au.student_id AS linked_student_id,",
      "c.amount_cents AS catalog_amount_cents, c.duration_days AS catalog_duration_days, c.currency AS catalog_currency",
      "FROM checkout_orders co",
      "JOIN students s ON s.id=co.student_id",
      "JOIN app_users au ON au.id=co.user_id",
      "JOIN checkout_plan_catalog c ON c.code=co.plan_code AND c.plan_id=co.plan_id",
      "WHERE co.external_reference=?"
    ].join("\n")).bind(externalReference).first();
    const plan = CHECKOUT_PLANS[order?.plan_code];
    const amountCents = mercadoPagoAmountCents(providerOrder.total_amount);
    const currency = providerOrder.currency || providerOrder.currency_id;
    if (!order || !plan || !order.owner_user_id || String(order.linked_student_id) !== String(order.student_id)
      || order.student_user_id !== "app:" + order.user_id
      || (order.provider_order_id && order.provider_order_id !== providerOrderId)
      || order.amount_cents !== plan.amountCents || order.duration_days !== plan.durationDays
      || order.catalog_amount_cents !== plan.amountCents || order.catalog_duration_days !== plan.durationDays
      || order.catalog_currency !== "BRL" || order.currency !== "BRL"
      || amountCents !== order.amount_cents || currency !== order.currency) {
      await mark("IGNORED", "order_reference_or_amount_mismatch");
      console.warn(JSON.stringify({ event: "mp_order_webhook_ignored", code: "order_reference_or_amount_mismatch" }));
      return;
    }

    const payments = Array.isArray(providerOrder?.transactions?.payments) ? providerOrder.transactions.payments : [];
    if (payments.some((payment) => {
      const amount = mercadoPagoAmountCents(payment?.amount ?? payment?.paid_amount);
      return (payment?.amount != null || payment?.paid_amount != null) && amount < 0;
    })) {
      await mark("IGNORED", "payment_amount_invalid");
      return;
    }
    const status = mercadoPagoOrderStatus(providerOrder);
    if (!status) {
      await mark("IGNORED", "unsupported_or_unverified_order_status");
      return;
    }
    const approvedPayment = payments.find((payment) => mercadoPagoPaymentStatus(payment) === "APPROVED");
    const approvedPaymentId = typeof approvedPayment?.id === "string" && /^[A-Za-z0-9]{1,64}$/.test(approvedPayment.id)
      ? approvedPayment.id : null;
    if (status === "APPROVED" && (!approvedPaymentId
      || mercadoPagoAmountCents(providerOrder.total_paid_amount) !== order.amount_cents)) {
      await mark("IGNORED", "approved_payment_reference_or_amount_mismatch");
      return;
    }

    const paymentStatements = [];
    for (const providerPayment of payments) {
      if (typeof providerPayment?.id !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(providerPayment.id)) continue;
      const paymentStatus = mercadoPagoPaymentStatus(providerPayment);
      if (!paymentStatus) continue;
      const paymentAmount = mercadoPagoAmountCents(providerPayment.amount ?? providerPayment.paid_amount ?? providerOrder.total_amount);
      if (paymentStatus === "APPROVED" && paymentAmount !== order.amount_cents) {
        await mark("IGNORED", "approved_payment_amount_mismatch");
        return;
      }
      const existingPayment = await env.DB.prepare("SELECT order_id FROM checkout_payments WHERE provider_payment_id=?")
        .bind(providerPayment.id).first();
      if (existingPayment && existingPayment.order_id !== order.id) {
        await mark("IGNORED", "payment_reference_changed");
        return;
      }
      const providerCreatedAt = typeof providerPayment.date_created === "string" ? providerPayment.date_created.slice(0, 40) : null;
      const providerUpdatedAt = typeof providerPayment.date_last_updated === "string" ? providerPayment.date_last_updated.slice(0, 40) : null;
      const providerApprovedAt = typeof providerPayment.date_approved === "string" ? providerPayment.date_approved.slice(0, 40) : null;
      paymentStatements.push(env.DB.prepare([
        "INSERT INTO checkout_payments (order_id, provider_payment_id, status, amount_cents, currency, external_reference, live_mode, provider_created_at, provider_updated_at, approved_at, refunded_at, contested_at)",
        "VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, CASE WHEN ?='REFUNDED' THEN datetime('now') ELSE NULL END, CASE WHEN ?='CONTESTED' THEN datetime('now') ELSE NULL END)",
        "ON CONFLICT(provider_payment_id) DO UPDATE SET",
        "order_id=excluded.order_id, status=excluded.status, amount_cents=excluded.amount_cents, currency=excluded.currency,",
        "external_reference=excluded.external_reference, live_mode=excluded.live_mode,",
        "provider_created_at=COALESCE(excluded.provider_created_at, checkout_payments.provider_created_at),",
        "provider_updated_at=COALESCE(excluded.provider_updated_at, checkout_payments.provider_updated_at),",
        "approved_at=COALESCE(excluded.approved_at, checkout_payments.approved_at),",
        "refunded_at=COALESCE(excluded.refunded_at, checkout_payments.refunded_at),",
        "contested_at=COALESCE(excluded.contested_at, checkout_payments.contested_at), updated_at=datetime('now')"
      ].join("\n")).bind(order.id, providerPayment.id, paymentStatus, paymentAmount, order.currency,
        externalReference, providerCreatedAt, providerUpdatedAt, providerApprovedAt, paymentStatus, paymentStatus));
    }

    const orderStatus = status === "PENDING" ? "WAITING_PAYMENT" : status;
    const providerStatus = String(providerOrder.status || "").slice(0, 40);
    const providerStatusDetail = String(providerOrder.status_detail || "").slice(0, 80);
    await env.DB.batch([
      ...paymentStatements,
      env.DB.prepare([
        "UPDATE checkout_orders SET",
        "status=CASE",
        "WHEN status='REFUNDED' AND ?<>'REFUNDED' THEN status",
        "WHEN status='CONTESTED' AND ? NOT IN ('REFUNDED','CONTESTED') THEN status",
        "WHEN status='APPROVED' AND ? IN ('WAITING_PAYMENT','REJECTED','CANCELLED') THEN status",
        "ELSE ? END,",
        "provider_order_id=COALESCE(provider_order_id, ?), provider_order_status=?, provider_status_detail=?,",
        "approved_payment_id=CASE WHEN ?='APPROVED' THEN COALESCE(approved_payment_id, ?) ELSE approved_payment_id END,",
        "approved_at=CASE WHEN ?='APPROVED' THEN COALESCE(approved_at, datetime('now')) ELSE approved_at END,",
        "updated_at=datetime('now') WHERE id=?"
      ].join("\n")).bind(orderStatus, orderStatus, orderStatus, orderStatus, providerOrderId, providerStatus,
        providerStatusDetail, status, approvedPaymentId, status, order.id),
      env.DB.prepare("UPDATE subscriptions SET status='ENDED', end_date=date('now','-1 day'), updated_at=datetime('now') " +
        "WHERE student_id=? AND status='ACTIVE' AND COALESCE(checkout_order_id,'')<>? " +
        "AND EXISTS (SELECT 1 FROM checkout_orders WHERE id=? AND status='APPROVED') " +
        "AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE checkout_order_id=?)")
        .bind(order.student_id, order.id, order.id, order.id),
      env.DB.prepare([
        "INSERT INTO subscriptions (student_id, plan_id, start_date, end_date, price_cents, status, auto_renew, user_id, checkout_order_id)",
        "SELECT student_id, plan_id, date('now'), date('now', printf('+%d days', duration_days-1)), amount_cents, 'ACTIVE', 0, user_id, id",
        "FROM checkout_orders WHERE id=? AND status='APPROVED'",
        "ON CONFLICT(checkout_order_id) DO NOTHING"
      ].join("\n")).bind(order.id),
      env.DB.prepare("UPDATE subscriptions SET status=?, updated_at=datetime('now') WHERE checkout_order_id=? AND ? IN ('REFUNDED','CONTESTED')")
        .bind(status, order.id, status),
      env.DB.prepare("UPDATE checkout_orders SET status='REFUNDED', updated_at=datetime('now') WHERE id=? AND ?='REFUNDED' AND status='CONTESTED'")
        .bind(order.id, status)
    ]);

    const currentOrder = await env.DB.prepare("SELECT status FROM checkout_orders WHERE id=?").bind(order.id).first();
    if (status === "APPROVED" && currentOrder?.status === "APPROVED") {
      await notify(env, {
        recipients: [order.owner_user_id],
        title: "Pagamento aprovado · iniciar acompanhamento",
        body: "O pagamento do plano foi aprovado. Inicie o acompanhamento do aluno.",
        path: "/financeiro?student_id=" + encodeURIComponent(String(order.student_id)) + "&entity_type=checkout_order&entity_id=" + encodeURIComponent(String(order.id)),
        idempotencyKey: "checkout-approved:" + order.id,
        email: true
      });
      await notify(env, {
        recipients: [String(order.user_id)],
        title: "Pagamento aprovado · plano ativo",
        body: "Seu pedido foi confirmado e o plano está ativo. Consulte seus próximos passos.",
        path: "/pagamentos?student_id=" + encodeURIComponent(String(order.student_id)) + "&entity_type=checkout_order&entity_id=" + encodeURIComponent(String(order.id)),
        idempotencyKey: "checkout-approved-student:" + order.id,
      });
    } else if (["REJECTED", "CANCELLED", "REFUNDED", "CONTESTED"].includes(status) && currentOrder?.status === status) {
      const labels = { REJECTED: "recusado", CANCELLED: "cancelado", REFUNDED: "reembolsado", CONTESTED: "contestado" };
      await notify(env, {
        recipients: [order.owner_user_id],
        title: "Pagamento " + labels[status],
        body: "O pagamento do plano foi " + labels[status] + ". Consulte o histórico financeiro.",
        path: "/financeiro?student_id=" + encodeURIComponent(String(order.student_id)) + "&entity_type=checkout_order&entity_id=" + encodeURIComponent(String(order.id)),
        idempotencyKey: "checkout-" + status.toLowerCase() + ":" + order.id,
        email: status === "REFUNDED" || status === "CONTESTED"
      });
      await notify(env, {
        recipients: [String(order.user_id)],
        title: "Pagamento " + labels[status],
        body: "O estado do seu pedido foi atualizado. Consulte o histórico financeiro para mais detalhes.",
        path: "/pagamentos?student_id=" + encodeURIComponent(String(order.student_id)) + "&entity_type=checkout_order&entity_id=" + encodeURIComponent(String(order.id)),
        idempotencyKey: "checkout-" + status.toLowerCase() + "-student:" + order.id,
      });
    }
    await mark("PROCESSED");
    console.info(JSON.stringify({ event: "mp_order_processed", status }));
  } catch (error) {
    const code = /^MP_API_HTTP_\d+$/.test(error?.message || "") ? error.message.toLowerCase()
      : error?.message === "MP_CONFIGURATION" ? "mp_configuration" : "processing_error";
    await mark("FAILED", code);
    console.warn(JSON.stringify({ event: "mp_order_webhook_processing_failed", code }));
  }
}
async function validateMercadoPagoOrderWebhook(request, payload, env) {
  if (!paymentModeReady(env) || !payload || typeof payload !== "object" || Array.isArray(payload) || payload.type !== "order") return null;
  const url = new URL(request.url);
  const resourceIds = url.searchParams.getAll("data.id");
  const dataId = resourceIds.length === 1 ? resourceIds[0] : "";
  const bodyId = typeof payload.data?.id === "string" ? payload.data.id : "";
  const types = url.searchParams.getAll("type");
  const requestId = request.headers.get("x-request-id") || "";
  const signature = request.headers.get("x-signature") || "";
  const signatureFields = new Map(signature.split(",").map((part) => {
    const index = part.indexOf("=");
    return index > 0 ? [part.slice(0, index).trim(), part.slice(index + 1).trim()] : ["", ""];
  }).filter(([key]) => key));
  const timestamp = signatureFields.get("ts") || "";
  const providerEventId = (typeof payload.id === "string" && /^\d{1,24}$/.test(payload.id))
    || (Number.isSafeInteger(payload.id) && payload.id > 0) ? String(payload.id) : null;
  const action = typeof payload.action === "string" && /^order\.[a-z_]{1,48}$/.test(payload.action) ? payload.action : "";
  if (!/^ORD[A-Za-z0-9]{8,61}$/i.test(dataId) || bodyId !== dataId || !mercadoPagoModeMatches(env, payload.live_mode)
    || types.length !== 1 || types[0] !== "order" || !providerEventId || !action
    || !(await verifyMercadoPagoSignature(signature, requestId, dataId, mercadoPagoWebhookSecret(env)))) {
    return null;
  }
  return { dataId, requestId, timestamp, providerEventId, action, liveMode: payload.live_mode };
}

async function handleMercadoPagoWebhook(request, env, ctx) {
  if (!paymentModeReady(env)) return new Response("Not found", { status: 404 });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const rawBody = await readRequestTextLimited(request, MP_MAX_WEBHOOK_BYTES);
  if (rawBody === null) return Response.json({ error: "Payload inválido." }, { status: 413 });
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return Response.json({ error: "Payload inválido." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.type !== "order") return Response.json({ received: true, ignored: true });
  const verified = await validateMercadoPagoOrderWebhook(request, payload, env);
  if (!verified) {
    console.warn(JSON.stringify({ event: "mp_webhook_rejected", code: "signature_or_payload_invalid" }));
    return Response.json({ error: "Notificação inválida." }, { status: 401 });
  }
  const { dataId, requestId, timestamp, providerEventId, action, liveMode } = verified;
  const eventKey = `mp-order-event:${providerEventId}`;
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO payment_webhook_events (event_key, provider_event_id, request_id, resource_id, action, signature_timestamp, live_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(eventKey.slice(0, 220), providerEventId, requestId, dataId, action, timestamp, liveMode ? 1 : 0).run();
  const event = await env.DB.prepare("SELECT id, status FROM payment_webhook_events WHERE event_key=?").bind(eventKey.slice(0, 220)).first();
  if (!event) return Response.json({ error: "Evento não persistido." }, { status: 503 });
  if (event.status === "RECEIVED" || event.status === "FAILED") {
    const processing = processOrderWebhookEvent(env, event.id).catch(() => {
      console.warn(JSON.stringify({ event: "mp_webhook_processing_failed", code: "unhandled_processing_error" }));
    });
    if (ctx?.waitUntil) ctx.waitUntil(processing);
    else await processing;
  }
  return Response.json({ received: true, duplicate: !inserted.meta?.changes }, { status: 200 });
}

async function runOrderWebhookQueue(env) {
  const { results } = await env.DB.prepare(`
    SELECT id FROM payment_webhook_events
    WHERE attempts < 12 AND (status IN ('RECEIVED','FAILED') OR (status='PROCESSING' AND updated_at < datetime('now','-5 minutes')))
    ORDER BY received_at LIMIT 5
  `).all();
  await Promise.all(results.map((event) => processOrderWebhookEvent(env, event.id)));
}

async function runPlanNotifications(env) {
  const { results: nearExperience } = await env.DB.prepare(`
    SELECT id, owner_user_id, display_name, username FROM students
    WHERE experience_started_at IS NOT NULL AND owner_user_id IS NOT NULL
      AND julianday(experience_ends_at) > julianday('now')
      AND julianday(experience_ends_at) <= julianday('now','+1 day')
    LIMIT 100
  `).all();
  for (const student of nearExperience) await notify(env, {
    recipients: [student.owner_user_id], title: "EXPERIENCE perto do fim",
    body: "Um período gratuito EXPERIENCE termina nas próximas 24 horas. Confira a conta e combine a continuidade, se necessário.",
    path: `/alunos?student_id=${student.id}&focus=profile&entity_type=student&entity_id=${student.id}`, idempotencyKey: `experience-ending-soon:${student.id}`,
  });
  const { results: expiredExperience } = await env.DB.prepare(`
    SELECT id, owner_user_id, display_name, username FROM students
    WHERE experience_started_at IS NOT NULL AND owner_user_id IS NOT NULL
      AND julianday(experience_ends_at) <= julianday('now')
    LIMIT 100
  `).all();
  for (const student of expiredExperience) await notify(env, {
    recipients: [student.owner_user_id], title: "EXPERIENCE encerrado",
    body: "O período gratuito EXPERIENCE terminou. Consulte a conta para combinar a continuidade manual.",
    path: `/alunos?student_id=${student.id}&focus=profile&entity_type=student&entity_id=${student.id}`, idempotencyKey: `experience-ended:${student.id}`,
  });
  const { results: expiredPlans } = await env.DB.prepare(`
    SELECT sub.id, sub.student_id, sub.end_date, st.owner_user_id, st.display_name, st.username
    FROM subscriptions sub JOIN students st ON st.id=sub.student_id
    WHERE sub.status='ACTIVE' AND sub.end_date IS NOT NULL AND sub.end_date < date('now') AND st.owner_user_id IS NOT NULL
    LIMIT 100
  `).all();
  for (const subscription of expiredPlans) await notify(env, {
    recipients: [subscription.owner_user_id], title: "Plano expirado",
    body: "Um plano terminou. Confira o acesso e combine manualmente a continuidade, se necessário.",
    path: `/financeiro?student_id=${subscription.student_id}&entity_type=subscription&entity_id=${subscription.id}`, idempotencyKey: `subscription-expired:${subscription.id}:${subscription.end_date}`,
  });
}

async function publicCheckoutOrder(env, orderId, userId) {
  return env.DB.prepare(`
    SELECT co.id, co.plan_code, co.amount_cents, co.currency, co.duration_days, co.status, co.checkout_url,
      co.created_at, co.updated_at, co.approved_at,
      COALESCE((SELECT cp.status FROM checkout_payments cp WHERE cp.order_id=co.id ORDER BY cp.id DESC LIMIT 1),
        CASE co.status WHEN 'WAITING_PAYMENT' THEN 'PENDING' WHEN 'APPROVED' THEN 'APPROVED' WHEN 'REJECTED' THEN 'REJECTED'
          WHEN 'CANCELLED' THEN 'CANCELLED' WHEN 'REFUNDED' THEN 'REFUNDED' WHEN 'CONTESTED' THEN 'CONTESTED' END) AS payment_status
    FROM checkout_orders co WHERE co.id=? AND co.user_id=?
  `).bind(orderId, userId).first();
}

async function createCheckoutOrder(env, { userId, student, planCode, clientKey }) {
  const plan = CHECKOUT_PLANS[planCode];
  if (!plan) return { error: "Este plano não está disponível no checkout.", status: 400 };
  if (!paymentModeReady(env)) return { error: "Checkout temporariamente indisponível.", status: 503 };
  const appOrigin = checkoutAppOrigin(env);
  if (!appOrigin) return { error: "Origem HTTPS do checkout não configurada para este ambiente.", status: 503 };
  const catalog = await env.DB.prepare("SELECT plan_id, amount_cents, duration_days, currency FROM checkout_plan_catalog WHERE code=?").bind(planCode).first();
  if (!catalog || catalog.amount_cents !== plan.amountCents || catalog.duration_days !== plan.durationDays || catalog.currency !== "BRL") {
    return { error: "Catálogo interno de planos indisponível.", status: 503 };
  }

  const existingByKey = await env.DB.prepare("SELECT id, plan_code, status, checkout_url FROM checkout_orders WHERE user_id=? AND client_idempotency_key=?")
    .bind(userId, clientKey).first();
  let orderId;
  if (existingByKey) {
    if (existingByKey.plan_code !== planCode) return { error: "A chave de idempotência já foi usada para outro plano.", status: 409 };
    if (existingByKey.checkout_url && existingByKey.status !== "PREFERENCE_FAILED") {
      return { orderId: existingByKey.id, checkoutUrl: existingByKey.checkout_url, reused: true };
    }
    if (!["CREATING", "PREFERENCE_FAILED"].includes(existingByKey.status)) {
      return { error: "Este pedido não pode ser reiniciado.", status: 409 };
    }
    orderId = existingByKey.id;
    await env.DB.prepare("UPDATE checkout_orders SET status='CREATING', updated_at=datetime('now') WHERE id=? AND status='PREFERENCE_FAILED'")
      .bind(orderId).run();
  } else {
    const active = await env.DB.prepare("SELECT id FROM subscriptions WHERE student_id=? AND status='ACTIVE' AND (end_date IS NULL OR end_date>=date('now')) ORDER BY id DESC LIMIT 1")
      .bind(student.id).first();
    if (active) return { error: "Você já possui um plano pago ativo.", status: 409 };
    const pendingOrder = await env.DB.prepare("SELECT id, status, checkout_url FROM checkout_orders WHERE user_id=? AND plan_code=? AND status IN ('CREATING','WAITING_PAYMENT') ORDER BY created_at DESC LIMIT 1")
      .bind(userId, planCode).first();
    if (pendingOrder?.checkout_url) return { orderId: pendingOrder.id, checkoutUrl: pendingOrder.checkout_url, reused: true };
    if (pendingOrder) return { error: "Um pedido deste plano está sendo preparado.", status: 409 };

    orderId = crypto.randomUUID();
    const externalReference = "JM" + orderId.replaceAll("-", "").toUpperCase();
    await env.DB.prepare(
      "INSERT INTO checkout_orders (id, user_id, student_id, plan_code, plan_id, amount_cents, currency, duration_days, external_reference, client_idempotency_key, status) " +
      "VALUES (?, ?, ?, ?, ?, ?, 'BRL', ?, ?, ?, 'CREATING')"
    ).bind(orderId, userId, student.id, planCode, catalog.plan_id, plan.amountCents, plan.durationDays, externalReference, clientKey).run();
  }

  const externalReference = "JM" + orderId.replaceAll("-", "").toUpperCase();
  const urls = {
    success: new URL("/membros/?checkout=success&order=" + encodeURIComponent(orderId), appOrigin).toString(),
    pending: new URL("/membros/?checkout=pending&order=" + encodeURIComponent(orderId), appOrigin).toString(),
    failure: new URL("/membros/?checkout=failure&order=" + encodeURIComponent(orderId), appOrigin).toString()
  };
  try {
    const result = await mpApiFetch(env, "/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Idempotency-Key": orderId },
      body: JSON.stringify({
        type: "online",
        total_amount: (plan.amountCents / 100).toFixed(2),
        external_reference: externalReference,
        processing_mode: "manual",
        capture_mode: "automatic_async",
        description: "JM Performance · " + planCode,
        config: { online: { success_url: urls.success, failure_url: urls.failure, pending_url: urls.pending, auto_return: "approved" } },
        items: [{
          external_code: planCode,
          title: "JM Performance · " + planCode,
          description: "Acompanhamento por " + plan.durationDays + " dias",
          quantity: 1,
          unit_price: (plan.amountCents / 100).toFixed(2)
        }]
      })
    });
    if (!result.response.ok) throw new Error("MP_API_HTTP_" + result.response.status);
    const data = result.data;
    const providerOrderId = typeof data?.id === "string" && /^ORD[A-Za-z0-9]{8,61}$/i.test(data.id) ? data.id : "";
    const checkoutUrl = mpCheckoutUrl(data?.checkout_url);
    if (!providerOrderId || !checkoutUrl || data.type !== "online" || data.processing_mode !== "manual"
      || data.external_reference !== externalReference || mercadoPagoAmountCents(data.total_amount) !== plan.amountCents
      || (data.currency && data.currency !== "BRL")
      || (data.live_mode !== undefined && !mercadoPagoModeMatches(env, data.live_mode))) throw new Error("MP_ORDER_INVALID");
    const saved = await env.DB.prepare(
      "UPDATE checkout_orders SET provider_order_id=?, provider_order_status=?, provider_status_detail=?, checkout_url=?, status='WAITING_PAYMENT', updated_at=datetime('now') WHERE id=? AND status='CREATING'"
    ).bind(providerOrderId, String(data.status || "created").slice(0, 40),
      typeof data.status_detail === "string" ? data.status_detail.slice(0, 80) : null, checkoutUrl, orderId).run();
    if (!saved.meta?.changes) throw new Error("MP_ORDER_PERSIST_FAILED");
  } catch (error) {
    await env.DB.prepare("UPDATE checkout_orders SET status='PREFERENCE_FAILED', updated_at=datetime('now') WHERE id=? AND status='CREATING'")
      .bind(orderId).run();
    const code = /^MP_API_HTTP_\d+$/.test(error?.message || "") ? error.message.toLowerCase() : "order_create_error";
    console.warn(JSON.stringify({ event: "mp_order_create_failed", code, plan: planCode }));
    return { error: "Não foi possível iniciar o checkout agora. Tente novamente.", status: 502 };
  }

  const savedOrder = await env.DB.prepare("SELECT checkout_url FROM checkout_orders WHERE id=? AND status='WAITING_PAYMENT'").bind(orderId).first();
  if (!savedOrder?.checkout_url) return { error: "Não foi possível salvar o pedido de pagamento.", status: 503 };
  await notify(env, {
    recipients: [student.owner_user_id].filter(Boolean),
    title: "Checkout criado · aguardando pagamento",
    body: "Um aluno iniciou o checkout. O pedido ainda aguarda confirmação.",
    path: `/financeiro?student_id=${student.id}&entity_type=checkout_order&entity_id=${encodeURIComponent(String(orderId))}`,
    idempotencyKey: "checkout-created:" + orderId
  });
  console.info(JSON.stringify({ event: "mp_order_created", plan: planCode }));
  return { orderId, checkoutUrl: savedOrder.checkout_url, reused: false };
}
async function professionalOwnsStudent(env, me, studentId) {
  if (!me?.isOwner || !Number.isInteger(Number(studentId))) return false;
  const student = await env.DB.prepare("SELECT owner_user_id FROM students WHERE id = ?").bind(Number(studentId)).first();
  if (!student) return false;
  return !!student.owner_user_id && student.owner_user_id === me.userId;
}

function slotIso(date, hour, minute) {
  // O horário de disponibilidade é sempre informado em America/Sao_Paulo,
  // mas é persistido como ISO UTC para comparações seguras no banco.
  const [year, month, day] = date.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = desired;
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo", hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(utc));
    const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const localAsUtc = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second);
    utc = desired - (localAsUtc - utc);
  }
  return new Date(utc).toISOString();
}

function nextDate(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function previousDate(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function saoDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const result = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${result.year}-${result.month}-${result.day}`;
}

function availabilitySlots(fromDate, toDate) {
  const output = [];
  const cursor = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const day = cursor.getUTCDay();
    const range = day === 5 ? [18, 22] : day === 6 ? [9, 14] : day === 0 ? [9, 12] : null;
    if (range) {
      for (let minutes = range[0] * 60; minutes < range[1] * 60; minutes += 20) {
        const start = slotIso(date, Math.floor(minutes / 60), minutes % 60);
        const endAt = slotIso(date, Math.floor((minutes + 20) / 60), (minutes + 20) % 60);
        output.push({ starts_at: start, ends_at: endAt });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return output;
}

async function validateCallSlot(env, startMs, endMs, appointmentId = null) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs - startMs !== 20 * 60000) {
    return "A chamada de acompanhamento deve usar exatamente um slot de 20 minutos.";
  }
  if (startMs <= Date.now()) return "Esse horário já passou.";
  const date = saoDate(new Date(startMs));
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const valid = availabilitySlots(date, date).some((slot) => slot.starts_at === startIso && slot.ends_at === endIso);
  if (!valid) return "Chamadas de acompanhamento só podem ser agendadas na sexta, sábado ou domingo, nos slots disponíveis de São Paulo.";
  const blocked = await env.DB.prepare("SELECT id FROM availability_blocks WHERE status='blocked' AND starts_at < ? AND ends_at > ? LIMIT 1").bind(endIso, startIso).first();
  if (blocked) return "Esse horário está bloqueado pelo profissional.";
  const busy = await env.DB.prepare("SELECT id FROM appointments WHERE id <> ? AND status IN ('agendado','confirmado') AND COALESCE(deleted_at, '') = '' AND starts_at < ? AND ends_at > ? LIMIT 1").bind(appointmentId || 0, endIso, startIso).first();
  if (busy) return "Já existe um atendimento nesse horário.";
  return null;
}

// Regra V1.3.3: o aluno pode agendar apenas UMA chamada de acompanhamento por janela de 7 dias.
// Considera chamadas agendadas, confirmadas e concluídas (não canceladas).
async function weeklyCallLimit(env, studentId, excludeAppointmentId = null) {
  const { results } = await env.DB.prepare(`
    SELECT id, starts_at, ends_at, status FROM appointments
    WHERE student_id = ? AND type = 'chamada_acompanhamento'
      AND status IN ('agendado', 'confirmado', 'concluido')
      AND COALESCE(deleted_at, '') = ''
      AND id <> ?
    ORDER BY starts_at ASC
  `).bind(studentId, excludeAppointmentId || 0).all();
  if (!results.length) return null;
  const now = Date.now();
  const sevenDays = 7 * 86400000;
  // A janela de 7 dias é baseada na última chamada agendada (horário local de São Paulo).
  const last = results[results.length - 1];
  const lastMs = new Date(last.starts_at).getTime();
  const windowEnd = lastMs + sevenDays;
  const hasUpcoming = results.some((a) => new Date(a.starts_at).getTime() > now);
  if (hasUpcoming) {
    const next = results.find((a) => new Date(a.starts_at).getTime() > now);
    return { blocked: true, reason: "upcoming", appointment: next };
  }
  if (now < windowEnd) {
    return { blocked: true, reason: "recent", appointment: last };
  }
  return null;
}

async function sendAppointmentReminders(env, ownerId) {
  const { results } = await env.DB.prepare(`
    SELECT a.id, a.starts_at, s.display_name, s.user_id
    FROM appointments a JOIN students s ON s.id = a.student_id
    WHERE a.status IN ('agendado', 'confirmado')
      AND a.starts_at > datetime('now')
      AND a.starts_at <= datetime('now', '+24 hours')
      AND s.user_id IS NOT NULL
  `).all();
  let sent = 0;
  for (const appointment of results) {
    const recipients = [appointment.user_id, ownerId].filter(Boolean);
    for (const recipient of recipients) {
      const { meta } = await env.DB.prepare("INSERT OR IGNORE INTO appointment_reminders (appointment_id, reminder_type, recipient_user_id) VALUES (?, '24h', ?)").bind(appointment.id, recipient).run();
      if (!meta.changes) continue;
      const when = new Date(appointment.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
    await notify(env, { recipients: [recipient], title: "Lembrete de agendamento", body: `${appointment.display_name || appointment.username || "Aluno"} tem um atendimento agendado.`, path: `/agenda?student_id=${appointment.student_id}&entity_type=appointment&appointment_id=${appointment.id}`, idempotencyKey: `appointment-reminder:${appointment.id}:24h:${recipient}` });
      sent += 1;
    }
  }
  return sent;
}

async function isCheckinDue(env, sid, checkins) {
  const cfg = await getCheckinConfig(env);
  const days = periodDays(cfg);
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const recent = checkins.find((c) => (c.answered_at || "").slice(0, 10) >= cutoff);
  return !recent;
}

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === MP_WEBHOOK_PATH) return handleMercadoPagoWebhook(request, env, ctx);
    if (["GET", "HEAD"].includes(request.method) && url.pathname === "/" && env.ASSETS) {
      const landingUrl = new URL("/landing/", url);
      return env.ASSETS.fetch(new Request(landingUrl, request));
    }
    if (["GET", "HEAD"].includes(request.method) && url.pathname === "/sw.js" && env.ASSETS) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      headers.set("Service-Worker-Allowed", "/");
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }
    if (request.method === "GET" && ["staging", "production"].includes(env.APP_ENV) && url.pathname === "/.well-known/assetlinks.json") {
      const fingerprints = env.APP_ENV === "production"
        ? ["26:AA:08:6A:61:8C:F5:87:F2:A8:95:32:4E:CE:E0:C3:85:D7:13:B0:CF:D6:04:51:70:55:D7:25:CA:AB:A6:1B"]
        : ["4B:AC:FD:EF:29:34:98:A4:AE:35:BA:9A:0A:EE:A9:D9:98:64:65:A0:2B:97:8C:93:4E:77:BB:0D:B9:53:C9:FE"];
      return Response.json([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "br.com.jmperformance.app",
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ], { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("origin");
      const referer = request.headers.get("referer");
      let suppliedOrigin = origin;
      if (!suppliedOrigin && referer) suppliedOrigin = (() => { try { return new URL(referer).origin; } catch { return null; } })();
      const expectedAuthOrigin = (() => {
  try {
    const parsed = new URL(env.PUBLIC_APP_ORIGIN);
    parsed.hostname = parsed.hostname.replace(/^www\./i, "");
    return parsed.origin;
  } catch {
    return null;
  }
})();
const receivedAuthOrigin = (() => {
  try {
    const parsed = new URL(suppliedOrigin);
    parsed.hostname = parsed.hostname.replace(/^www\./i, "");
    return parsed.origin;
  } catch {
    return null;
  }
})();
const rawOriginMismatch = !env.PUBLIC_APP_ORIGIN || suppliedOrigin !== env.PUBLIC_APP_ORIGIN;
const requestAuthOrigin = (() => { try { const parsed = new URL(request.url); parsed.hostname = parsed.hostname.replace(/^www\./i, ""); return parsed.origin; } catch { return null; } })();
      const fetchSite = request.headers.get("sec-fetch-site");
      const sameOriginFallback = !origin && !referer && fetchSite === "same-origin" && requestAuthOrigin === expectedAuthOrigin;
      // Instagram WebViews can keep an external Instagram Referer and mark the
      // request cross-site even when the page and API are on this canonical host.
      // For public auth entry points, trust the actual request host only when the
      // browser omitted Origin or sent an opaque Origin. Explicit foreign Origins
      // remain rejected, as do these fallbacks on every other route.
      const embeddedAuthPath = url.pathname === "/api/auth/login" || url.pathname === "/api/auth/signup";
      const embeddedAuthFallback = embeddedAuthPath && requestAuthOrigin === expectedAuthOrigin && (!origin || origin === "null");
      const userAgent = request.headers.get("user-agent") || "";
      const instagramWebView = /\bInstagram\b/i.test(userAgent) && /\bIABMV\/\d/i.test(userAgent);
      const instagramOriginAuthFallback = embeddedAuthPath && requestAuthOrigin === expectedAuthOrigin && instagramWebView && (() => {
        try {
          const parsed = new URL(origin);
          return parsed.protocol === "https:" && (parsed.hostname === "instagram.com" || parsed.hostname.endsWith(".instagram.com"));
        } catch {
          return false;
        }
      })();
      if (rawOriginMismatch && (!expectedAuthOrigin || receivedAuthOrigin !== expectedAuthOrigin) && !sameOriginFallback && !embeddedAuthFallback && !instagramOriginAuthFallback) return new Response("Forbidden", { status: 403 });
    }
    const me = await appAuth(env, request);
    const professorStudentPath = url.pathname.match(/^\/api\/professor\/students\/(\d+)(?:\/|$)/);
    if (professorStudentPath && me.isOwner && !(await professionalOwnsStudent(env, me, Number(professorStudentPath[1])))) {
      return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
    }

    // ---- Quem sou eu / sessão + papel ----
    if (request.method === "GET" && url.pathname === "/api/me") {
      const sessionHeaders = { "Cache-Control": "private, no-store" };
      if (!me.signedIn) return Response.json({ signedIn: false, appAuth: false }, { headers: sessionHeaders });

      let role = null;
      let student = null;
      if (me.isOwner) {
        role = "professor";
        const preview = await previewStudent(env, request, me);
        if (preview) {
          student = preview;
          role = "aluno";
        }
      } else {
        student = await studentByUser(env, me.userId);
        if (student) role = "aluno";
      }
      return Response.json({
        signedIn: true,
        appAuth: !!me.appAuth,
        professionalAccessConfigured: !!me.appAuth && me.appUser.role === "professional",
        userId: me.userId,
        username: me.username,
        isOwner: me.isOwner,
        role,
        student,
        access: student ? await studentAccess(env, student.id) : null,
      }, { headers: sessionHeaders });
    }

    // A expiração EXPERIENCE é validada em todas as rotas de dados do aluno.
    // Perfil e financeiro continuam disponíveis para consulta e continuidade manual.
    if (me.appAuth && me.appUser?.role === "student" && /^\/api\/student\/me(?:\/|$)/.test(url.pathname)) {
      const ownStudent = await studentByUser(env, me.userId);
      const access = ownStudent ? await studentAccess(env, ownStudent.id) : null;
      const allowedAfterExperience = new Set([
        "/api/student/me/profile",
        "/api/student/me/billing",
        "/api/student/me/payments",
      ]);
      if (access?.state === "experience_expired" && !allowedAfterExperience.has(url.pathname) && !/^\/api\/student\/me\/checkout(?:\/|$)/.test(url.pathname)) {
        return Response.json({
          error: "O período EXPERIENCE terminou. Fale com o profissional para combinar a continuidade manual.",
          code: "EXPERIENCE_EXPIRED",
          access,
        }, { status: 402, headers: { "Cache-Control": "private, no-store" } });
      }
    }

    if (url.pathname === "/api/notifications" && me.signedIn) {
      if (request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT id, title, body, path, read_at, created_at FROM internal_notifications WHERE recipient_user_id=? ORDER BY created_at DESC, id DESC LIMIT 50").bind(me.userId).all();
        return Response.json({ notifications: results });
      }
      if (request.method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        const id = Number(body.id);
        if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Notificação inválida." }, { status: 400 });
        const result = await env.DB.prepare("UPDATE internal_notifications SET read_at=COALESCE(read_at, datetime('now')) WHERE id=? AND recipient_user_id=?").bind(id, me.userId).run();
        if (!result.meta?.changes) return Response.json({ error: "Aviso não encontrado." }, { status: 404 });
        return Response.json({ ok: true });
      }
    }

    if (url.pathname === "/api/notifications/resolve" && request.method === "GET") {
      if (!me.signedIn || !me.appAuth) return Response.json({ valid: false, message: "Faça login para abrir este aviso." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
      const role = me.isOwner ? "professional" : me.appUser?.role === "student" ? "student" : "";
      const path = url.searchParams.get("path") || "";
      if (!role || !isSupportedNotificationPath(path, role)) {
        return Response.json({ valid: false, message: "Este aviso não aponta para uma tela disponível." }, { headers: { "Cache-Control": "private, no-store" } });
      }
      const target = new URL(path, url.origin);
      const studentId = await notificationTargetStudentId(env, me, target);
      if (studentId === null) {
        return Response.json({ valid: false, message: "Este registro não existe mais ou não está disponível para sua conta." }, { headers: { "Cache-Control": "private, no-store" } });
      }
      return Response.json({ valid: true }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (url.pathname === "/api/professor/chat/unread" && request.method === "GET") {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const unread = await env.DB.prepare("SELECT COUNT(*) AS count FROM chat_messages c JOIN students s ON s.id=c.student_id WHERE s.owner_user_id=? AND c.sender='student' AND c.read_at IS NULL").bind(me.userId).first();
      return Response.json({ unread_count: Number(unread?.count || 0) }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (url.pathname === "/api/push/config" && request.method === "GET") {
      if (!me.signedIn || !me.appAuth) return Response.json({ error: "Faça login para consultar as notificações." }, { status: 401 });
      const config = webPushConfiguration(env);
      return Response.json({ available: config.available, publicKey: config.available ? config.publicKey : "" }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (url.pathname === "/api/push/subscriptions") {
      if (!me.signedIn || !me.appAuth || !me.appUser?.id) return Response.json({ error: "Faça login para gerenciar as notificações." }, { status: 401 });
      const ownerUserId = `app:${me.appUser.id}`;
      if (request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT endpoint_hash, updated_at FROM push_subscriptions WHERE owner_user_id=? ORDER BY updated_at DESC").bind(ownerUserId).all();
        return Response.json({ subscriptions: (results || []).length }, { headers: { "Cache-Control": "private, no-store" } });
      }
      if (request.method !== "POST" && request.method !== "DELETE") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const rawBody = await readRequestTextLimited(request, 8192);
      if (rawBody === null) return Response.json({ error: "Solicitação muito grande." }, { status: 413 });
      let body;
      try { body = JSON.parse(rawBody || "{}"); } catch { return Response.json({ error: "Solicitação inválida." }, { status: 400 }); }
      const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
      const pushEndpoint = allowedPushEndpoint(endpoint);
      if (!pushEndpoint) return Response.json({ error: "Endpoint de push inválido ou não compatível." }, { status: 400 });
      const endpointHash = await sha256Hex(pushEndpoint.href);
      if (request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE owner_user_id=? AND endpoint_hash=?").bind(ownerUserId, endpointHash).run();
        return Response.json({ ok: true });
      }
      const config = webPushConfiguration(env);
      if (!config.available) return Response.json({ error: "Notificações push não estão configuradas neste ambiente." }, { status: 503 });
      if (await hitAuthRateLimit(env, "push-subscribe", ownerUserId, 20)) return Response.json({ error: "Muitas alterações de notificações. Tente novamente mais tarde." }, { status: 429 });
      const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
      const authSecret = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
      const publicBytes = base64UrlDecode(p256dh);
      const authBytes = base64UrlDecode(authSecret);
      if (publicBytes.length !== 65 || publicBytes[0] !== 4 || authBytes.length < 16 || authBytes.length > 64) {
        return Response.json({ error: "Chaves da inscrição push inválidas." }, { status: 400 });
      }
      await env.DB.prepare(`
        INSERT INTO push_subscriptions (endpoint_hash, owner_user_id, endpoint, p256dh, auth_secret)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(endpoint_hash) DO UPDATE SET owner_user_id=excluded.owner_user_id,
          endpoint=excluded.endpoint, p256dh=excluded.p256dh, auth_secret=excluded.auth_secret,
          updated_at=datetime('now')
      `).bind(endpointHash, ownerUserId, pushEndpoint.href, p256dh, authSecret).run();
      return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    }

    if (url.pathname === "/api/student/me/checkout/orders" || /^\/api\/student\/me\/checkout\/orders\/[a-f0-9-]{36}$/i.test(url.pathname)) {
      if (!me.signedIn || !me.appAuth) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
      if (me.appUser?.role !== "student") return Response.json({ error: "Somente o aluno pode acessar este checkout." }, { status: 403 });
      const student = await studentByUser(env, me.userId);
      if (!student || Number(me.appUser.student_id) !== Number(student.id)) return Response.json({ error: "Vínculo de aluno não encontrado." }, { status: 403 });
      if (url.pathname === "/api/student/me/checkout/orders" && request.method === "GET") {
        const { results } = await env.DB.prepare(`
          SELECT co.id, co.plan_code, co.amount_cents, co.currency, co.duration_days, co.status, co.checkout_url, co.created_at, co.updated_at, co.approved_at,
            COALESCE((SELECT cp.status FROM checkout_payments cp WHERE cp.order_id=co.id ORDER BY cp.id DESC LIMIT 1),
              CASE co.status WHEN 'WAITING_PAYMENT' THEN 'PENDING' WHEN 'APPROVED' THEN 'APPROVED' WHEN 'REJECTED' THEN 'REJECTED'
                WHEN 'CANCELLED' THEN 'CANCELLED' WHEN 'REFUNDED' THEN 'REFUNDED' WHEN 'CONTESTED' THEN 'CONTESTED' END) AS payment_status
          FROM checkout_orders co WHERE co.user_id=? ORDER BY co.created_at DESC LIMIT 20
        `).bind(me.appUser.id).all();
        return Response.json({ orders: results }, { headers: { "Cache-Control": "private, no-store" } });
      }
      const orderMatch = url.pathname.match(/^\/api\/student\/me\/checkout\/orders\/([a-f0-9-]{36})$/i);
      if (orderMatch && request.method === "GET") {
        const order = await publicCheckoutOrder(env, orderMatch[1], me.appUser.id);
        if (!order) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
        return Response.json({ order }, { headers: { "Cache-Control": "private, no-store" } });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    if (request.method === "POST" && url.pathname === "/api/student/me/checkout") {
      if (!me.signedIn || !me.appAuth) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
      if (me.appUser?.role !== "student") return Response.json({ error: "Somente o aluno pode contratar um plano." }, { status: 403 });
      const student = await studentByUser(env, me.userId);
      if (!student || Number(me.appUser.student_id) !== Number(student.id)) return Response.json({ error: "Vínculo de aluno não encontrado." }, { status: 403 });
      const rawBody = await readRequestTextLimited(request, 4096);
      if (rawBody === null) return Response.json({ error: "Solicitação muito grande." }, { status: 413 });
      let body;
      try { body = JSON.parse(rawBody || "{}"); } catch { return Response.json({ error: "Solicitação inválida." }, { status: 400 }); }
      const planCode = typeof body?.plan_code === "string" ? body.plan_code.trim().toUpperCase() : "";
      if (!Object.hasOwn(CHECKOUT_PLANS, planCode)) return Response.json({ error: "Somente EVOLVE e ASCEND estão disponíveis no checkout avulso." }, { status: 400 });
      const suppliedKey = request.headers.get("idempotency-key") || "";
      const clientKey = suppliedKey || crypto.randomUUID();
      if (clientKey.length > 128 || !/^[A-Za-z0-9._:-]{8,128}$/.test(clientKey)) return Response.json({ error: "Chave de idempotência inválida." }, { status: 400 });
      const result = await createCheckoutOrder(env, { userId: me.appUser.id, student, planCode, clientKey });
      if (result.error) return Response.json({ error: result.error }, { status: result.status });
      const order = await publicCheckoutOrder(env, result.orderId, me.appUser.id);
      return Response.json({ order, checkout_url: result.checkoutUrl, reused: result.reused }, { status: result.reused ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
    }

    if (request.method === "GET" && url.pathname === "/api/professor/checkout-orders") {
      if (!me.isOwner) return Response.json({ error: "Somente o profissional." }, { status: me.signedIn ? 403 : 401 });
      const studentId = Number(url.searchParams.get("student_id") || 0);
      if (!Number.isInteger(studentId) || studentId < 0) return Response.json({ error: "Filtro de aluno inválido." }, { status: 400 });
      const { results } = await env.DB.prepare(`
        SELECT co.id, co.student_id, st.display_name AS student_name, co.plan_code, co.amount_cents, co.currency, co.duration_days,
          co.status, co.created_at, co.updated_at, co.approved_at,
          COALESCE((SELECT cp.status FROM checkout_payments cp WHERE cp.order_id=co.id ORDER BY cp.id DESC LIMIT 1),
            CASE co.status WHEN 'WAITING_PAYMENT' THEN 'PENDING' WHEN 'APPROVED' THEN 'APPROVED' WHEN 'REJECTED' THEN 'REJECTED'
              WHEN 'CANCELLED' THEN 'CANCELLED' WHEN 'REFUNDED' THEN 'REFUNDED' WHEN 'CONTESTED' THEN 'CONTESTED' END) AS payment_status
        FROM checkout_orders co JOIN students st ON st.id=co.student_id
        WHERE st.owner_user_id=? AND (?=0 OR co.student_id=?)
        ORDER BY co.created_at DESC LIMIT 100
      `).bind(me.appUser.id, studentId, studentId).all();
      return Response.json({ orders: results });
    }

    // ---- Autenticação própria (login/logout) ----
    if (request.method === "POST" && url.pathname === "/api/auth/signup") {
      if (await hitAuthRateLimit(env, "signup-address", requestAddress(request), 5)) {
        return Response.json({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, { status: 429 });
      }
      const parsedBody = await request.json().catch(() => ({}));
      const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};
      const displayName = normalizeDisplayName(body.display_name ?? body.name);
      const email = normalizeEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      if (displayName.length < 2) return Response.json({ error: "Informe seu nome completo." }, { status: 400 });
      if (!validEmail(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
      if (password.length < 6 || password.length > 200) return Response.json({ error: "A senha deve ter entre 6 e 200 caracteres." }, { status: 400 });
      if (await hitAuthRateLimit(env, "signup-email", email, 5)) {
        return Response.json({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, { status: 429 });
      }

      // O retorno público é uniforme para cadastro novo, duplicado ou sem
      // profissional único. O papel e o vínculo nunca vêm do navegador.
      const genericSignup = () => Response.json({
        ok: true,
        message: "Se este e-mail já estiver cadastrado, use Entrar ou Esqueci minha senha; caso contrário, confira os dados.",
      }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
      const passwordRecord = await makePasswordRecord(password);
      const existing = await env.DB.prepare("SELECT id FROM app_users WHERE email=?").bind(email).first();
      if (!existing) {
        const professionals = (await env.DB.prepare("SELECT id FROM app_users WHERE role='professional' AND status='ativo' LIMIT 2").all()).results;
        if (professionals.length === 1) {
          const professionalId = professionals[0].id;
          const userId = "u_" + randomId();
          const profileUserId = "app:" + userId;
          const startedAt = new Date();
          const endsAt = new Date(startedAt.getTime() + 7 * 86400000);
          try {
            await env.DB.batch([
              env.DB.prepare(`
                INSERT INTO students (user_id, username, display_name, status, subscription_required, owner_user_id, experience_started_at, experience_ends_at)
                SELECT ?, NULL, ?, 'ativo', 0, ?, ?, ?
                WHERE (SELECT COUNT(*) FROM app_users WHERE role='professional' AND status='ativo')=1
                  AND (SELECT MIN(id) FROM app_users WHERE role='professional' AND status='ativo')=?
              `).bind(profileUserId, displayName, professionalId, startedAt.toISOString(), endsAt.toISOString(), professionalId),
              env.DB.prepare(`
                INSERT INTO app_users (id, username, email, password_hash, password_salt, password_iterations, password_format, role, student_id, display_name, status)
                VALUES (?, NULL, ?, ?,
                  CASE WHEN EXISTS (SELECT 1 FROM students WHERE user_id=? AND owner_user_id=?)
                    AND (SELECT COUNT(*) FROM app_users WHERE role='professional' AND status='ativo')=1
                    AND (SELECT MIN(id) FROM app_users WHERE role='professional' AND status='ativo')=?
                  THEN ? ELSE NULL END,
                  ?, ?, 'student', (SELECT id FROM students WHERE user_id=? AND owner_user_id=?), ?, 'ativo')
              `).bind(userId, email, passwordRecord.hash, profileUserId, professionalId, professionalId, passwordRecord.salt, passwordRecord.iterations, passwordRecord.format, profileUserId, professionalId, displayName),
            ]);
            const createdStudent = await studentByUser(env, profileUserId);
            if (createdStudent) {
              await log(env, {
                actorId: profileUserId,
                actorRole: "aluno",
                action: "student_self_signup",
                entity: "student",
                entityId: String(createdStudent.id),
                after: { role: "student", trial: "EXPERIENCE" },
              });
              await notify(env, {
                recipients: [professionalId], title: "Novo aluno cadastrado",
                body: `${createdStudent.display_name || createdStudent.username || "Um aluno"} se cadastrou e está pronto para iniciar o onboarding.`,
                path: `/alunos?student_id=${createdStudent.id}&focus=profile&entity_type=student&entity_id=${createdStudent.id}`, idempotencyKey: `student-created:${createdStudent.id}`,
              });
              await notify(env, {
                recipients: [professionalId], title: "EXPERIENCE iniciado",
                body: `${createdStudent.display_name || createdStudent.username || "Um novo aluno"} iniciou o período gratuito EXPERIENCE de 7 dias.`,
                path: `/alunos?student_id=${createdStudent.id}&focus=profile&entity_type=student&entity_id=${createdStudent.id}`, idempotencyKey: `experience-started:${createdStudent.id}`,
              });
            }
          } catch (error) {
            const message = String(error?.message || "").toLowerCase();
            if (!message.includes("unique constraint") && !message.includes("constraint failed")) throw error;
          }
        }
      }
      return genericSignup();
    }

    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const b = await request.json().catch(() => ({}));
      const identifier = normalizeIdentifier(b.identifier);
      const password = typeof b.password === "string" ? b.password : "";
      if (!identifier || !password) return Response.json({ error: "Informe usuário/e-mail e senha." }, { status: 400 });
      const attemptKeys = loginAttemptKeys(identifier, request);
      if (await loginBlocked(env, attemptKeys)) return Response.json({ error: "Credenciais inválidas." }, { status: 401 });
      const user = await findAppUserByIdentifier(env, identifier);
      if (!user) { await registerLoginFailure(env, attemptKeys); return Response.json({ error: "Credenciais inválidas." }, { status: 401 }); }
      if (user.status !== "ativo") { await registerLoginFailure(env, attemptKeys); return Response.json({ error: "Credenciais inválidas." }, { status: 401 }); }
      if (!(await verifyPassword(password, user.password_salt, user.password_hash, user.password_iterations, user.password_format))) {
        await registerLoginFailure(env, attemptKeys);
        return Response.json({ error: "Credenciais inválidas." }, { status: 401 });
      }
      if (Number(user.password_iterations) !== PBKDF2_ITERATIONS || user.password_format !== PASSWORD_FORMAT_CURRENT) {
        const upgraded = await makePasswordRecord(password);
        await env.DB.prepare("UPDATE app_users SET password_hash=?, password_salt=?, password_iterations=?, password_format=?, updated_at=datetime('now') WHERE id=?").bind(upgraded.hash, upgraded.salt, upgraded.iterations, upgraded.format, user.id).run();
      }
      const session = await createSession(env, user, attemptKeys);
      const safeUser = { id: user.id, username: user.username, email: user.email, role: user.role, student_id: user.student_id, display_name: user.display_name };
      let sessionMe = {
        signedIn: true,
        appAuth: true,
        professionalAccessConfigured: user.role === "professional",
        userId: "app:" + user.id,
        username: user.username,
        isOwner: user.role === "professional",
        role: user.role === "professional" ? "professor" : null,
        student: null,
        access: null,
      };
      if (user.role === "student") {
        const student = await studentByUser(env, "app:" + user.id);
        sessionMe = {
          ...sessionMe,
          role: student ? "aluno" : null,
          student,
          access: student ? await studentAccess(env, student.id) : null,
        };
      }
      return Response.json({ expires_at: session.expires_at, user: safeUser, me: sessionMe }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expires_at), "Cache-Control": "private, no-store" } });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      await destroySession(env, cookieValue(request, SESSION_COOKIE));
      return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
    }

    if (request.method === "GET" && url.pathname === "/api/auth/password/availability") {
      return Response.json(passwordRecoveryAvailability(env), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/password/forgot") {
      const availability = passwordRecoveryAvailability(env);
      if (!availability.available) {
        return Response.json({ error: availability.message, available: false }, {
          status: 503,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      if (await hitAuthRateLimit(env, "recovery-address", requestAddress(request), 5)) {
        return Response.json({ error: "Muitas solicitações. Aguarde antes de tentar novamente." }, { status: 429 });
      }
      const parsedBody = await request.json().catch(() => ({}));
      const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};
      const email = normalizeEmail(body.email);
      const neutralResponse = () => Response.json({
        ok: true,
        message: "Não é possível confirmar o envio para este endereço. Se não receber instruções, fale com o profissional.",
      }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
      if (!validEmail(email)) return neutralResponse();
      if (await hitAuthRateLimit(env, "recovery-email", email, 5)) {
        return Response.json({ error: "Muitas solicitações. Aguarde antes de tentar novamente." }, { status: 429 });
      }
      const user = await env.DB.prepare("SELECT id, email, display_name FROM app_users WHERE email=? AND status='ativo'").bind(email).first();
      if (!user) return neutralResponse();

      const token = newRecoveryToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await env.DB.batch([
        env.DB.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= ?").bind(new Date().toISOString()),
        env.DB.prepare("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)").bind(user.id, tokenHash, expiresAt),
      ]);
      const sent = await sendRecoveryEmail(env, user.email, user.display_name, token);
      if (!sent) {
        await env.DB.prepare("DELETE FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL").bind(tokenHash).run();
        return neutralResponse();
      }
      await env.DB.prepare("UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND token_hash<>? AND used_at IS NULL").bind(new Date().toISOString(), user.id, tokenHash).run();
      return neutralResponse();
    }

    if (request.method === "POST" && url.pathname === "/api/auth/password/reset") {
      if (await hitAuthRateLimit(env, "reset-address", requestAddress(request), 10)) {
        return Response.json({ error: "Muitas tentativas. Aguarde antes de tentar novamente." }, { status: 429 });
      }
      const parsedBody = await request.json().catch(() => ({}));
      const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};
      const token = typeof body.token === "string" && body.token.length <= 128 ? body.token : "";
      const newPassword = typeof body.new_password === "string" ? body.new_password : "";
      const confirmation = typeof body.new_password_confirmation === "string" ? body.new_password_confirmation : "";
      if (!token || !newPassword || !confirmation) return Response.json({ error: "O link é inválido ou expirou. Solicite uma nova redefinição." }, { status: 400 });
      if (newPassword.length < 6 || newPassword.length > 200) return Response.json({ error: "A senha deve ter entre 6 e 200 caracteres." }, { status: 400 });
      if (newPassword !== confirmation) return Response.json({ error: "As senhas não conferem." }, { status: 400 });
      const tokenHash = await sha256Hex(token);
      if (await hitAuthRateLimit(env, "reset-token", tokenHash, 10)) {
        return Response.json({ error: "Muitas tentativas. Solicite uma nova redefinição." }, { status: 429 });
      }
      const reset = await env.DB.prepare("SELECT user_id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>? ORDER BY id DESC LIMIT 1").bind(tokenHash, new Date().toISOString()).first();
      if (!reset) return Response.json({ error: "O link é inválido ou expirou. Solicite uma nova redefinição." }, { status: 400 });
      const user = await env.DB.prepare("SELECT id, role FROM app_users WHERE id=? AND status='ativo'").bind(reset.user_id).first();
      if (!user) return Response.json({ error: "O link é inválido ou expirou. Solicite uma nova redefinição." }, { status: 400 });
      const passwordRecord = await makePasswordRecord(newPassword);
      const consumeId = randomId();
      const usedAt = new Date().toISOString();
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE password_reset_tokens SET used_at=?, consume_id=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?").bind(usedAt, consumeId, tokenHash, usedAt),
        env.DB.prepare(`
          UPDATE app_users SET password_hash=?, password_salt=?, password_iterations=?, password_format=?, updated_at=datetime('now')
          WHERE id=? AND EXISTS (
            SELECT 1 FROM password_reset_tokens
            WHERE token_hash=? AND user_id=? AND consume_id=? AND used_at=?
          )
        `).bind(passwordRecord.hash, passwordRecord.salt, passwordRecord.iterations, passwordRecord.format, user.id, tokenHash, user.id, consumeId, usedAt),
        env.DB.prepare(`
          DELETE FROM auth_sessions WHERE user_id=? AND EXISTS (
            SELECT 1 FROM password_reset_tokens
            WHERE token_hash=? AND user_id=? AND consume_id=? AND used_at=?
          )
        `).bind(user.id, tokenHash, user.id, consumeId, usedAt),
      ]);
      if (!Number(results?.[1]?.meta?.changes || 0)) {
        return Response.json({ error: "O link é inválido ou expirou. Solicite uma nova redefinição." }, { status: 400 });
      }
      await log(env, {
        actorId: "app:" + user.id,
        actorRole: user.role === "professional" ? "professor" : "aluno",
        action: "recover_own_password",
        entity: "app_user",
        entityId: user.id,
        after: { password_changed: true },
      });
      return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "private, no-store" } });
    }

    // Troca autenticada da própria senha; o alvo é sempre a sessão atual.
    if (request.method === "POST" && url.pathname === "/api/auth/password/change") {
      if (!me.appAuth || !me.appUser?.id) return Response.json({ error: "Sessão necessária." }, { status: 401 });
      const body = await request.json().catch(() => ({}));
      if (body.user_id != null && String(body.user_id) !== String(me.appUser.id)) {
        return Response.json({ error: "Não é permitido alterar a senha de outra conta." }, { status: 403 });
      }
      const currentPassword = typeof body.current_password === "string" ? body.current_password : "";
      const newPassword = typeof body.new_password === "string" ? body.new_password : "";
      const confirmation = typeof body.new_password_confirmation === "string" ? body.new_password_confirmation : "";
      if (!currentPassword || !newPassword || !confirmation) return Response.json({ error: "Informe a senha atual, a nova senha e a confirmação." }, { status: 400 });
      if (newPassword.length < 6) return Response.json({ error: "A nova senha deve ter no mínimo 6 caracteres." }, { status: 400 });
      if (newPassword !== confirmation) return Response.json({ error: "As senhas não conferem." }, { status: 400 });
      if (currentPassword === newPassword) return Response.json({ error: "A nova senha deve ser diferente da atual." }, { status: 400 });
      if (!(await verifyPassword(currentPassword, me.appUser.password_salt, me.appUser.password_hash, me.appUser.password_iterations, me.appUser.password_format))) {
        return Response.json({ error: "Senha atual incorreta." }, { status: 401 });
      }
      const record = await makePasswordRecord(newPassword);
      await env.DB.batch([
        env.DB.prepare("UPDATE app_users SET password_hash=?, password_salt=?, password_iterations=?, password_format=?, updated_at=datetime('now') WHERE id=?").bind(record.hash, record.salt, record.iterations, record.format, me.appUser.id),
        env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(me.appUser.id),
      ]);
      await log(env, {
        actorId: me.userId,
        actorRole: me.appUser.role === "professional" ? "professor" : "aluno",
        action: "change_own_password",
        entity: "app_user",
        entityId: me.appUser.id,
        after: { password_changed: true },
      });
      return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
    }

    // Credenciais de acesso do profissional (login próprio do app, publicado).
    // Só o dono do projeto (via plataforma legada) ou o próprio profissional autenticado
    // pelo app pode definir/habilitar o acesso do painel.
    if (url.pathname === "/api/professor/auth/setup") {
      if (env.BOOTSTRAP_TOKEN !== request.headers.get("x-jm-bootstrap-token")) return Response.json({ error: "Configuração inicial desabilitada." }, { status: 403 });
      if (request.method !== "POST") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const b = await request.json().catch(() => ({}));
      const username = normalizeIdentifier(b.username);
      const email = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 160) || null : null;
      const password = typeof b.password === "string" ? b.password : "";
      if (!username && !email) return Response.json({ error: "Informe um usuário de acesso." }, { status: 400 });
      if (!password || password.length < 6) return Response.json({ error: "A senha deve ter no mínimo 6 caracteres." }, { status: 400 });

      const existingProfessional = await env.DB.prepare("SELECT id FROM app_users WHERE role = 'professional' LIMIT 1").first();
      if (existingProfessional) return Response.json({ error: "Bootstrap já utilizado." }, { status: 409 });
      const existing = null;
      const targetId = existing ? existing.id : "p_" + randomId();
      const record = await makePasswordRecord(password);

      // O claim singleton e a conta são gravados no mesmo batch atômico.
      // Assim, concorrência não pode criar uma segunda conta profissional.
      try {
        if (existing) {
          const clash = await env.DB.prepare("SELECT id FROM app_users WHERE id <> ? AND (username = ? OR (email IS NOT NULL AND ? IS NOT NULL AND email = ?))").bind(existing.id, username || null, email, email).first();
          if (clash) return Response.json({ error: "Este usuário/e-mail já está em uso." }, { status: 409 });
          await env.DB.prepare("UPDATE app_users SET username = ?, email = ?, password_hash = ?, password_salt = ?, password_iterations = ?, password_format = ?, status = 'ativo', updated_at = datetime('now') WHERE id = ?").bind(username || null, email || null, record.hash, record.salt, record.iterations, record.format, targetId).run();
        } else {
          await env.DB.batch([
            env.DB.prepare("INSERT INTO professional_bootstrap (id, user_id) VALUES (1, ?)").bind(targetId),
            env.DB.prepare("INSERT INTO app_users (id, username, email, password_hash, password_salt, password_iterations, password_format, role, display_name, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'professional', ?, 'ativo')").bind(targetId, username || null, email || null, record.hash, record.salt, record.iterations, record.format, BRAND.professionalName),
          ]);
        }
        const user = await env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(targetId).first();
        const session = await createSession(env, user);
        await log(env, { actorId: me.userId, actorRole: "professor", action: "setup_professional_access", entity: "app_user", entityId: targetId, after: { username: user.username, email: user.email } });
        return Response.json({ expires_at: session.expires_at, user: { id: user.id, username: user.username, email: user.email, role: user.role, student_id: user.student_id, display_name: user.display_name } }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expires_at) } });
      } catch (err) {
        if (String(err?.message || "").toLowerCase().includes("unique") || String(err?.message || "").toLowerCase().includes("constraint")) {
          return Response.json({ error: "Bootstrap já utilizado." }, { status: 409 });
        }
        console.error("setup_professional_access failed:", err && err.message);
        return Response.json({ error: "Não foi possível salvar as credenciais. Tente novamente." }, { status: 500 });
      }
    }

    // Revogação explícita do link de primeiro acesso, sem apagar histórico.
    const accessInviteRevokeMatch = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/access\/invite$/);
    if (accessInviteRevokeMatch) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      if (request.method !== "DELETE") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const studentId = Number(accessInviteRevokeMatch[1]);
      const student = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(studentId).first();
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      const result = await env.DB.prepare("UPDATE student_access_invites SET revoked_at = datetime('now') WHERE student_id = ? AND used_at IS NULL AND revoked_at IS NULL").bind(studentId).run();
      await log(env, { actorId: me.userId, actorRole: "professor", action: "revoke_student_access_invite", entity: "student", entityId: String(studentId), after: { revoked_count: Number(result.meta?.changes || 0) } });
      return Response.json({ ok: true, revoked_count: Number(result.meta?.changes || 0) });
    }

    // Acesso do aluno gerenciado pelo profissional (senha inicial ou convite).
    const studentAccessMatch = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/access$/);
    if (studentAccessMatch) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const studentId = Number(studentAccessMatch[1]);
      const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(studentId).first();
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      if (request.method !== "POST") return Response.json({ error: "Método não suportado." }, { status: 405 });

      const b = await request.json().catch(() => ({}));
      if (b.invite) {
        const existingInvite = (await env.DB.prepare("SELECT * FROM student_access_invites WHERE student_id = ? AND used_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY id DESC LIMIT 1").bind(studentId).first()) || null;
        if (existingInvite) return Response.json({ invitation: existingInvite, invite_url: `/invite-access/${existingInvite.token}` });
        const token = newToken();
        const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
        const { meta } = await env.DB.prepare("INSERT INTO student_access_invites (student_id, token, created_by, expires_at) VALUES (?, ?, ?, ?)").bind(studentId, token, me.userId, expiresAt).run();
        const invitation = await env.DB.prepare("SELECT * FROM student_access_invites WHERE id = ?").bind(Number(meta.last_row_id)).first();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "create_student_access_invite", entity: "student", entityId: String(studentId), after: { invite: true } });
        return Response.json({ invitation, invite_url: `/invite-access/${invitation.token}` }, { status: 201 });
      }

      const result = await upsertStudentAccess(env, studentId, { username: b.username, email: b.email, password: b.password });
      if (result.error) return Response.json({ error: result.error }, { status: 400 });
      await log(env, { actorId: me.userId, actorRole: "professor", action: result.created ? "create_student_access" : "update_student_access", entity: "app_user", entityId: result.user.id, after: { student_id: studentId, username: result.user.username, email: result.user.email } });
      return Response.json({ ok: true, created: result.created, user: { id: result.user.id, username: result.user.username, email: result.user.email, student_id: result.user.student_id } });
    }

    // Aluno define senha por convite (primeiro acesso sem conta plataforma legada).
    const claimMatch = url.pathname.match(/^\/api\/student\/access\/claim\/([a-zA-Z0-9_-]+)$/);
    if (claimMatch) {
      if (request.method !== "POST") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const b = await request.json().catch(() => ({}));
      const username = normalizeIdentifier(b.username);
      const password = typeof b.password === "string" ? b.password : "";
      if (!username || !password) return Response.json({ error: "Informe o usuário e defina uma senha." }, { status: 400 });
      if (password.length < 6) return Response.json({ error: "A senha deve ter no mínimo 6 caracteres." }, { status: 400 });
      const invitation = (await env.DB.prepare("SELECT * FROM student_access_invites WHERE token = ? AND used_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))").bind(claimMatch[1]).first()) || null;
      if (!invitation || invitation.used_at) return Response.json({ error: "Convite inválido ou já utilizado." }, { status: 404 });
      const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(invitation.student_id).first();
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });

      const existing = (await env.DB.prepare("SELECT * FROM app_users WHERE student_id = ?").bind(invitation.student_id).first()) || null;
      if (existing && existing.role !== "student") return Response.json({ error: "Este cadastro já tem acesso de profissional." }, { status: 403 });
      let usernameTaken = await env.DB.prepare("SELECT id FROM app_users WHERE username = ?").bind(username).first();
      if (usernameTaken && existing && usernameTaken.id === existing.id) usernameTaken = null;
      if (usernameTaken) return Response.json({ error: "Este usuário já está em uso." }, { status: 409 });

      const record = await makePasswordRecord(password);
      if (existing) {
        await env.DB.prepare("UPDATE app_users SET username = ?, password_hash = ?, password_salt = ?, password_iterations = ?, password_format = ?, status = 'ativo', updated_at = datetime('now') WHERE id = ?").bind(username, record.hash, record.salt, record.iterations, record.format, existing.id).run();
        const user = await env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(existing.id).first();
        const session = await createSession(env, user);
        await env.DB.prepare("UPDATE student_access_invites SET used_at = datetime('now') WHERE token = ?").bind(claimMatch[1]).run();
        return Response.json({ user: { id: user.id, username: user.username, role: user.role, student_id: user.student_id, display_name: user.display_name } }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expires_at) } });
      }
      const id = "u_" + crypto.randomUUID().replace(/-/g, "");
      await env.DB.batch([
        env.DB.prepare("INSERT INTO app_users (id, username, password_hash, password_salt, password_iterations, password_format, role, student_id, display_name, status) VALUES (?, ?, ?, ?, ?, ?, 'student', ?, ?, 'ativo')").bind(id, username, record.hash, record.salt, record.iterations, record.format, invitation.student_id, student.display_name || null),
        env.DB.prepare("UPDATE students SET user_id = ?, username = COALESCE(?, username), status = 'ativo', subscription_required = 1, updated_at = datetime('now') WHERE id = ?").bind("app:" + id, username, invitation.student_id),
      ]);
      const user = await env.DB.prepare("SELECT * FROM app_users WHERE id = ?").bind(id).first();
      const session = await createSession(env, user);
      await env.DB.prepare("UPDATE student_access_invites SET used_at = datetime('now') WHERE token = ?").bind(claimMatch[1]).run();
      await log(env, { actorId: me.userId, actorRole: "aluno", action: "claim_student_access", entity: "app_user", entityId: id, after: { student_id: invitation.student_id, username: user.username } });
      return Response.json({ user: { id: user.id, username: user.username, role: user.role, student_id: user.student_id, display_name: user.display_name } }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expires_at) } });
    }

    const profileFileMatch = url.pathname.match(/^\/api\/profile\/avatar\/(?!upload$)([a-zA-Z0-9_-]+)$/);
    if (profileFileMatch) {
      if (!me.signedIn) return request.method === "GET" ? new Response("Not found", { status: 404 }) : Response.json({ error: "Faça login para continuar." }, { status: 401 });
      const upload = await env.DB.prepare("SELECT * FROM profile_uploads WHERE token=? AND user_id=?").bind(profileFileMatch[1], me.userId).first();
      if (!upload) return request.method === "GET" ? new Response("Not found", { status: 404 }) : Response.json({ error: "Imagem não encontrada." }, { status: 404 });
      if (request.method === "GET") {
        if (!env.BLOB) return new Response("Not found", { status: 404 });
        const object = await env.BLOB.get(upload.object_key);
        if (!object) return new Response("Not found", { status: 404 });
        return new Response(object.body, { headers: { "content-type": upload.content_type, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
      }
      if (request.method === "DELETE") {
        if (!env.BLOB) return Response.json({ error: "Armazenamento privado indisponível." }, { status: 503 });
        const object = await env.BLOB.get(upload.object_key);
        if (!object) return Response.json({ error: "Arquivo da imagem não encontrado no armazenamento privado." }, { status: 404 });
        await env.BLOB.delete(upload.object_key);
        await env.DB.batch([
          env.DB.prepare("UPDATE professional_profiles SET avatar_url=NULL, updated_at=datetime('now') WHERE user_id=? AND avatar_url=?").bind(me.userId, `/api/profile/avatar/${upload.token}`),
          env.DB.prepare("DELETE FROM profile_uploads WHERE id=? AND user_id=?").bind(upload.id, me.userId),
        ]);
        await log(env, { actorId: me.userId, actorRole: me.isOwner ? "professor" : "aluno", action: "delete_profile_image", entity: "profile_upload", entityId: String(upload.id), before: { object_key: upload.object_key }, after: { deleted: true } });
        return Response.json({ ok: true, token: upload.token });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    if (request.method === "POST" && url.pathname === "/api/profile/avatar/upload") {
      if (!me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
      if (!env.BLOB) return Response.json({ error: "Armazenamento privado não configurado." }, { status: 503 });
      const contentType = (request.headers.get("content-type") || "").split(";")[0].toLowerCase();
      const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
      if (!allowed.has(contentType)) return Response.json({ error: "Use JPG, PNG ou WebP." }, { status: 400 });
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength < 16 || bytes.byteLength > 5 * 1024 * 1024) return Response.json({ error: "Imagem inválida ou maior que 5 MB." }, { status: 400 });
      const head = new Uint8Array(bytes.slice(0, 12));
      const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
      const webp = new TextDecoder().decode(head.slice(0, 4)) === "RIFF" && new TextDecoder().decode(head.slice(8, 12)) === "WEBP";
      if ((contentType === "image/jpeg" && !jpeg) || (contentType === "image/png" && !png) || (contentType === "image/webp" && !webp)) return Response.json({ error: "O conteúdo não corresponde ao tipo informado." }, { status: 400 });
      const token = newToken();
      const key = `profile/${randomId()}`;
      await env.BLOB.put(key, bytes, { httpMetadata: { contentType } });
      await env.DB.prepare("INSERT INTO profile_uploads (user_id, token, object_key, content_type, bytes) VALUES (?, ?, ?, ?, ?)").bind(me.userId, token, key, contentType, bytes.byteLength).run();
      return Response.json({ avatar_url: `/api/profile/avatar/${token}` });
    }

    // ---- Meu perfil profissional (somente o professor) ----
    if (url.pathname === "/api/student/me/profile") {
      const ownStudent = me.appUser?.role === "student" ? await studentByUser(env, me.userId) : null;
      if (!me.signedIn || !ownStudent) return Response.json({ error: "Perfil indisponível para esta conta." }, { status: me.signedIn ? 403 : 401 });
      const current = await env.DB.prepare("SELECT * FROM professional_profiles WHERE user_id=?").bind(me.userId).first();
      if (request.method === "GET") {
        const account = await env.DB.prepare("SELECT username, email, display_name FROM app_users WHERE id=? AND role='student'").bind(me.appUser.id).first();
        return Response.json({ profile: { name: ownStudent.display_name || account?.display_name || account?.username || "Aluno", username: account?.username || ownStudent.username || "", email: account?.email || null, phone: current?.phone || null, avatar_url: /^\/api\/profile\/avatar\/[a-zA-Z0-9_-]+$/.test(current?.avatar_url || "") ? current.avatar_url : null } }, { headers: { "Cache-Control": "private, no-store" } });
      }
      if (request.method === "PUT" || request.method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
        const name = clean(body.name, 160);
        const email = clean(body.email, 160).toLowerCase() || null;
        const phone = clean(body.phone, 60) || null;
        const avatar = body.avatar_url == null ? current?.avatar_url || null : clean(body.avatar_url, 2000);
        if (!name) return Response.json({ error: "Informe seu nome." }, { status: 400 });
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
        if (avatar && !/^\/api\/profile\/avatar\/[a-zA-Z0-9_-]+$/.test(avatar)) return Response.json({ error: "A foto precisa ser enviada pelo endpoint privado." }, { status: 400 });
        if (avatar) {
          const token = avatar.split("/").pop();
          const ownedUpload = await env.DB.prepare("SELECT id FROM profile_uploads WHERE token=? AND user_id=?").bind(token, me.userId).first();
          if (!ownedUpload) return Response.json({ error: "A foto não pertence a esta conta." }, { status: 400 });
        }
        const storedAvatar = avatar || null;
        await env.DB.batch([
          env.DB.prepare("UPDATE students SET display_name=?, updated_at=datetime('now') WHERE id=? AND user_id=?").bind(name, ownStudent.id, me.userId),
          env.DB.prepare("UPDATE app_users SET display_name=?, email=?, updated_at=datetime('now') WHERE id=? AND role='student'").bind(name, email, me.appUser.id),
          current ? env.DB.prepare("UPDATE professional_profiles SET name=?, email=?, phone=?, avatar_url=?, updated_at=datetime('now') WHERE user_id=?").bind(name, email, phone, storedAvatar, me.userId) : env.DB.prepare("INSERT INTO professional_profiles (user_id,name,username,email,phone,avatar_url) VALUES (?,?,?,?,?,?)").bind(me.userId, name, ownStudent.username || me.username || "", email, phone, storedAvatar),
        ]);
        await log(env, { actorId: me.userId, actorRole: "aluno", action: "update_student_profile", entity: "student_profile", entityId: String(ownStudent.id), after: { updated: true } });
        return Response.json({ profile: { name, username: me.username || ownStudent.username || "", email, phone, avatar_url: storedAvatar } }, { headers: { "Cache-Control": "private, no-store" } });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    if (url.pathname === "/api/professor/profile") {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const current = await env.DB.prepare("SELECT * FROM professional_profiles WHERE user_id=?").bind(me.userId).first();
      if (request.method === "GET") {
        const profile = current || {
          user_id: me.userId,
          name: me.username || "Professor",
          username: me.username || "",
          email: null,
          phone: null,
          cref: BRAND.cref,
          professional_info: null,
          avatar_url: null,
          status: "ativo",
        };
        return Response.json({ profile: { ...profile, avatar_url: /^\/api\/profile\/avatar\/[a-zA-Z0-9_-]+$/.test(profile.avatar_url || "") ? profile.avatar_url : null } });
      }
      if (request.method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        const clean = (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
        const avatar = body.avatar_url == null ? (current?.avatar_url || null) : clean(body.avatar_url, 2000);
        if (avatar && !/^\/api\/profile\/avatar\/[a-zA-Z0-9_-]+$/.test(avatar)) return Response.json({ error: "A foto precisa ser enviada pelo endpoint privado." }, { status: 400 });
        const next = {
          name: clean(body.name, 160) || current?.name || me.username || BRAND.professionalName,
          username: clean(body.username, 80).replace(/^@/, "") || current?.username || me.username || "",
          email: clean(body.email, 160) || null,
          phone: clean(body.phone, 60) || null,
          cref: clean(body.cref, 60) || current?.cref || BRAND.cref,
          professional_info: clean(body.professional_info, 1200) || null,
          avatar_url: avatar || null,
        };
        if (current) {
          await env.DB.prepare("UPDATE professional_profiles SET name=?, username=?, email=?, phone=?, cref=?, professional_info=?, avatar_url=?, updated_at=datetime('now') WHERE user_id=?").bind(next.name, next.username, next.email, next.phone, next.cref, next.professional_info, next.avatar_url, me.userId).run();
        } else {
          await env.DB.prepare("INSERT INTO professional_profiles (user_id, name, username, email, phone, cref, professional_info, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(me.userId, next.name, next.username, next.email, next.phone, next.cref, next.professional_info, next.avatar_url).run();
        }
        const profile = await env.DB.prepare("SELECT * FROM professional_profiles WHERE user_id=?").bind(me.userId).first();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "update_professional_profile", entity: "professional_profile", entityId: me.userId, before: current ? { exists: true } : null, after: { updated: true } });
        return Response.json({ profile: { ...profile, avatar_url: next.avatar_url } });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    // ---- Visualização do aluno pelo professor (somente Preview/uso administrativo) ----
    const previewMatch = url.pathname.match(/^\/api\/professor\/preview(?:\/([a-zA-Z0-9-]+))?$/);
    if (previewMatch) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      if (request.method === "POST") {
        const studentId = Number(previewMatch[1]);
        const student = Number.isInteger(studentId)
          ? await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(studentId).first()
          : null;
        if (!student || !(await professionalOwnsStudent(env, me, studentId))) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
        const token = crypto.randomUUID();
        const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare("INSERT INTO preview_sessions (token, owner_id, student_id, expires_at) VALUES (?, ?, ?, ?)").bind(token, me.userId, studentId, expires).run();
        return Response.json({
          token,
          expires_at: expires,
          student,
          access: await studentAccess(env, studentId),
        }, { status: 201 });
      }
      if (request.method === "DELETE" && previewMatch[1]) {
        await env.DB.prepare("DELETE FROM preview_sessions WHERE token = ? AND owner_id = ?").bind(previewMatch[1], me.userId).run();
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    const previewStatusMatch = url.pathname.match(/^\/api\/preview\/me$/);
    if (previewStatusMatch) {
      const preview = await previewStudent(env, request, me);
      if (!preview) return Response.json({ error: "Pré-visualização expirada." }, { status: 401 });
      return Response.json({ student: preview, access: await studentAccess(env, preview.id), preview: true });
    }
    // ---- Agendamentos (professor) ----
    const appointmentMatch = url.pathname.match(/^\/api\/professor\/appointments(?:\/(\d+))?$/);
    if (appointmentMatch && me.isOwner) {
      const appointmentId = appointmentMatch[1] ? Number(appointmentMatch[1]) : null;
      const appointmentStatuses = ["agendado", "confirmado", "concluido", "cancelado"];

      if (request.method === "GET") {
        if (appointmentId) {
          const appointment = await env.DB.prepare(
            "SELECT a.*, s.display_name AS student_name, s.username AS student_username FROM appointments a JOIN students s ON s.id = a.student_id WHERE a.id = ? AND s.owner_user_id = ?"
          ).bind(appointmentId, me.userId).first();
          if (!appointment) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
          return Response.json({ appointment });
        }

        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const status = url.searchParams.get("status");
        const studentId = url.searchParams.get("student_id");
        let sql = "SELECT a.*, s.display_name AS student_name, s.username AS student_username FROM appointments a JOIN students s ON s.id = a.student_id WHERE a.status <> 'excluido' AND s.owner_user_id = ?";
        const binds = [me.userId];
        if (from) { sql += " AND a.starts_at >= ?"; binds.push(from); }
        if (to) { sql += " AND a.starts_at < ?"; binds.push(to); }
        if (appointmentStatuses.includes(status)) { sql += " AND a.status = ?"; binds.push(status); }
        if (/^\d+$/.test(studentId || "")) { sql += " AND a.student_id = ?"; binds.push(Number(studentId)); }
        sql += " ORDER BY a.starts_at ASC, a.id ASC";
        const { results } = await env.DB.prepare(sql).bind(...binds).all();
        return Response.json({ appointments: results });
      }

      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const studentId = Number(body.student_id);
        const student = Number.isInteger(studentId)
          ? await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(studentId).first()
          : null;
        if (!student || !(await professionalOwnsStudent(env, me, studentId))) return Response.json({ error: "Selecione um aluno válido." }, { status: 400 });

        const type = appointmentType(typeof body.type === "string" ? body.type.trim() : "consultoria");
        const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : ({ chamada_acompanhamento: "Chamada de acompanhamento", avaliacao_fisica: "Avaliação física", reavaliacao: "Reavaliação", consultoria: "Atendimento / consultoria", outro: "Outro" }[type] || "Atendimento");
        const startsAt = typeof body.starts_at === "string" ? body.starts_at : "";
        const endsAt = typeof body.ends_at === "string" ? body.ends_at : "";
        const startMs = Date.parse(startsAt);
        const endMs = Date.parse(endsAt);
        const status = appointmentStatuses.includes(body.status) ? body.status : "agendado";
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          return Response.json({ error: "Informe um período válido para o atendimento." }, { status: 400 });
        }
        if (type === "chamada_acompanhamento" && (status === "agendado" || status === "confirmado")) {
          const callError = await validateCallSlot(env, startMs, endMs);
          if (callError) return Response.json({ error: callError }, { status: 400 });
        }
        const startIso = new Date(startMs).toISOString();
        const endIso = new Date(endMs).toISOString();
        let conflict = null;
        if (status === "agendado" || status === "confirmado") {
          conflict = await env.DB.prepare(
            "SELECT a.id FROM appointments a JOIN students s ON s.id = a.student_id WHERE s.owner_user_id = ? AND a.status IN ('agendado', 'confirmado') AND a.starts_at < ? AND a.ends_at > ? LIMIT 1"
          ).bind(me.userId, endIso, startIso).first();
        }
        if (conflict) return Response.json({ error: "Já existe um atendimento nesse horário." }, { status: 409 });
        const location = typeof body.location === "string" ? body.location.trim() : "";
        const notes = typeof body.notes === "string" ? body.notes.trim() : "";
        const evaluationId = body.evaluation_id == null ? null : Number(body.evaluation_id);
        if (evaluationId && !await env.DB.prepare("SELECT id FROM evaluations WHERE id=? AND student_id=?").bind(evaluationId, studentId).first()) return Response.json({ error: "Avaliação relacionada inválida." }, { status: 400 });
        const { meta } = await env.DB.prepare(
          "INSERT INTO appointments (student_id, title, type, starts_at, ends_at, status, location, notes, evaluation_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(studentId, title, type, startIso, endIso, status, location || null, notes || null, evaluationId || null, me.userId).run();
        await log(env, {
          actorId: me.userId,
          actorRole: "professor",
          action: "create_appointment",
          entity: "appointment",
          entityId: String(meta.last_row_id),
          after: { student_id: studentId, title, starts_at: startsAt, ends_at: endsAt, status },
        });
        const appointment = await env.DB.prepare(
          "SELECT a.*, s.display_name AS student_name, s.username AS student_username FROM appointments a JOIN students s ON s.id = a.student_id WHERE a.id = ? AND s.owner_user_id = ?"
        ).bind(Number(meta.last_row_id), me.userId).first();
        return Response.json({ appointment });
      }

      if (appointmentId && request.method === "PATCH") {
        const current = await env.DB.prepare("SELECT a.* FROM appointments a JOIN students s ON s.id=a.student_id WHERE a.id = ? AND s.owner_user_id=?").bind(appointmentId, me.userId).first();
        if (!current) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
        const body = await request.json().catch(() => ({}));
        const studentId = body.student_id == null ? current.student_id : Number(body.student_id);
        const student = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(studentId).first();
        if (!student || !(await professionalOwnsStudent(env, me, studentId))) return Response.json({ error: "Selecione um aluno válido." }, { status: 400 });
        const startsAt = typeof body.starts_at === "string" ? body.starts_at : current.starts_at;
        const endsAt = typeof body.ends_at === "string" ? body.ends_at : current.ends_at;
        const startMs = Date.parse(startsAt);
        const endMs = Date.parse(endsAt);
        const status = appointmentStatuses.includes(body.status) ? body.status : current.status;
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          return Response.json({ error: "Informe um período válido para o atendimento." }, { status: 400 });
        }
        const startIso = new Date(startMs).toISOString();
        const endIso = new Date(endMs).toISOString();
        let conflict = null;
        if (status === "agendado" || status === "confirmado") {
          conflict = await env.DB.prepare(
            "SELECT a.id FROM appointments a JOIN students s ON s.id=a.student_id WHERE a.id <> ? AND s.owner_user_id=? AND a.status IN ('agendado', 'confirmado') AND a.starts_at < ? AND a.ends_at > ? LIMIT 1"
          ).bind(appointmentId, me.userId, endIso, startIso).first();
        }
        if (conflict) return Response.json({ error: "Já existe um atendimento nesse horário." }, { status: 409 });
        const type = body.type == null ? appointmentType(current.type) : appointmentType(String(body.type).trim());
        const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : current.title;
        if (type === "chamada_acompanhamento" && (status === "agendado" || status === "confirmado")) {
          const callError = await validateCallSlot(env, startMs, endMs, appointmentId);
          if (callError) return Response.json({ error: callError }, { status: 400 });
        }
        const location = body.location == null ? current.location : String(body.location).trim();
        const notes = body.notes == null ? current.notes : String(body.notes).trim();
        const evaluationId = body.evaluation_id == null ? current.evaluation_id : Number(body.evaluation_id);
        if (evaluationId && !await env.DB.prepare("SELECT id FROM evaluations WHERE id=? AND student_id=?").bind(evaluationId, studentId).first()) return Response.json({ error: "Avaliação relacionada inválida." }, { status: 400 });
        await env.DB.prepare(
          "UPDATE appointments SET student_id = ?, title = ?, type = ?, starts_at = ?, ends_at = ?, status = ?, location = ?, notes = ?, evaluation_id = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(studentId, title, type, startIso, endIso, status, location || null, notes || null, evaluationId || null, appointmentId).run();
        await log(env, {
          actorId: me.userId,
          actorRole: "professor",
          action: "edit_appointment",
          entity: "appointment",
          entityId: String(appointmentId),
          before: current,
          after: { student_id: studentId, title, starts_at: startsAt, ends_at: endsAt, status },
        });
        const appointment = await env.DB.prepare(
          "SELECT a.*, s.display_name AS student_name, s.username AS student_username FROM appointments a JOIN students s ON s.id = a.student_id WHERE a.id = ? AND s.owner_user_id=?"
        ).bind(appointmentId, me.userId).first();
        return Response.json({ appointment });
      }

      if (appointmentId && request.method === "DELETE") {
        const current = await env.DB.prepare("SELECT a.* FROM appointments a JOIN students s ON s.id=a.student_id WHERE a.id = ? AND s.owner_user_id=?").bind(appointmentId, me.userId).first();
        if (!current) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
        await env.DB.prepare("UPDATE appointments SET status = 'excluido', deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(appointmentId).run();
        await log(env, {
          actorId: me.userId,
          actorRole: "professor",
          action: "delete_appointment",
          entity: "appointment",
          entityId: String(appointmentId),
          before: current,
        });
        return Response.json({ ok: true, deleted: true, archived: true });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }
    if (appointmentMatch && !me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });

    // Disponibilidade fixa da consultoria e bloqueios manuais do professor.
    const availabilityMatch = url.pathname.match(/^\/api\/professor\/availability(?:\/(\d+))?$/);
    if (availabilityMatch) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const blockId = availabilityMatch[1] ? Number(availabilityMatch[1]) : null;
      if (request.method === "GET") {
        const from = url.searchParams.get("from") || saoDate();
        const to = url.searchParams.get("to") || saoDate(new Date(Date.now() + 30 * 86400000));
        const slots = availabilitySlots(from, to);
        const rangeStart = slotIso(from, 0, 0); const rangeEnd = slotIso(nextDate(to), 0, 0);
        const { results: booked } = await env.DB.prepare("SELECT a.id, a.starts_at, a.ends_at, a.status FROM appointments a JOIN students s ON s.id=a.student_id WHERE s.owner_user_id=? AND a.status IN ('agendado','confirmado') AND a.starts_at < ? AND a.ends_at > ?").bind(me.userId, rangeEnd, rangeStart).all();
        const { results: blocked } = await env.DB.prepare("SELECT * FROM availability_blocks WHERE user_id=? AND status='blocked' AND starts_at < ? AND ends_at > ?").bind(me.userId, rangeEnd, rangeStart).all();
        return Response.json({ slots: slots.map((slot) => {
          const appointment = booked.find((b) => b.starts_at < slot.ends_at && b.ends_at > slot.starts_at);
          const block = blocked.find((b) => b.starts_at < slot.ends_at && b.ends_at > slot.starts_at);
          return { ...slot, status: appointment ? "occupied" : block ? "blocked" : "available", appointment_id: appointment?.id || null, block_id: block?.id || null };
        }) });
      }
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const startMs = Date.parse(b.starts_at); const endMs = Date.parse(b.ends_at);
        if (!Number.isFinite(startMs) || endMs - startMs !== 20 * 60000) return Response.json({ error: "O bloqueio deve ter exatamente 20 minutos." }, { status: 400 });
        const date = saoDate(new Date(startMs));
        if (!availabilitySlots(date, date).some((slot) => slot.starts_at === new Date(startMs).toISOString() && slot.ends_at === new Date(endMs).toISOString())) return Response.json({ error: "Esse horário não pertence à disponibilidade padrão." }, { status: 400 });
        const startIso = new Date(startMs).toISOString();
        const endIso = new Date(endMs).toISOString();
        const { meta } = await env.DB.prepare("INSERT INTO availability_blocks (starts_at, ends_at, user_id) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM appointments a JOIN students s ON s.id=a.student_id WHERE s.owner_user_id=? AND a.status IN ('agendado','confirmado') AND a.starts_at < ? AND a.ends_at > ?) AND NOT EXISTS (SELECT 1 FROM availability_blocks WHERE user_id=? AND status='blocked' AND starts_at < ? AND ends_at > ?)").bind(startIso, endIso, me.userId, me.userId, endIso, startIso, me.userId, endIso, startIso).run();
        if (!meta.changes) return Response.json({ error: "Não é possível bloquear um horário ocupado." }, { status: 409 });
        await log(env, { actorId: me.userId, actorRole: "professor", action: "block_availability", entity: "availability_block", entityId: String(meta.last_row_id), after: { starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString() } });
        return Response.json({ block: await env.DB.prepare("SELECT * FROM availability_blocks WHERE id=?").bind(Number(meta.last_row_id)).first() }, { status: 201 });
      }
      if (blockId && request.method === "DELETE") {
        const current = await env.DB.prepare("SELECT * FROM availability_blocks WHERE id=? AND user_id=?").bind(blockId, me.userId).first();
        if (!current) return Response.json({ error: "Bloqueio não encontrado." }, { status: 404 });
        await env.DB.prepare("UPDATE availability_blocks SET status='released' WHERE id=? AND user_id=?").bind(blockId, me.userId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "release_availability", entity: "availability_block", entityId: String(blockId), before: current, after: { status: "released" } });
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    // ---- Agendamentos (aluno, somente leitura) ----
    if (url.pathname === "/api/student/me/available-slots") {
      if (request.method !== "GET") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const student = await studentForRequest(env, request, me);
      if (!me.signedIn || !student) return Response.json({ error: "Sem vínculo de aluno." }, { status: 403 });
      if ((await studentAccess(env, student.id)).restricted) return Response.json({ error: "Acesso à agenda restrito pela assinatura." }, { status: 402 });
      const from = url.searchParams.get("from") || saoDate();
      const to = url.searchParams.get("to") || saoDate(new Date(Date.now() + 30 * 86400000));
      if (!isDateOnly(from) || !isDateOnly(to)) return Response.json({ error: "Período inválido." }, { status: 400 });
      const slots = availabilitySlots(from, to);
      const rangeStart = slotIso(from, 0, 0); const rangeEnd = slotIso(nextDate(to), 0, 0);
      const { results: booked } = await env.DB.prepare("SELECT a.starts_at, a.ends_at FROM appointments a JOIN students s ON s.id=a.student_id WHERE s.owner_user_id=? AND a.status IN ('agendado', 'confirmado') AND a.starts_at < ? AND a.ends_at > ?").bind(me.ownerId, rangeEnd, rangeStart).all();
      const { results: blocked } = await env.DB.prepare("SELECT starts_at, ends_at FROM availability_blocks WHERE user_id=? AND status = 'blocked' AND starts_at < ? AND ends_at > ?").bind(me.ownerId, rangeEnd, rangeStart).all();
      const now = Date.now();
      const available = slots.filter((slot) => Date.parse(slot.starts_at) > now && ![...booked, ...blocked].some((busy) => busy.starts_at < slot.ends_at && busy.ends_at > slot.starts_at));
      return Response.json({ slots: available });
    }

    if (request.method === "POST" && url.pathname === "/api/student/me/appointments/book") {
      const student = await studentForRequest(env, request, me);
      if (!me.signedIn || !student) return Response.json({ error: "Sem vínculo de aluno." }, { status: 403 });
      if ((await studentAccess(env, student.id)).restricted) return Response.json({ error: "Acesso restrito até a regularização da assinatura." }, { status: 402 });
      const body = await request.json().catch(() => ({}));
      const startsAt = typeof body.starts_at === "string" ? body.starts_at : "";
      const startMs = Date.parse(startsAt);
      if (!Number.isFinite(startMs)) return Response.json({ error: "Escolha um horário válido." }, { status: 400 });
      const start = new Date(startMs);
      const end = new Date(startMs + 20 * 60000);
      const callError = await validateCallSlot(env, startMs, end.getTime());
      if (callError) return Response.json({ error: callError }, { status: 409 });
      const weekly = await weeklyCallLimit(env, student.id);
      if (weekly?.blocked) {
        const a = weekly.appointment;
        const message = weekly.reason === "upcoming"
          ? "Você já possui uma chamada de acompanhamento agendada para esta semana."
          : "Você já realizou uma chamada de acompanhamento nos últimos 7 dias.";
        return Response.json({ error: message, existing_appointment: a, weekly: true }, { status: 409 });
      }
      const { meta } = await env.DB.prepare(`
        INSERT INTO appointments (student_id, title, type, starts_at, ends_at, status, booking_source, booked_by_user_id, user_id)
        SELECT ?, 'Chamada de acompanhamento', 'chamada_acompanhamento', ?, ?, 'agendado', 'student', ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM appointments a JOIN students s ON s.id=a.student_id WHERE s.owner_user_id=? AND a.status IN ('agendado', 'confirmado') AND a.starts_at < ? AND a.ends_at > ?
        ) AND NOT EXISTS (
          SELECT 1 FROM availability_blocks WHERE user_id=? AND status = 'blocked' AND starts_at < ? AND ends_at > ?
        )
      `).bind(student.id, start.toISOString(), end.toISOString(), me.userId, me.userId, me.ownerId, end.toISOString(), start.toISOString(), me.ownerId, end.toISOString(), start.toISOString()).run();
      if (!meta.changes) return Response.json({ error: "Esse horário acabou de ser reservado por outra pessoa." }, { status: 409 });
      const id = Number(meta.last_row_id);
      await log(env, { actorId: me.userId, actorRole: "aluno", action: "book_appointment", entity: "appointment", entityId: String(id), after: { student_id: student.id, starts_at: start.toISOString(), ends_at: end.toISOString() } });
      await notify(env, { recipients: [me.userId], title: "Agendamento confirmado", body: "Seu horário foi reservado.", path: `/agenda?student_id=${student.id}&entity_type=appointment&appointment_id=${id}`, idempotencyKey: `appointment-confirmed:${id}` });
      await notify(env, { recipients: [me.ownerId].filter(Boolean), title: "Novo agendamento recebido", body: `${student.display_name || student.username || "Aluno"} reservou um horário.`, path: `/agenda?student_id=${student.id}&entity_type=appointment&appointment_id=${id}`, idempotencyKey: `appointment-new:${id}` });
      return Response.json({ appointment: await env.DB.prepare("SELECT * FROM appointments WHERE id = ?").bind(id).first() }, { status: 201 });
    }

    const studentAppointmentId = url.pathname.match(/^\/api\/student\/me\/appointments\/(\d+)$/);
    if (studentAppointmentId) {
      const student = await studentForRequest(env, request, me);
      if (!me.signedIn || !student) return Response.json({ error: "Sem vínculo de aluno." }, { status: 403 });
      const id = Number(studentAppointmentId[1]);
      const current = await env.DB.prepare("SELECT * FROM appointments WHERE id = ? AND student_id = ?").bind(id, student.id).first();
      if (!current) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
      if (request.method === "GET") return Response.json({ appointment: current }, { headers: { "Cache-Control": "private, no-store" } });
      if (request.method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        if (body.status === "cancelado") {
          const cancelled = await env.DB.prepare("UPDATE appointments SET status = 'cancelado', updated_at = datetime('now') WHERE id = ? AND student_id = ? AND status IN ('agendado', 'confirmado')").bind(id, student.id).run();
          await log(env, { actorId: me.userId, actorRole: "aluno", action: "cancel_appointment", entity: "appointment", entityId: String(id), before: current, after: { status: "cancelado" } });
          if (cancelled.meta?.changes) await notify(env, {
            recipients: [me.ownerId].filter(Boolean), title: "Agendamento cancelado",
            body: "Um aluno cancelou um atendimento. Consulte a agenda para revisar o horário.",
            path: `/agenda?student_id=${student.id}&entity_type=appointment&appointment_id=${id}`, idempotencyKey: `appointment-cancelled:${id}:${current.updated_at}`,
          });
          return Response.json({ ok: true });
        }
        if (typeof body.starts_at === "string") {
          const startMs = Date.parse(body.starts_at); const endMs = startMs + 20 * 60000;
          const start = new Date(startMs); const end = new Date(endMs);
          const callError = await validateCallSlot(env, startMs, endMs, id);
          const busy = await env.DB.prepare("SELECT a.id FROM appointments a JOIN students s ON s.id=a.student_id WHERE a.id <> ? AND s.owner_user_id=? AND a.status IN ('agendado','confirmado') AND a.starts_at < ? AND a.ends_at > ? LIMIT 1").bind(id, me.ownerId, end.toISOString(), start.toISOString()).first();
          const blocked = await env.DB.prepare("SELECT id FROM availability_blocks WHERE user_id=? AND status='blocked' AND starts_at < ? AND ends_at > ? LIMIT 1").bind(me.ownerId, end.toISOString(), start.toISOString()).first();
          if (callError || busy || blocked) return Response.json({ error: callError || "O novo horário não está disponível." }, { status: 409 });
          await env.DB.prepare("UPDATE appointments SET starts_at=?, ends_at=?, status='agendado', updated_at=datetime('now') WHERE id=? AND student_id=?").bind(start.toISOString(), end.toISOString(), id, student.id).run();
          await log(env, { actorId: me.userId, actorRole: "aluno", action: "reschedule_appointment", entity: "appointment", entityId: String(id), before: current, after: { starts_at: start.toISOString(), ends_at: end.toISOString(), status: "agendado" } });
          await notify(env, { recipients: [me.ownerId].filter(Boolean), title: "Agendamento reagendado", body: `${student.display_name || student.username || "Aluno"} escolheu um novo horário.`, path: `/agenda?student_id=${student.id}&entity_type=appointment&appointment_id=${id}`, idempotencyKey: `appointment-rescheduled:${id}:${start.toISOString()}` });
          return Response.json({ appointment: await env.DB.prepare("SELECT * FROM appointments WHERE id=?").bind(id).first() });
        }
        return Response.json({ error: "Informe cancelamento ou um novo horário." }, { status: 400 });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    if (url.pathname === "/api/student/me/appointments") {
      if (request.method !== "GET") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const student = await studentForRequest(env, request, me);
      if (!me.signedIn || !student) return Response.json({ appointments: [] });
      const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString();
      const to = url.searchParams.get("to") || new Date(Date.now() + 180 * 86400000).toISOString();
      const { results } = await env.DB.prepare(
        "SELECT id, student_id, title, type, starts_at, ends_at, status, location, notes FROM appointments WHERE student_id = ? AND status <> 'excluido' AND starts_at >= ? AND starts_at < ? ORDER BY starts_at ASC"
      ).bind(student.id, from, to).all();
      return Response.json({ appointments: results });
    }

    // ---- Financeiro (professor) ----
    const financeMatch = url.pathname.match(/^\/api\/professor\/finance(?:\/(\d+))?$/);
    if (financeMatch && me.isOwner) {
      const entryId = financeMatch[1] ? Number(financeMatch[1]) : null;
      const financeStatuses = ["pendente", "pago", "atrasado", "cancelado"];

      if (request.method === "GET") {
        if (entryId) {
          const entry = await env.DB.prepare(
            "SELECT f.*, s.display_name AS student_name, s.username AS student_username, CASE WHEN f.status='pendente' AND f.due_date < date('now') THEN 'atrasado' ELSE f.status END AS effective_status FROM financial_entries f JOIN students s ON s.id = f.student_id WHERE f.deleted_at IS NULL AND f.id = ? AND s.owner_user_id=?"
          ).bind(entryId, me.userId).first();
          if (!entry) return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
          return Response.json({ entry });
        }

        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const status = url.searchParams.get("status");
        const studentId = url.searchParams.get("student_id");
        let sql = "SELECT f.*, s.display_name AS student_name, s.username AS student_username, CASE WHEN f.status='pendente' AND f.due_date < date('now') THEN 'atrasado' ELSE f.status END AS effective_status FROM financial_entries f JOIN students s ON s.id = f.student_id WHERE f.deleted_at IS NULL AND s.owner_user_id = ?";
        const binds = [me.userId];
        if (from) { sql += " AND f.due_date >= ?"; binds.push(from); }
        if (to) { sql += " AND f.due_date < ?"; binds.push(to); }
        if (status === "atrasado") {
          sql += " AND f.status = 'pendente' AND f.due_date < date('now')";
        } else if (financeStatuses.includes(status)) {
          sql += " AND f.status = ?";
          binds.push(status);
        }
        if (/^\d+$/.test(studentId || "")) { sql += " AND f.student_id = ?"; binds.push(Number(studentId)); }
        sql += " ORDER BY f.due_date ASC, f.id ASC";
        const { results } = await env.DB.prepare(sql).bind(...binds).all();

        let summarySql = "SELECT COALESCE(SUM(CASE WHEN f.status = 'pendente' AND f.due_date >= date('now') THEN f.amount_cents ELSE 0 END), 0) AS to_receive, COALESCE(SUM(CASE WHEN f.status = 'pendente' AND f.due_date < date('now') THEN f.amount_cents ELSE 0 END), 0) AS overdue FROM financial_entries f JOIN students s ON s.id=f.student_id WHERE f.deleted_at IS NULL AND s.owner_user_id=?";
        const summaryBinds = [me.userId];
        if (from) { summarySql += " AND due_date >= ?"; summaryBinds.push(from); }
        if (to) { summarySql += " AND due_date < ?"; summaryBinds.push(to); }
        if (/^\d+$/.test(studentId || "")) { summarySql += " AND student_id = ?"; summaryBinds.push(Number(studentId)); }
        const summary = await env.DB.prepare(summarySql).bind(...summaryBinds).first();
        const received = await env.DB.prepare("SELECT COALESCE(SUM(p.amount_cents), 0) AS value FROM payments p JOIN students s ON s.id=p.student_id WHERE s.owner_user_id=? AND p.status='PAID' AND COALESCE(p.received_at, p.paid_at, p.created_at) >= date('now','start of month')").bind(me.userId).first("value");
        return Response.json({
          entries: results,
          summary: {
            received: Number(received || 0),
            toReceive: Number(summary?.to_receive || 0),
            overdue: Number(summary?.overdue || 0),
          },
        });
      }

      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const studentId = Number(body.student_id);
        const student = Number.isInteger(studentId)
          ? await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(studentId).first()
          : null;
        if (!student || !(await professionalOwnsStudent(env, me, studentId))) return Response.json({ error: "Selecione um aluno válido." }, { status: 400 });
        const amountCents = Number(body.amount_cents);
        const dueDate = typeof body.due_date === "string" ? body.due_date : "";
        if (!Number.isInteger(amountCents) || amountCents <= 0) return Response.json({ error: "Informe um valor válido." }, { status: 400 });
        if (!isDateOnly(dueDate)) return Response.json({ error: "Informe uma data de vencimento válida." }, { status: 400 });
        const status = financeStatuses.includes(body.status) ? body.status : "pendente";
        const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : "Mensalidade";
        const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "mensalidade";
        const reference = typeof body.reference === "string" ? body.reference.trim() : "";
        const subscriptionId = body.subscription_id == null ? null : Number(body.subscription_id);
        if (subscriptionId && !await env.DB.prepare("SELECT id FROM subscriptions WHERE id=? AND student_id=?").bind(subscriptionId, studentId).first()) return Response.json({ error: "Assinatura inválida para este aluno." }, { status: 400 });
        const paymentMethod = typeof body.payment_method === "string" ? body.payment_method.trim() : "";
        const notes = typeof body.notes === "string" ? body.notes.trim() : "";
        const paidAt = status === "pago" ? (typeof body.paid_at === "string" && body.paid_at ? body.paid_at : new Date().toISOString().slice(0, 10)) : null;
        const { meta } = await env.DB.prepare(
          "INSERT INTO financial_entries (student_id, description, category, amount_cents, due_date, paid_at, status, payment_method, notes, reference, subscription_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(studentId, description, category, amountCents, dueDate, paidAt, status === "atrasado" ? "pendente" : status, paymentMethod || null, notes || null, reference || null, subscriptionId, me.userId).run();
        await log(env, {
          actorId: me.userId,
          actorRole: "professor",
          action: "create_financial_entry",
          entity: "financial_entry",
          entityId: String(meta.last_row_id),
          after: { student_id: studentId, description, amount_cents: amountCents, due_date: dueDate, status },
        });
        const entry = await env.DB.prepare(
          "SELECT f.*, s.display_name AS student_name, s.username AS student_username, CASE WHEN f.status='pendente' AND f.due_date < date('now') THEN 'atrasado' ELSE f.status END AS effective_status FROM financial_entries f JOIN students s ON s.id = f.student_id WHERE f.id = ? AND s.owner_user_id=?"
        ).bind(Number(meta.last_row_id), me.userId).first();
        return Response.json({ entry });
      }

      if (entryId && request.method === "PATCH") {
        const current = await env.DB.prepare("SELECT f.* FROM financial_entries f JOIN students s ON s.id=f.student_id WHERE f.id = ? AND s.owner_user_id=?").bind(entryId, me.userId).first();
        if (!current) return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
        const body = await request.json().catch(() => ({}));
        const studentId = body.student_id == null ? current.student_id : Number(body.student_id);
        const student = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(studentId).first();
        if (!student || !(await professionalOwnsStudent(env, me, studentId))) return Response.json({ error: "Selecione um aluno válido." }, { status: 400 });
        const amountCents = body.amount_cents == null ? current.amount_cents : Number(body.amount_cents);
        const dueDate = typeof body.due_date === "string" ? body.due_date : current.due_date;
        if (!Number.isInteger(amountCents) || amountCents <= 0) return Response.json({ error: "Informe um valor válido." }, { status: 400 });
        if (!isDateOnly(dueDate)) return Response.json({ error: "Informe uma data de vencimento válida." }, { status: 400 });
        const status = financeStatuses.includes(body.status) ? body.status : current.status;
        const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : current.description;
        const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : current.category;
        const reference = body.reference == null ? current.reference : String(body.reference).trim();
        const subscriptionId = body.subscription_id == null ? current.subscription_id : Number(body.subscription_id);
        if (subscriptionId && !await env.DB.prepare("SELECT id FROM subscriptions WHERE id=? AND student_id=?").bind(subscriptionId, studentId).first()) return Response.json({ error: "Assinatura inválida para este aluno." }, { status: 400 });
        const paymentMethod = body.payment_method == null ? current.payment_method : String(body.payment_method).trim();
        const notes = body.notes == null ? current.notes : String(body.notes).trim();
        const paidAt = status === "pago" ? (typeof body.paid_at === "string" && body.paid_at ? body.paid_at : current.paid_at || new Date().toISOString().slice(0, 10)) : null;
        await env.DB.prepare(
          "UPDATE financial_entries SET student_id = ?, description = ?, category = ?, amount_cents = ?, due_date = ?, paid_at = ?, status = ?, payment_method = ?, notes = ?, reference = ?, subscription_id = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(studentId, description, category, amountCents, dueDate, paidAt, status === "atrasado" ? "pendente" : status, paymentMethod || null, notes || null, reference || null, subscriptionId, entryId).run();
        await log(env, {
          actorId: me.userId,
          actorRole: "professor",
          action: "edit_financial_entry",
          entity: "financial_entry",
          entityId: String(entryId),
          before: current,
          after: { student_id: studentId, description, amount_cents: amountCents, due_date: dueDate, status },
        });
        const entry = await env.DB.prepare(
          "SELECT f.*, s.display_name AS student_name, s.username AS student_username FROM financial_entries f JOIN students s ON s.id = f.student_id WHERE f.deleted_at IS NULL AND f.id = ? AND s.owner_user_id=?"
        ).bind(entryId, me.userId).first();
        return Response.json({ entry });
      }

      if (entryId && request.method === "DELETE") {
        const current = await env.DB.prepare("SELECT f.* FROM financial_entries f JOIN students s ON s.id=f.student_id WHERE f.id = ? AND s.owner_user_id=?").bind(entryId, me.userId).first();
        if (!current) return Response.json({ error: "Lançamento não encontrado." }, { status: 404 });
        const linkedPayment = await env.DB.prepare("SELECT id FROM payments WHERE charge_id=? LIMIT 1").bind(entryId).first();
        await env.DB.prepare("UPDATE financial_entries SET status = 'cancelado', deleted_at = CASE WHEN ? IS NULL THEN datetime('now') ELSE deleted_at END, updated_at = datetime('now') WHERE id = ?").bind(linkedPayment?.id || null, entryId).run();
        await log(env, {
          actorId: me.userId,
          actorRole: "professor",
          action: "cancel_financial_entry",
          entity: "financial_entry",
          entityId: String(entryId),
          before: current,
        });
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }
    if (financeMatch && !me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });

    // ---- Pagamentos do aluno (somente leitura) ----
    if (url.pathname === "/api/student/me/payments") {
      if (request.method !== "GET") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const student = await studentForRequest(env, request, me);
      if (!me.signedIn || !student) return Response.json({ entries: [] });
      const { results } = await env.DB.prepare(
        "SELECT id, student_id, description, category, amount_cents, due_date, paid_at, status, payment_method, notes, reference, subscription_id, payment_id, CASE WHEN status='pendente' AND due_date < date('now') THEN 'atrasado' ELSE status END AS effective_status FROM financial_entries WHERE deleted_at IS NULL AND student_id = ? ORDER BY due_date DESC, id DESC LIMIT 100"
      ).bind(student.id).all();
      const payments = (await env.DB.prepare("SELECT * FROM payments WHERE student_id=? ORDER BY COALESCE(received_at, paid_at, due_date) DESC, id DESC LIMIT 100").bind(student.id).all()).results;
      return Response.json({ entries: results, charges: results, payments });
    }

    // ---- Planos, assinaturas e pagamentos (modelo V1.1) ----
    if (url.pathname === "/api/student/me/billing") {
      const student = await studentForRequest(env, request, me);
      if (!me.signedIn || !student) return Response.json({ error: "Sem vínculo de aluno." }, { status: 403 });
      const access = await studentAccess(env, student.id);
      const subscriptions = (await env.DB.prepare("SELECT s.*, p.name AS plan_name, p.description AS plan_description, COALESCE(s.price_cents, p.price_cents) AS effective_price_cents, p.duration_days, p.benefits FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.student_id=? ORDER BY s.id DESC").bind(student.id).all()).results.map((subscription) => {
        let benefits = [];
        try { const parsed = JSON.parse(subscription.benefits || "[]"); if (Array.isArray(parsed)) benefits = parsed; } catch {}
        return { ...subscription, benefits };
      });
      const payments = (await env.DB.prepare("SELECT * FROM payments WHERE student_id=? ORDER BY COALESCE(received_at, paid_at, due_date) DESC, id DESC").bind(student.id).all()).results;
      const charges = (await env.DB.prepare("SELECT f.*, CASE WHEN f.status='pendente' AND f.due_date < date('now') THEN 'atrasado' ELSE f.status END AS effective_status FROM financial_entries f WHERE f.deleted_at IS NULL AND f.student_id=? ORDER BY f.due_date DESC, f.id DESC").bind(student.id).all()).results;
      return Response.json({ access, subscriptions, payments, charges });
    }

    if (url.pathname === "/api/professor/billing-settings") {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      if (request.method === "GET") return Response.json({ settings: await env.DB.prepare("SELECT * FROM billing_settings WHERE id=1").first() });
      if (request.method === "PATCH") {
        const b = await request.json().catch(() => ({}));
        const days = Number(b.pending_tolerance_days);
        if (!Number.isInteger(days) || days < 0 || days > 60) return Response.json({ error: "A tolerância deve estar entre 0 e 60 dias." }, { status: 400 });
        const before = await env.DB.prepare("SELECT * FROM billing_settings WHERE id=1").first();
        await env.DB.prepare("UPDATE billing_settings SET pending_tolerance_days=?, updated_at=datetime('now') WHERE id=1").bind(days).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "update_billing_settings", entity: "billing_settings", entityId: "1", before, after: { pending_tolerance_days: days } });
        return Response.json({ settings: await env.DB.prepare("SELECT * FROM billing_settings WHERE id=1").first() });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    const planMatch = url.pathname.match(/^\/api\/professor\/plans(?:\/(\d+))?$/);
    if (planMatch) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const planId = planMatch[1] ? Number(planMatch[1]) : null;
      if (request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM plans ORDER BY CASE status WHEN 'ativo' THEN 0 ELSE 1 END, name").all();
        return Response.json({ plans: results.map((p) => ({ ...p, benefits: JSON.parse(p.benefits || "[]") })) });
      }
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const name = typeof b.name === "string" ? b.name.trim() : "";
        const price = Number(b.price_cents);
        const duration = Number(b.duration_days || 30);
        if (!name || !Number.isInteger(price) || price < 0 || !Number.isInteger(duration) || duration <= 0) return Response.json({ error: "Informe nome, preço e duração válidos." }, { status: 400 });
        const benefits = Array.isArray(b.benefits) ? b.benefits.filter((item) => typeof item === "string").slice(0, 30) : [];
        const { meta } = await env.DB.prepare("INSERT INTO plans (name, description, price_cents, duration_days, benefits, status, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(name, b.description || null, price, duration, JSON.stringify(benefits), b.status === "inativo" ? "inativo" : "ativo", me.userId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "create_plan", entity: "plan", entityId: String(meta.last_row_id), after: { name, price_cents: price, duration_days: duration } });
        return Response.json({ plan: await env.DB.prepare("SELECT * FROM plans WHERE id=?").bind(Number(meta.last_row_id)).first() }, { status: 201 });
      }
      if (!planId) return Response.json({ error: "Plano não encontrado." }, { status: 404 });
      const current = await env.DB.prepare("SELECT * FROM plans WHERE id=?").bind(planId).first();
      if (!current) return Response.json({ error: "Plano não encontrado." }, { status: 404 });
      if (request.method === "DELETE") {
        const deps = await planDependencies(env, planId);
        if (deps.has) {
          return Response.json({ error: "Este plano possui registros históricos associados e não pode ser excluído definitivamente sem comprometer o histórico.", canArchive: true, dependencies: deps }, { status: 409 });
        }
        await env.DB.prepare("DELETE FROM plans WHERE id=?").bind(planId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "delete_plan", entity: "plan", entityId: String(planId), before: current, after: null });
        return Response.json({ ok: true });
      }
      if (request.method === "PATCH") {
        const b = await request.json().catch(() => ({}));
        const price = b.price_cents == null ? current.price_cents : Number(b.price_cents);
        const duration = b.duration_days == null ? current.duration_days : Number(b.duration_days);
        const benefits = Array.isArray(b.benefits) ? b.benefits.filter((item) => typeof item === "string").slice(0, 30) : JSON.parse(current.benefits || "[]");
        if (!Number.isInteger(price) || price < 0 || !Number.isInteger(duration) || duration <= 0) return Response.json({ error: "Preço ou duração inválidos." }, { status: 400 });
        await env.DB.prepare("UPDATE plans SET name=?, description=?, price_cents=?, duration_days=?, benefits=?, status=?, updated_at=datetime('now') WHERE id=?").bind(typeof b.name === "string" && b.name.trim() ? b.name.trim() : current.name, b.description ?? current.description, price, duration, JSON.stringify(benefits), ["ativo", "inativo"].includes(b.status) ? b.status : current.status, planId).run();
        const updated = await env.DB.prepare("SELECT * FROM plans WHERE id=?").bind(planId).first();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "update_plan", entity: "plan", entityId: String(planId), before: current, after: updated });
        return Response.json({ plan: updated });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    const subscriptionMatch = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/subscriptions?(?:\/(\d+))?$/);
    if (subscriptionMatch) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const studentId = Number(subscriptionMatch[1]);
      const subscriptionId = subscriptionMatch[2] ? Number(subscriptionMatch[2]) : null;
      const student = await env.DB.prepare("SELECT id FROM students WHERE id=?").bind(studentId).first();
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      if (request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT s.*, COALESCE(s.price_cents, p.price_cents) AS price_cents, p.name AS plan_name, p.duration_days FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.student_id=? ORDER BY s.id DESC").bind(studentId).all();
        return Response.json({ subscriptions: results });
      }
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const planId = Number(b.plan_id);
        const plan = await env.DB.prepare("SELECT * FROM plans WHERE id=? AND status='ativo'").bind(planId).first();
        if (!plan) return Response.json({ error: "Plano ativo não encontrado." }, { status: 400 });
        const start = isDateOnly(b.start_date) ? b.start_date : new Date().toISOString().slice(0, 10);
        const end = isDateOnly(b.end_date) ? b.end_date : new Date(new Date(`${start}T00:00:00Z`).getTime() + Number(plan.duration_days) * 86400000).toISOString().slice(0, 10);
        const status = ["ACTIVE", "PENDING", "SUSPENDED", "ENDED", "CANCELLED"].includes(b.status) ? b.status : "PENDING";
        if (status === "ACTIVE") {
          const active = await env.DB.prepare("SELECT * FROM subscriptions WHERE student_id=? AND status='ACTIVE' ORDER BY id DESC LIMIT 1").bind(studentId).first();
          if (active && !b.replace) {
            return Response.json({ error: "Este aluno já possui uma assinatura ativa.", existing_subscription_id: active.id, existing_subscription: active }, { status: 409 });
          }
          if (active && b.replace) {
            await env.DB.prepare("UPDATE subscriptions SET status='ENDED', end_date=?, updated_at=datetime('now') WHERE id=?").bind(previousDate(start), active.id).run();
            await log(env, { actorId: me.userId, actorRole: "professor", action: "end_subscription_for_replacement", entity: "subscription", entityId: String(active.id), before: active, after: { status: "ENDED", end_date: previousDate(start) } });
          }
        }
        const priceCents = b.price_cents == null ? Number(plan.price_cents || 0) : Number(b.price_cents);
        if (!Number.isInteger(priceCents) || priceCents < 0) return Response.json({ error: "Preço da assinatura inválido." }, { status: 400 });
        const { meta } = await env.DB.prepare("INSERT INTO subscriptions (student_id, plan_id, start_date, end_date, price_cents, notes, status, auto_renew, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(studentId, planId, start, end, priceCents, typeof b.notes === "string" ? b.notes.trim() || null : null, status, b.auto_renew ? 1 : 0, me.userId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "create_subscription", entity: "subscription", entityId: String(meta.last_row_id), after: { student_id: studentId, plan_id: planId, status, start_date: start, end_date: end } });
        if (status === "ACTIVE") await notify(env, {
          recipients: [me.userId], title: "Plano iniciado",
          body: "Um plano foi iniciado para um aluno. Consulte o perfil para começar o acompanhamento.",
          path: `/financeiro?student_id=${studentId}&entity_type=subscription&entity_id=${meta.last_row_id}`, idempotencyKey: `subscription-start:${meta.last_row_id}`,
        });
        return Response.json({ subscription: await env.DB.prepare("SELECT * FROM subscriptions WHERE id=?").bind(Number(meta.last_row_id)).first() }, { status: 201 });
      }
      if (!subscriptionId) return Response.json({ error: "Assinatura não encontrada." }, { status: 404 });
      const current = await env.DB.prepare("SELECT * FROM subscriptions WHERE id=? AND student_id=?").bind(subscriptionId, studentId).first();
      if (!current) return Response.json({ error: "Assinatura não encontrada." }, { status: 404 });
      if (request.method === "PATCH") {
        const b = await request.json().catch(() => ({}));
        const status = ["ACTIVE", "PENDING", "SUSPENDED", "ENDED", "CANCELLED"].includes(b.status) ? b.status : current.status;
        const start = isDateOnly(b.start_date) ? b.start_date : current.start_date;
        const end = b.end_date === null ? null : isDateOnly(b.end_date) ? b.end_date : current.end_date;
        if (status === "ACTIVE") {
          const active = await env.DB.prepare("SELECT id FROM subscriptions WHERE student_id=? AND status='ACTIVE' AND id<>? ORDER BY id DESC LIMIT 1").bind(studentId, subscriptionId).first();
          if (active) return Response.json({ error: "Este aluno já possui uma assinatura ativa.", existing_subscription_id: active.id }, { status: 409 });
        }
        const planId = b.plan_id == null ? current.plan_id : Number(b.plan_id);
        const plan = await env.DB.prepare("SELECT * FROM plans WHERE id=?").bind(planId).first();
        if (!plan) return Response.json({ error: "Plano não encontrado." }, { status: 400 });
        const priceCents = b.price_cents == null ? (current.price_cents == null ? plan.price_cents : current.price_cents) : Number(b.price_cents);
        if (!Number.isInteger(priceCents) || priceCents < 0) return Response.json({ error: "Preço da assinatura inválido." }, { status: 400 });
        await env.DB.prepare("UPDATE subscriptions SET plan_id=?, start_date=?, end_date=?, price_cents=?, notes=?, status=?, auto_renew=?, updated_at=datetime('now') WHERE id=? AND student_id=?").bind(planId, start, end, priceCents, b.notes == null ? current.notes : String(b.notes).trim() || null, status, b.auto_renew == null ? current.auto_renew : (b.auto_renew ? 1 : 0), subscriptionId, studentId).run();
        const updated = await env.DB.prepare("SELECT * FROM subscriptions WHERE id=?").bind(subscriptionId).first();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "update_subscription", entity: "subscription", entityId: String(subscriptionId), before: current, after: updated });
        if (status === "ACTIVE" && current.status !== "ACTIVE") await notify(env, {
          recipients: [me.userId], title: "Plano iniciado",
          body: "Um plano foi iniciado para um aluno. Consulte o perfil para começar o acompanhamento.",
          path: `/financeiro?student_id=${studentId}&entity_type=subscription&entity_id=${subscriptionId}`, idempotencyKey: `subscription-start:${subscriptionId}:${start}`,
        });
        return Response.json({ subscription: updated });
      }
      if (request.method === "DELETE") {
        const dependent = await env.DB.prepare("SELECT id FROM payments WHERE subscription_id=? LIMIT 1").bind(subscriptionId).first();
        const charge = await env.DB.prepare("SELECT id FROM financial_entries WHERE subscription_id=? LIMIT 1").bind(subscriptionId).first();
        if (dependent || charge) {
          await env.DB.prepare("UPDATE subscriptions SET status='ENDED', end_date=COALESCE(end_date, date('now')), updated_at=datetime('now') WHERE id=? AND student_id=?").bind(subscriptionId, studentId).run();
          await log(env, { actorId: me.userId, actorRole: "professor", action: "end_subscription", entity: "subscription", entityId: String(subscriptionId), before: current, after: { status: "ENDED" } });
          return Response.json({ ok: true, archived: true });
        }
        await env.DB.prepare("DELETE FROM subscriptions WHERE id=? AND student_id=?").bind(subscriptionId, studentId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "delete_subscription", entity: "subscription", entityId: String(subscriptionId), before: current });
        return Response.json({ ok: true, deleted: true });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    if (url.pathname === "/api/professor/subscriptions") {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      if (request.method !== "GET") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const { results } = await env.DB.prepare("SELECT s.*, st.display_name AS student_name, p.name AS plan_name, COALESCE(s.price_cents, p.price_cents) AS price_cents FROM subscriptions s JOIN students st ON st.id=s.student_id JOIN plans p ON p.id=s.plan_id WHERE st.owner_user_id=? ORDER BY s.end_date ASC, s.id DESC").bind(me.userId).all();
      return Response.json({ subscriptions: results });
    }

    const paymentMatch = url.pathname.match(/^\/api\/professor\/payments(?:\/(\d+))?$/);
    if (paymentMatch) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const paymentId = paymentMatch[1] ? Number(paymentMatch[1]) : null;
      const paymentStatuses = ["PENDING", "PAID", "OVERDUE", "CANCELLED", "REFUNDED"];
      if (request.method === "GET") {
        let sql = "SELECT p.*, s.display_name AS student_name, pl.name AS plan_name, c.description AS charge_description FROM payments p JOIN students s ON s.id=p.student_id LEFT JOIN subscriptions sub ON sub.id=p.subscription_id LEFT JOIN plans pl ON pl.id=sub.plan_id LEFT JOIN financial_entries c ON c.id=p.charge_id WHERE s.owner_user_id=?";
        const binds = [me.userId];
        const status = url.searchParams.get("status");
        const studentId = url.searchParams.get("student_id");
        if (paymentStatuses.includes(status)) { sql += " AND p.status=?"; binds.push(status); }
        if (/^\d+$/.test(studentId || "")) { sql += " AND p.student_id=?"; binds.push(Number(studentId)); }
        sql += " ORDER BY COALESCE(p.received_at, p.paid_at, p.due_date) DESC, p.id DESC";
        const { results } = await env.DB.prepare(sql).bind(...binds).all();
        const summary = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN p.status='PAID' AND COALESCE(p.received_at, p.paid_at, p.created_at) >= date('now','start of month') THEN p.amount_cents ELSE 0 END),0) received FROM payments p JOIN students s ON s.id=p.student_id WHERE s.owner_user_id=?").bind(me.userId).first();
        return Response.json({ payments: results, summary: { received: Number(summary?.received || 0) } });
      }
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const studentId = Number(b.student_id);
        const amount = Number(b.amount_cents);
        if (!Number.isInteger(studentId) || !await professionalOwnsStudent(env, me, studentId)) return Response.json({ error: "Aluno inválido." }, { status: 400 });
        if (!Number.isInteger(amount) || amount <= 0) return Response.json({ error: "Valor inválido." }, { status: 400 });
        const receivedAt = isDateOnly(b.received_at || b.paid_at) ? (b.received_at || b.paid_at) : new Date().toISOString().slice(0, 10);
        const subscriptionId = b.subscription_id == null ? null : Number(b.subscription_id);
        if (subscriptionId && !await env.DB.prepare("SELECT id FROM subscriptions WHERE id=? AND student_id=?").bind(subscriptionId, studentId).first()) return Response.json({ error: "Assinatura inválida para este aluno." }, { status: 400 });
        const status = paymentStatuses.includes(b.status) ? b.status : "PAID";
        const chargeId = b.charge_id == null ? null : Number(b.charge_id);
        const charge = chargeId ? await env.DB.prepare("SELECT * FROM financial_entries WHERE id=? AND student_id=?").bind(chargeId, studentId).first() : null;
        if (chargeId && !charge) return Response.json({ error: "Cobrança inválida para este aluno." }, { status: 400 });
        const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim() : "Outro";
        const { meta } = await env.DB.prepare("INSERT INTO payments (student_id, subscription_id, amount_cents, due_date, paid_at, received_at, reason, charge_id, status, payment_method, transaction_reference, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(studentId, subscriptionId, amount, receivedAt, status === "PAID" ? receivedAt : null, status === "PAID" ? receivedAt : null, reason, chargeId, status, b.payment_method || null, b.transaction_reference || null, b.notes || null, me.userId).run();
        if (chargeId && status === "PAID") await env.DB.prepare("UPDATE financial_entries SET status='pago', paid_at=?, payment_id=?, updated_at=datetime('now') WHERE id=?").bind(receivedAt, Number(meta.last_row_id), chargeId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "create_payment", entity: "payment", entityId: String(meta.last_row_id), after: { student_id: studentId, amount_cents: amount, due_date: b.due_date, status } });
        return Response.json({ payment: await env.DB.prepare("SELECT * FROM payments WHERE id=?").bind(Number(meta.last_row_id)).first() }, { status: 201 });
      }
      if (!paymentId) return Response.json({ error: "Pagamento não encontrado." }, { status: 404 });
       const current = await env.DB.prepare("SELECT p.* FROM payments p JOIN students s ON s.id=p.student_id WHERE p.id=? AND s.owner_user_id=?").bind(paymentId, me.userId).first();
      if (!current) return Response.json({ error: "Pagamento não encontrado." }, { status: 404 });
      if (request.method === "DELETE") {
        await env.DB.prepare("UPDATE payments SET status='CANCELLED', updated_at=datetime('now') WHERE id=?").bind(paymentId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "cancel_payment", entity: "payment", entityId: String(paymentId), before: current, after: { status: "CANCELLED" } });
        return Response.json({ ok: true });
      }
      if (request.method === "PATCH") {
        const b = await request.json().catch(() => ({}));
        const status = paymentStatuses.includes(b.status) ? b.status : current.status;
        const amount = b.amount_cents == null ? current.amount_cents : Number(b.amount_cents);
        if (!Number.isInteger(amount) || amount <= 0) return Response.json({ error: "Valor inválido." }, { status: 400 });
        const receivedAt = b.received_at == null && b.paid_at == null ? (current.received_at || current.paid_at || new Date().toISOString().slice(0, 10)) : (b.received_at || b.paid_at);
        if (!isDateOnly(receivedAt)) return Response.json({ error: "Data de recebimento inválida." }, { status: 400 });
        const reason = b.reason == null ? (current.reason || "Outro") : String(b.reason).trim();
        const chargeId = b.charge_id == null ? current.charge_id : Number(b.charge_id);
        if (chargeId && !await env.DB.prepare("SELECT id FROM financial_entries WHERE id=? AND student_id=?").bind(chargeId, current.student_id).first()) return Response.json({ error: "Cobrança inválida para este aluno." }, { status: 400 });
        const paidAt = status === "PAID" ? receivedAt : null;
        await env.DB.prepare("UPDATE payments SET amount_cents=?, due_date=?, paid_at=?, received_at=?, reason=?, charge_id=?, status=?, payment_method=?, transaction_reference=?, notes=?, updated_at=datetime('now') WHERE id=?").bind(amount, receivedAt, paidAt, status === "PAID" ? receivedAt : null, reason, chargeId || null, status, b.payment_method ?? current.payment_method, b.transaction_reference ?? current.transaction_reference, b.notes ?? current.notes, paymentId).run();
        if (chargeId && status === "PAID") await env.DB.prepare("UPDATE financial_entries SET status='pago', paid_at=?, payment_id=?, updated_at=datetime('now') WHERE id=?").bind(receivedAt, paymentId, chargeId).run();
        const updated = await env.DB.prepare("SELECT * FROM payments WHERE id=?").bind(paymentId).first();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "update_payment", entity: "payment", entityId: String(paymentId), before: current, after: updated });
        return Response.json({ payment: updated });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    // ---- Dores (professor) ----
    const painMatch = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/pains(?:\/(\d+))?$/);
    if (painMatch && me.isOwner) {
      const studentId = Number(painMatch[1]);
      const painId = painMatch[2] ? Number(painMatch[2]) : null;
      const student = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(studentId).first();
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });

      if (request.method === "GET") {
        if (painId) {
          const pain = await env.DB.prepare("SELECT * FROM pain_records WHERE id = ? AND student_id = ?").bind(painId, studentId).first();
          if (!pain) return Response.json({ error: "Registro de dor não encontrado." }, { status: 404 });
          return Response.json({ pain });
        }
        const { results } = await env.DB.prepare("SELECT * FROM pain_records WHERE student_id = ? ORDER BY CASE status WHEN 'ativa' THEN 0 WHEN 'monitorar' THEN 1 ELSE 2 END, onset_date DESC, id DESC").bind(studentId).all();
        return Response.json({ pains: results });
      }

      if (request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) || {};
        const parsed = painInput(body);
        if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
        const p = parsed.data;
        const { meta } = await env.DB.prepare(
          "INSERT INTO pain_records (student_id, region, side, onset_date, resolved_date, intensity, status, description, triggers, limitations, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(studentId, p.region, p.side, p.onset_date, p.resolved_date, p.intensity, p.status, p.description, p.triggers, p.limitations, me.userId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "create_pain", entity: "pain_record", entityId: String(meta.last_row_id), after: { student_id: studentId, ...p } });
        const pain = await env.DB.prepare("SELECT * FROM pain_records WHERE id = ?").bind(Number(meta.last_row_id)).first();
        return Response.json({ pain });
      }

      if (painId && request.method === "PATCH") {
        const current = await env.DB.prepare("SELECT * FROM pain_records WHERE id = ? AND student_id = ?").bind(painId, studentId).first();
        if (!current) return Response.json({ error: "Registro de dor não encontrado." }, { status: 404 });
        const body = (await request.json().catch(() => ({}))) || {};
        const parsed = painInput(body, current);
        if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
        const p = parsed.data;
        await env.DB.prepare(
          "UPDATE pain_records SET region = ?, side = ?, onset_date = ?, resolved_date = ?, intensity = ?, status = ?, description = ?, triggers = ?, limitations = ?, user_id = ?, updated_at = datetime('now') WHERE id = ? AND student_id = ?"
        ).bind(p.region, p.side, p.onset_date, p.resolved_date, p.intensity, p.status, p.description, p.triggers, p.limitations, me.userId, painId, studentId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "edit_pain", entity: "pain_record", entityId: String(painId), before: current, after: p });
        const pain = await env.DB.prepare("SELECT * FROM pain_records WHERE id = ?").bind(painId).first();
        return Response.json({ pain });
      }

      if (painId && request.method === "DELETE") {
        const current = await env.DB.prepare("SELECT * FROM pain_records WHERE id = ? AND student_id = ?").bind(painId, studentId).first();
        if (!current) return Response.json({ error: "Registro de dor não encontrado." }, { status: 404 });
        await env.DB.prepare("UPDATE pain_records SET status = 'resolvida', resolved_date = COALESCE(resolved_date, date('now')), updated_at = datetime('now') WHERE id = ? AND student_id = ?").bind(painId, studentId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "resolve_pain", entity: "pain_record", entityId: String(painId), before: current, after: { status: "resolvida" } });
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }
    if (painMatch && !me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });

    // ---- Dores (aluno, próprio histórico) ----
    const studentPainMatch = url.pathname.match(/^\/api\/student\/me\/pains(?:\/(\d+))?$/);
    if (studentPainMatch) {
      const student = await studentForRequest(env, request, me);
      if (!me.signedIn || !student) return Response.json({ error: "Sem vínculo de aluno." }, { status: 403 });
      const painId = studentPainMatch[1] ? Number(studentPainMatch[1]) : null;
      if (request.method === "GET") {
        if (painId) {
          const pain = await env.DB.prepare("SELECT * FROM pain_records WHERE id = ? AND student_id = ?").bind(painId, student.id).first();
          if (!pain) return Response.json({ error: "Registro de dor não encontrado." }, { status: 404 });
          return Response.json({ pain });
        }
        const { results } = await env.DB.prepare("SELECT * FROM pain_records WHERE student_id = ? ORDER BY CASE status WHEN 'ativa' THEN 0 WHEN 'monitorar' THEN 1 ELSE 2 END, onset_date DESC, id DESC").bind(student.id).all();
        return Response.json({ pains: results });
      }
      if (request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) || {};
        const parsed = painInput(body);
        if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
        const p = parsed.data;
        const { meta } = await env.DB.prepare(
          "INSERT INTO pain_records (student_id, region, side, onset_date, resolved_date, intensity, status, description, triggers, limitations, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(student.id, p.region, p.side, p.onset_date, p.resolved_date, p.intensity, p.status, p.description, p.triggers, p.limitations, me.userId).run();
        await log(env, { actorId: me.userId, actorRole: "aluno", action: "create_pain", entity: "pain_record", entityId: String(meta.last_row_id), after: p });
        const pain = await env.DB.prepare("SELECT * FROM pain_records WHERE id = ?").bind(Number(meta.last_row_id)).first();
        return Response.json({ pain });
      }
      if (painId && request.method === "PATCH") {
        const current = await env.DB.prepare("SELECT * FROM pain_records WHERE id = ? AND student_id = ?").bind(painId, student.id).first();
        if (!current) return Response.json({ error: "Registro de dor não encontrado." }, { status: 404 });
        const body = (await request.json().catch(() => ({}))) || {};
        const parsed = painInput(body, current);
        if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
        const p = parsed.data;
        await env.DB.prepare(
          "UPDATE pain_records SET region = ?, side = ?, onset_date = ?, resolved_date = ?, intensity = ?, status = ?, description = ?, triggers = ?, limitations = ?, user_id = ?, updated_at = datetime('now') WHERE id = ? AND student_id = ?"
        ).bind(p.region, p.side, p.onset_date, p.resolved_date, p.intensity, p.status, p.description, p.triggers, p.limitations, me.userId, painId, student.id).run();
        const pain = await env.DB.prepare("SELECT * FROM pain_records WHERE id = ?").bind(painId).first();
        return Response.json({ pain });
      }
      if (painId && request.method === "DELETE") {
        await env.DB.prepare("UPDATE pain_records SET status = 'resolvida', resolved_date = COALESCE(resolved_date, date('now')), updated_at = datetime('now') WHERE id = ? AND student_id = ?").bind(painId, student.id).run();
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    // ---- Convites de aluno (compatível com o auto-cadastro legado) ----
    const inviteMatch = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/invite$/);
    if (inviteMatch) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const studentId = Number(inviteMatch[1]);
      const student = await env.DB.prepare("SELECT * FROM students WHERE id=?").bind(studentId).first();
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      if (request.method === "DELETE") {
        const result = await env.DB.prepare("UPDATE student_invitations SET status='revoked', updated_at=datetime('now') WHERE student_id=? AND status='pending'").bind(studentId).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "revoke_student_invitation", entity: "student", entityId: String(studentId), after: { revoked_count: Number(result.meta?.changes || 0) } });
        return Response.json({ ok: true, revoked_count: Number(result.meta?.changes || 0) });
      }
      if (request.method !== "POST") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const existing = await env.DB.prepare("SELECT * FROM student_invitations WHERE student_id=? AND status='pending' AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY id DESC LIMIT 1").bind(studentId).first();
      if (existing) return Response.json({ invitation: existing, invite_url: `/invite/${existing.token}` });
      const token = crypto.randomUUID();
      const expires = new Date(Date.now() + 7 * 86400000).toISOString();
      const { meta } = await env.DB.prepare("INSERT INTO student_invitations (student_id, token, invited_username, expires_at, invited_by) VALUES (?, ?, ?, ?, ?)").bind(studentId, token, student.username || null, expires, me.userId).run();
      await log(env, { actorId: me.userId, actorRole: "professor", action: "create_student_invitation", entity: "student_invitation", entityId: String(meta.last_row_id), after: { student_id: studentId, expires_at: expires } });
      return Response.json({ invitation: await env.DB.prepare("SELECT * FROM student_invitations WHERE id=?").bind(Number(meta.last_row_id)).first(), invite_url: `/invite/${token}` }, { status: 201 });
    }

    const acceptInviteMatch = url.pathname.match(/^\/api\/student\/invitations\/([a-zA-Z0-9-]+)\/accept$/);
    if (acceptInviteMatch) {
      if (request.method !== "POST") return Response.json({ error: "Método não suportado." }, { status: 405 });
      if (!me.signedIn || me.isOwner) return Response.json({ error: "Entre com a conta do aluno para aceitar o convite." }, { status: 403 });
      const invitation = await env.DB.prepare("SELECT i.*, s.display_name, s.user_id AS linked_user_id FROM student_invitations i JOIN students s ON s.id=i.student_id WHERE i.token=?").bind(acceptInviteMatch[1]).first();
      if (!invitation || invitation.status !== "pending" || (invitation.expires_at && invitation.expires_at <= new Date().toISOString())) return Response.json({ error: "Convite inválido ou expirado." }, { status: 404 });
      const existing = await studentByUser(env, me.userId);
      if (existing && existing.id !== invitation.student_id) return Response.json({ error: "Esta conta já está vinculada a outro cadastro." }, { status: 409 });
      if (invitation.linked_user_id && invitation.linked_user_id !== me.userId) return Response.json({ error: "Este cadastro já foi vinculado." }, { status: 409 });
      await env.DB.prepare("UPDATE students SET user_id=?, username=?, status='ativo', subscription_required=1, updated_at=datetime('now') WHERE id=?").bind(me.userId, me.username, invitation.student_id).run();
      await env.DB.prepare("UPDATE student_invitations SET status='accepted', accepted_user_id=?, updated_at=datetime('now') WHERE id=?").bind(me.userId, invitation.id).run();
      await log(env, { actorId: me.userId, actorRole: "aluno", action: "accept_student_invitation", entity: "student_invitation", entityId: String(invitation.id), before: invitation, after: { status: "accepted", accepted_user_id: me.userId, student_id: invitation.student_id } });
      return Response.json({ student: await studentByUser(env, me.userId), accepted: true });
    }

    // ---- Auto-cadastro do aluno (primeiro acesso como "Sou aluno") ----
    if (request.method === "POST" && url.pathname === "/api/student/enroll") {
      if (!me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
      if (me.isOwner) {
        return Response.json({ error: "O dono do projeto é o professor." }, { status: 403 });
      }
      const existing = await studentByUser(env, me.userId);
      if (existing) return Response.json({ student: existing, enrolled: false });

      const { display_name } = await request.json().catch(() => ({}));
      const name = typeof display_name === "string" && display_name.trim() ? display_name.trim() : me.username;

      // Se o professor pré-registrou este aluno pelo @username, reivindica a conta.
      const claimed = await studentByUsernameUnclaimed(env, me.username);
      if (claimed) {
        await env.DB
          .prepare("UPDATE students SET user_id = ?, username = ?, display_name = ?, status = 'ativo', subscription_required = 1, updated_at = datetime('now') WHERE id = ?")
          .bind(me.userId, me.username, name, claimed.id)
          .run();
        const student = await studentByUser(env, me.userId);
        await log(env, {
          actorId: me.userId,
          actorRole: "aluno",
          action: "claim",
          entity: "student",
          entityId: String(student.id),
          before: { was: "unclaimed" },
          after: { user_id: me.userId, display_name: name },
        });
        await notify(env, {
          recipients: [student.owner_user_id || me.ownerId].filter(Boolean), title: "Cadastro de aluno concluído",
          body: `${student.display_name || student.username || "Um aluno"} concluiu o acesso à conta e pode iniciar o onboarding.`,
          path: `/alunos?student_id=${student.id}&focus=profile&entity_type=student&entity_id=${student.id}`, idempotencyKey: `student-created:${student.id}`,
        });
        return Response.json({ student, enrolled: true });
      }

      const { meta } = await env.DB
        .prepare("INSERT INTO students (user_id, username, display_name, subscription_required) VALUES (?, ?, ?, 1)")
        .bind(me.userId, me.username, name)
        .run();
      const student = {
        id: meta.last_row_id,
        user_id: me.userId,
        username: me.username,
        display_name: name,
        status: "ativo",
      };
      await log(env, {
        actorId: me.userId,
        actorRole: "aluno",
        action: "enroll",
        entity: "student",
        entityId: String(student.id),
        after: { display_name: name },
      });
      await notify(env, {
        recipients: [me.ownerId].filter(Boolean), title: "Novo aluno cadastrado",
        body: `${student.display_name || student.username || "Um aluno"} se cadastrou e pode iniciar o onboarding.`,
        path: `/alunos?student_id=${student.id}&focus=profile&entity_type=student&entity_id=${student.id}`, idempotencyKey: `student-created:${student.id}`,
      });
      return Response.json({ student, enrolled: true });
    }

    // ---- Painel do professor (somente dono) ----
    const alertMatch = url.pathname.match(/^\/api\/professor\/alerts\/([^/]+)$/);
    if (alertMatch) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const key = decodeURIComponent(alertMatch[1]);
      if (request.method !== "PATCH") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const body = await request.json().catch(() => ({}));
      const status = ["new", "viewed", "in_progress", "dismissed", "resolved"].includes(body.status) ? body.status : null;
      if (!status) return Response.json({ error: "Status de alerta inválido." }, { status: 400 });
       const alert = await env.DB.prepare("SELECT student_id FROM dashboard_alerts WHERE alert_key=? AND owner_user_id=?").bind(key, me.userId).first();
       if (alert?.student_id != null && !(await professionalOwnsStudent(env, me, Number(alert.student_id)))) return Response.json({ error: "Alerta não encontrado." }, { status: 404 });
       await env.DB.prepare("UPDATE dashboard_alerts SET status=?, updated_at=datetime('now') WHERE alert_key=? AND owner_user_id=?").bind(status, key, me.userId).run();
      return Response.json({ ok: true, alertId: key, status });
    }

    if (request.method === "GET" && url.pathname === "/api/professor/dashboard") {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      await sendAppointmentReminders(env, me.userId);

      const { results: students } = await env.DB
        .prepare("SELECT id, display_name, username, status, created_at FROM students WHERE owner_user_id=? AND status <> 'encerrado' ORDER BY created_at DESC")
        .bind(me.userId).all();

      const now = Date.now();
      const alerts = [];
      const recent = 3 * 24 * 60 * 60 * 1000;
      const checkinConfig = await getCheckinConfig(env);
      for (const s of students) {
        const age = now - new Date(s.created_at + "Z").getTime();
        if (s.status === "suspenso") {
          alerts.push({ level: "red", kind: "conta", title: `${s.display_name} — conta suspensa`, studentId: s.id, createdAt: s.created_at });
        } else if (s.status === "pendente") {
          alerts.push({ level: "yellow", kind: "conta", title: `${s.display_name} — acesso pendente`, studentId: s.id, createdAt: s.created_at });
        } else if (age < recent) {
          alerts.push({ level: "blue", kind: "novo", title: `${s.display_name} entrou na consultoria`, studentId: s.id, createdAt: s.created_at });
        }
      }

      const [
        { results: pains },
        { results: divergentExecutions },
        unreadMessages,
        { results: unreadByStudent },
        { results: newBookings },
        { results: pendingCharges },
        { results: receivedAnamneses },
        { results: approvedOrders },
        { results: plansEnding },
        { results: receivedVideos },
      ] = await Promise.all([
        env.DB.prepare("SELECT p.id AS pain_id, p.student_id, s.display_name, p.intensity, p.created_at FROM pain_records p JOIN students s ON s.id=p.student_id WHERE s.owner_user_id=? AND p.status IN ('ativa','monitorar') AND p.intensity >= 7 ORDER BY p.id DESC LIMIT 20").bind(me.userId).all(),
        env.DB.prepare("SELECT e.id AS execution_id, e.prescription_id, e.workout_id, e.student_id, e.created_at, s.display_name FROM executions e JOIN students s ON s.id=e.student_id WHERE s.owner_user_id=? AND e.id=(SELECT MAX(latest.id) FROM executions latest WHERE latest.prescription_id=e.prescription_id) AND (e.flags LIKE '%abaixo_da_faixa%' OR e.flags LIKE '%acima_da_faixa%') ORDER BY e.id DESC LIMIT 20").bind(me.userId).all(),
        env.DB.prepare("SELECT COUNT(*) AS count FROM chat_messages c JOIN students s ON s.id=c.student_id WHERE s.owner_user_id=? AND c.sender='student' AND c.read_at IS NULL").bind(me.userId).first(),
        env.DB.prepare("SELECT c.student_id, s.display_name, COUNT(*) AS count, MAX(c.id) AS message_id, MAX(c.created_at) AS created_at FROM chat_messages c JOIN students s ON s.id=c.student_id WHERE s.owner_user_id=? AND c.sender='student' AND c.read_at IS NULL AND c.file_url IS NULL GROUP BY c.student_id ORDER BY MAX(c.id) DESC LIMIT 20").bind(me.userId).all(),
        env.DB.prepare("SELECT a.id AS appointment_id, a.student_id, a.created_at, s.display_name FROM appointments a JOIN students s ON s.id=a.student_id WHERE s.owner_user_id=? AND a.booking_source='student' AND a.status='agendado' ORDER BY a.id DESC LIMIT 20").bind(me.userId).all(),
        env.DB.prepare("SELECT f.id AS charge_id, f.student_id, f.created_at, f.due_date, s.display_name, CASE WHEN f.due_date < date('now') THEN 'atrasada' ELSE 'pendente' END AS state FROM financial_entries f JOIN students s ON s.id=f.student_id WHERE s.owner_user_id=? AND f.deleted_at IS NULL AND f.status='pendente' ORDER BY f.due_date ASC LIMIT 20").bind(me.userId).all(),
        env.DB.prepare("SELECT a.student_id, s.display_name, a.updated_at AS created_at FROM anamnesis a JOIN students s ON s.id=a.student_id WHERE s.owner_user_id=? AND a.status='preenchida' ORDER BY a.updated_at DESC LIMIT 30").bind(me.userId).all(),
        env.DB.prepare("SELECT co.id AS order_id, co.student_id, COALESCE(co.approved_at,co.updated_at) AS created_at, co.plan_code, s.display_name FROM checkout_orders co JOIN students s ON s.id=co.student_id WHERE s.owner_user_id=? AND co.status='APPROVED' AND s.status='pendente' ORDER BY co.updated_at DESC LIMIT 20").bind(me.userId).all(),
        env.DB.prepare("SELECT sub.id AS subscription_id, sub.student_id, sub.end_date, s.display_name FROM subscriptions sub JOIN students s ON s.id=sub.student_id WHERE s.owner_user_id=? AND sub.status='ACTIVE' AND sub.end_date BETWEEN date('now') AND date('now','+14 day') ORDER BY sub.end_date LIMIT 30").bind(me.userId).all(),
        env.DB.prepare("SELECT vr.id AS video_id, vr.student_id, vr.created_at, vr.exercise_name, s.display_name FROM video_reviews vr JOIN students s ON s.id=vr.student_id WHERE s.owner_user_id=? AND vr.status IN ('received','in_progress') ORDER BY vr.created_at DESC LIMIT 30").bind(me.userId).all(),
      ]);
      for (const pain of pains) alerts.push({ level: "red", kind: "dor", title: `${pain.display_name} — dor relevante (${pain.intensity}/10)`, studentId: pain.student_id, entityId: pain.pain_id, createdAt: pain.created_at });
      for (const item of receivedAnamneses) alerts.push({ level: "blue", kind: "anamnese", title: `${item.display_name} — anamnese recebida`, reason: "Entrada preenchida; revise os dados informados e arquivos anexados.", studentId: item.student_id, entityType: "anamnesis", entityId: item.student_id, createdAt: item.created_at });
      for (const item of approvedOrders) alerts.push({ level: "blue", kind: "pagamento", title: `${item.display_name} — pagamento confirmado, aguardando início`, reason: `Pedido ${item.plan_code} aprovado; confira as próximas etapas do acompanhamento.`, studentId: item.student_id, entityType: "checkout_order", entityId: item.order_id, createdAt: item.created_at });
      for (const item of plansEnding) alerts.push({ level: "yellow", kind: "plano", title: `${item.display_name} — plano próximo do encerramento`, reason: `Término previsto para ${item.end_date}.`, studentId: item.student_id, entityType: "subscription", entityId: item.subscription_id, createdAt: item.end_date });
      for (const item of receivedVideos) alerts.push({ level: "blue", kind: "video", title: `${item.display_name} — vídeo enviado para análise`, reason: `Exercício: ${item.exercise_name}.`, studentId: item.student_id, entityType: "video_review", entityId: item.video_id, createdAt: item.created_at });
      for (const execution of divergentExecutions) alerts.push({ level: "yellow", kind: "divergencia", title: `${execution.display_name} — execução fora da prescrição`, studentId: execution.student_id, entityId: execution.execution_id, prescriptionId: execution.prescription_id, workoutId: execution.workout_id, createdAt: execution.created_at });
       for (const item of unreadByStudent) alerts.push({ level: "blue", kind: "mensagem", title: `${item.display_name} — ${item.count} mensagem(ns) não lida(s)`, studentId: item.student_id, entityType: "message", entityId: item.message_id, createdAt: item.created_at });
      for (const booking of newBookings) alerts.push({ level: "blue", kind: "agendamento", title: `${booking.display_name} — novo agendamento`, studentId: booking.student_id, entityId: booking.appointment_id, createdAt: booking.created_at });
      for (const charge of pendingCharges) alerts.push({ level: charge.state === "atrasada" ? "yellow" : "blue", kind: "pagamento", title: `${charge.display_name} — cobrança ${charge.state}`, studentId: charge.student_id, entityId: charge.charge_id, entityType: "charge", createdAt: charge.created_at });

      const active = students.filter((s) => s.status === "ativo").length;
      const newCount = students.filter((s) => now - new Date(s.created_at + "Z").getTime() < recent).length;
      const upcomingAppointments = await env.DB.prepare(
         "SELECT COUNT(*) AS count FROM appointments a JOIN students s ON s.id=a.student_id WHERE s.owner_user_id=? AND a.status IN ('agendado', 'confirmado') AND a.starts_at >= ? AND a.starts_at < ?"
       ).bind(me.userId, new Date(now).toISOString(), new Date(now + 30 * 86400000).toISOString()).first("count");
      const checkinCutoff = new Date(now - periodDays(checkinConfig) * 86400000).toISOString().slice(0, 10);
       const { results: recentCheckins } = await env.DB.prepare(
         "SELECT c.id, c.student_id, c.answered_at FROM checkins c JOIN students s ON s.id=c.student_id WHERE s.owner_user_id=? AND c.answered_at >= ? AND c.id=(SELECT MAX(latest.id) FROM checkins latest WHERE latest.student_id=c.student_id)"
       ).bind(me.userId, checkinCutoff).all();
      const checkinStudentIds = new Set(recentCheckins.map((row) => String(row.student_id)));
      const checkinsPending = students.filter((student) => student.status === "ativo" && !checkinStudentIds.has(String(student.id))).length;
       for (const student of students.filter((item) => item.status === "ativo" && !checkinStudentIds.has(String(item.id)))) {
         const ageDays = Math.max(0, Math.floor((now - new Date(student.created_at + "Z").getTime()) / 86400000));
         if (ageDays >= periodDays(checkinConfig)) alerts.push({ level: "yellow", kind: "sem_registro", title: `${student.display_name} — sem registro recente`, reason: `Não há check-in nos últimos ${periodDays(checkinConfig)} dias.`, studentId: student.id, createdAt: student.created_at });
       }
       const { results: pendingCheckins } = await env.DB.prepare(
         "SELECT c.id AS checkin_id, c.student_id, c.answered_at, c.answers, s.display_name FROM checkins c JOIN students s ON s.id=c.student_id WHERE s.owner_user_id=? AND c.review_status IN ('received','in_progress') AND c.id=(SELECT MAX(latest.id) FROM checkins latest WHERE latest.student_id=c.student_id) ORDER BY c.id DESC LIMIT 30"
       ).bind(me.userId).all();
       for (const checkin of pendingCheckins) {
         const answers = JSON.parse(checkin.answers || "{}");
         const flags = computeCheckinFlags(answers, checkinConfig.thresholds);
         const level = flags.includes("dor") ? "red" : flags.length ? "yellow" : "blue";
         const reason = flags.length ? `Resposta sinaliza: ${flags.join(", ").replaceAll("_", " ")}.` : "Aguardando revisão e retorno do profissional.";
         alerts.push({ level, kind: flags.includes("dor") ? "dor" : "checkin", title: `${checkin.display_name} — check-in recebido`, reason, studentId: checkin.student_id, entityType: "checkin", entityId: checkin.checkin_id, createdAt: checkin.answered_at });
       }
       const { results: newFiles } = await env.DB.prepare("SELECT c.id AS message_id, c.student_id, c.created_at, s.display_name FROM chat_messages c JOIN students s ON s.id=c.student_id WHERE s.owner_user_id=? AND c.sender='student' AND c.read_at IS NULL AND c.file_url IS NOT NULL ORDER BY c.id DESC LIMIT 20").bind(me.userId).all();
      for (const file of newFiles) alerts.push({ level: "blue", kind: "arquivo", title: `${file.display_name} — novo arquivo no chat`, studentId: file.student_id, entityId: file.message_id, createdAt: file.created_at });
       const { results: evaluationDue } = await env.DB.prepare("SELECT st.id AS student_id, st.display_name FROM students st LEFT JOIN (SELECT student_id, MAX(date) AS last_date FROM evaluations WHERE COALESCE(status,'ativa') <> 'arquivada' GROUP BY student_id) e ON e.student_id=st.id WHERE st.owner_user_id=? AND st.status='ativo' AND (e.last_date IS NULL OR e.last_date < date('now','-30 day')) LIMIT 20").bind(me.userId).all();
      for (const evaluation of evaluationDue) alerts.push({ level: "blue", kind: "avaliacao", title: `${evaluation.display_name} — avaliação próxima`, studentId: evaluation.student_id });
      const financialSummary = await env.DB.prepare(
        "SELECT (SELECT COALESCE(SUM(p.amount_cents),0) FROM payments p JOIN students s ON s.id=p.student_id WHERE s.owner_user_id=? AND p.status='PAID' AND COALESCE(p.received_at, p.paid_at, p.created_at) >= date('now','start of month')) AS received, (SELECT COALESCE(SUM(f.amount_cents),0) FROM financial_entries f JOIN students s ON s.id=f.student_id WHERE s.owner_user_id=? AND f.deleted_at IS NULL AND f.status='pendente' AND f.due_date >= date('now')) AS to_receive, (SELECT COALESCE(SUM(f.amount_cents),0) FROM financial_entries f JOIN students s ON s.id=f.student_id WHERE s.owner_user_id=? AND f.deleted_at IS NULL AND f.status='pendente' AND f.due_date < date('now')) AS overdue"
      ).bind(me.userId, me.userId, me.userId).first();

      const alertStatuses = await persistDashboardAlerts(env, alerts, me.userId);
      const decoratedAlerts = alerts.map((alert) => {
        const entityType = alert.entityType || ({ dor: "pain_record", checkin: "checkin", recuperacao: "checkin", adesao: "checkin", divergencia: "execution", agendamento: "appointment", pagamento: "payment", avaliacao: "evaluation", mensagem: "message", arquivo: "message" }[alert.kind] || null);
        const alertId = `${me.userId}:${alert.kind || "generic"}:${alert.studentId || 0}:${alert.entityId || alert.createdAt || "current"}`;
        return { ...alert, alertId, type: alert.kind || "generic", entityType, entityId: alert.entityId || null, priority: alert.level, status: alertStatuses.get(alertId) || "new", createdAt: alert.createdAt || null, destination: alertDestination({ ...alert, entityType }) };
      }).filter((alert) => alert.status !== "dismissed");

      return Response.json({
        students,
        alerts: decoratedAlerts,
        stats: {
          alunosAtivos: active,
          novosAlunos: newCount,
          checkinsPendentes: checkinsPending,
          proximosAtendimentos: Number(upcomingAppointments || 0),
          msgNaoLidas: Number(unreadMessages?.count || 0),
          aReceber: Number(financialSummary?.to_receive || 0),
          recebido: Number(financialSummary?.received || 0),
          emAtraso: Number(financialSummary?.overdue || 0),
          pagamentosRecebidos: Number(await env.DB.prepare("SELECT COUNT(*) AS count FROM payments p JOIN students s ON s.id=p.student_id WHERE s.owner_user_id=? AND p.status='PAID' AND COALESCE(p.received_at, p.paid_at, p.created_at) >= date('now','start of month')").bind(me.userId).first("count") || 0),
        },
      });
    }

    if (url.pathname === "/api/professor/appointment-reminders/run") {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      if (request.method !== "POST") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const sent = await sendAppointmentReminders(env, me.userId);
      return Response.json({ sent });
    }

    const studentSummaryMatch = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/summary$/);
    if (studentSummaryMatch) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const studentId = Number(studentSummaryMatch[1]);
      const student = await env.DB.prepare("SELECT * FROM students WHERE id=?").bind(studentId).first();
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      const subscription = await env.DB.prepare("SELECT s.*, p.name AS plan_name, p.price_cents FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.student_id=? ORDER BY s.id DESC LIMIT 1").bind(studentId).first();
      const lastExecution = await env.DB.prepare("SELECT e.*, pr.exercise_name FROM executions e JOIN prescriptions pr ON pr.id=e.prescription_id WHERE e.student_id=? ORDER BY e.date DESC, e.id DESC LIMIT 1").bind(studentId).first();
      const lastCheckin = await env.DB.prepare("SELECT * FROM checkins WHERE student_id=? ORDER BY answered_at DESC, id DESC LIMIT 1").bind(studentId).first();
      const lastEvaluation = await env.DB.prepare("SELECT * FROM evaluations WHERE student_id=? AND COALESCE(status,'ativa') <> 'arquivada' ORDER BY date DESC, id DESC LIMIT 1").bind(studentId).first();
      const pain = await env.DB.prepare("SELECT * FROM pain_records WHERE student_id=? AND status IN ('ativa','monitorar') ORDER BY intensity DESC, id DESC LIMIT 1").bind(studentId).first();
      const unread = await env.DB.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE student_id=? AND sender='student' AND read_at IS NULL").bind(studentId).first();
      const appointment = await env.DB.prepare("SELECT * FROM appointments WHERE student_id=? AND status IN ('agendado','confirmado') AND starts_at >= datetime('now') ORDER BY starts_at ASC LIMIT 1").bind(studentId).first();
      const finance = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN status='PENDING' THEN amount_cents ELSE 0 END),0) pending, COALESCE(SUM(CASE WHEN status='OVERDUE' THEN amount_cents ELSE 0 END),0) overdue FROM payments WHERE student_id=?").bind(studentId).first();
      return Response.json({ student, subscription, lastExecution, lastCheckin: lastCheckin ? { ...lastCheckin, answers: JSON.parse(lastCheckin.answers || '{}') } : null, lastEvaluation, pain, unreadMessages: Number(unread?.count || 0), appointment, finance: { pending: Number(finance?.pending || 0), overdue: Number(finance?.overdue || 0) } });
    }

    // ---- Gestão de alunos (somente professor) ----
    const studentsMatch = url.pathname.match(/^\/api\/professor\/students(?:\/(\d+))?$/);

    if (studentsMatch && me.isOwner) {
      const id = studentsMatch[1];
      // GET /api/professor/students/:id — prontuário
      if (request.method === "GET" && id) {
        const student = (await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(Number(id)).first()) ?? null;
        if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
        return Response.json({ student });
      }
      // PATCH /api/professor/students/:id — editar nome/status
      if (request.method === "PATCH" && id) {
        const body = await request.json().catch(() => ({}));
        const current = (await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(Number(id)).first()) ?? null;
        if (!current) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });

        const next = {
          display_name:
            typeof body.display_name === "string" && body.display_name.trim()
              ? body.display_name.trim()
              : current.display_name,
          status: ["ativo", "pendente", "suspenso", "encerrado"].includes(body.status)
            ? body.status
            : current.status,
        };

        const before = { display_name: current.display_name, status: current.status };
        await env.DB
          .prepare("UPDATE students SET display_name = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(next.display_name, next.status, Number(id))
          .run();
        await log(env, {
          actorId: me.userId,
          actorRole: "professor",
          action: "edit_student",
          entity: "student",
          entityId: id,
          before,
          after: next,
        });
        const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(Number(id)).first();
        return Response.json({ student });
      }
      // Exclusão lógica: preserva prontuário, histórico financeiro e vínculos.
      if (request.method === "DELETE" && id) {
        const current = await env.DB.prepare("SELECT * FROM students WHERE id=?").bind(Number(id)).first();
        if (!current) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
        if (current.status === "encerrado") return Response.json({ ok: true, archived: true });
        await env.DB.prepare("UPDATE students SET status='encerrado', updated_at=datetime('now') WHERE id=?").bind(Number(id)).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "archive_student", entity: "student", entityId: id, before: current, after: { status: "encerrado" } });
        return Response.json({ ok: true, archived: true });
      }
      // GET /api/professor/students (lista)
      if (request.method === "GET") {
        const q = (url.searchParams.get("q") ?? "").trim();
        const status = url.searchParams.get("status") ?? "";
        const scope = url.searchParams.get("scope") ?? "";
        let sql =
          "SELECT id, display_name, username, user_id, owner_user_id, status, created_at, (SELECT COUNT(*) FROM chat_messages c WHERE c.student_id = students.id AND c.sender = 'student' AND c.read_at IS NULL) AS unread_count FROM students WHERE owner_user_id = ?";
        const binds = [me.userId];
        if (q) {
          sql += " AND (display_name LIKE ? OR username LIKE ?)";
          binds.push(`%${q}%`, `%${q}%`);
        }
        if (["ativo", "pendente", "suspenso", "encerrado"].includes(status)) {
          sql += " AND status = ?";
          binds.push(status);
        } else sql += " AND status <> 'encerrado'";
        if (scope === "recent") sql += " AND created_at >= datetime('now', '-3 day')";
        if (scope === "unread") sql += " AND EXISTS (SELECT 1 FROM chat_messages c WHERE c.student_id = students.id AND c.sender = 'student' AND c.read_at IS NULL)";
        if (scope === "linked") sql += " AND user_id IS NOT NULL";
        if (scope === "checkins") {
          const cfg = await getCheckinConfig(env);
          const cutoff = new Date(Date.now() - periodDays(cfg) * 86400000).toISOString().slice(0, 10);
          sql += " AND status = 'ativo' AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.student_id = students.id AND c.answered_at >= ?)";
          binds.push(cutoff);
        }
        sql += " ORDER BY CASE status WHEN 'ativo' THEN 0 WHEN 'pendente' THEN 1 WHEN 'suspenso' THEN 2 ELSE 3 END, display_name ASC";
        const { results } = (await env.DB.prepare(sql).bind(...binds).all());
        return Response.json({ students: results });
      }
      // POST /api/professor/students — pré-registro
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const display_name = typeof body.display_name === "string" ? body.display_name.trim() : "";
        const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : "";
        if (!display_name) return Response.json({ error: "Informe o nome do aluno." }, { status: 400 });
        const { meta } = await env.DB
          .prepare("INSERT INTO students (user_id, owner_user_id, username, display_name, status, subscription_required) VALUES (NULL, ?, ?, ?, 'pendente', 1)")
          .bind(me.userId, username || null, display_name)
          .run();
        await log(env, {
          actorId: me.userId,
          actorRole: "professor",
          action: "create_student",
          entity: "student",
          entityId: String(meta.last_row_id),
          after: { display_name, username: username || null },
        });
        const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(Number(meta.last_row_id)).first();
        return Response.json({ student });
      }
    }
    if (studentsMatch && !me.isOwner) {
      return Response.json({ error: "Somente o professor." }, { status: 403 });
    }

    // ---- Anamnese (aluno, próprio) ----
    const studentAnamFileDelete = url.pathname.match(/^\/api\/student\/me\/anamnesis\/files\/([a-zA-Z0-9_-]+)$/);
    const professionalAnamFileDelete = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/anamnesis\/files\/([a-zA-Z0-9_-]+)$/);
    if ((studentAnamFileDelete || professionalAnamFileDelete) && request.method === "DELETE") {
      if (!me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
      let studentId;
      let token;
      if (professionalAnamFileDelete) {
        studentId = Number(professionalAnamFileDelete[1]);
        token = professionalAnamFileDelete[2];
        if (!me.isOwner || !(await professionalOwnsStudent(env, me, studentId))) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      } else {
        const student = await studentForRequest(env, request, me);
        if (!student) return Response.json({ error: "Sem vínculo de aluno." }, { status: 403 });
        studentId = student.id;
        token = studentAnamFileDelete[1];
      }
      if (!env.BLOB) return Response.json({ error: "Armazenamento privado não disponível." }, { status: 503 });
      const upload = await env.DB.prepare("SELECT * FROM chat_uploads WHERE token=? AND student_id=?").bind(token, studentId).first();
      if (!upload) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
      const anamnesisRow = await env.DB.prepare("SELECT * FROM anamnesis WHERE student_id=?").bind(studentId).first();
      const storedData = parsedAnamnesisData(anamnesisRow?.data);
      const isLinkedHealthFile = Array.isArray(storedData.health_document_tokens) && storedData.health_document_tokens.includes(token);
      if (storedData.diet_file_token === token || (!isLinkedHealthFile && upload.uploader_user_id !== me.userId) || (upload.used_at && !isLinkedHealthFile)) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
      if (isLinkedHealthFile) {
        storedData.health_document_tokens = storedData.health_document_tokens.filter((item) => item !== token);
        if (anamnesisRow) await env.DB.prepare("UPDATE anamnesis SET data=?, user_id=?, updated_at=datetime('now') WHERE student_id=?").bind(JSON.stringify(storedData), me.userId, studentId).run();
      }
      if (!upload.used_at) {
        await env.BLOB.delete(upload.file_url);
        await env.DB.prepare("DELETE FROM chat_uploads WHERE token=? AND student_id=? AND used_at IS NULL").bind(token, studentId).run();
      }
      const updatedRow = await env.DB.prepare("SELECT * FROM anamnesis WHERE student_id=?").bind(studentId).first();
      const updatedData = updatedRow ? await hydrateAnamnesisData(env, studentId, parsedAnamnesisData(updatedRow.data)) : null;
      return Response.json({ ok: true, anamnesis: updatedRow ? { data: updatedData, status: updatedRow.status, updated_at: updatedRow.updated_at } : null }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (url.pathname === "/api/student/me/anamnesis") {
      const student = await studentForRequest(env, request, me);
      if (request.method === "GET") {
        if (!me.signedIn || !student) return Response.json({ anamnesis: null });
        const row = (await env.DB.prepare("SELECT * FROM anamnesis WHERE student_id = ?").bind(student.id).first()) ?? null;
        const data = row ? await hydrateAnamnesisData(env, student.id, parsedAnamnesisData(row.data)) : null;
        return Response.json({ anamnesis: row ? { data, status: row.status, updated_at: row.updated_at } : null }, { headers: { "Cache-Control": "private, no-store" } });
      }
      if (request.method === "PUT") {
        if (!me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
        if (!student) return Response.json({ error: "Sem vínculo de aluno." }, { status: 403 });
        const body = await request.json().catch(() => ({}));
        if (typeof body.data !== "object" || body.data === null || Array.isArray(body.data)) {
          return Response.json({ error: "Dados inválidos." }, { status: 400 });
        }
        const data = { ...body.data };
        const existing = await env.DB.prepare("SELECT data FROM anamnesis WHERE student_id=?").bind(student.id).first();
        const prepared = await prepareAnamnesisData(env, { incoming: data, previous: parsedAnamnesisData(existing?.data), studentId: student.id, editorUserId: me.userId });
        if (prepared.error) return Response.json({ error: prepared.error }, { status: 400 });
        delete data.health_documents;
        data.health_document_tokens = prepared.data.health_document_tokens;
        if (data.diet_following === "sim" && typeof data.diet_file_token === "string" && data.diet_file_token) {
          const file = await env.DB.prepare("SELECT file_name, uploader_user_id FROM chat_uploads WHERE token=? AND student_id=?").bind(data.diet_file_token, student.id).first();
          if (!file || (file.uploader_user_id !== me.userId && parsedAnamnesisData(existing?.data).diet_file_token !== data.diet_file_token)) return Response.json({ error: "O arquivo não está vinculado a esta conta." }, { status: 400 });
          data.diet_file = { file_name: file.file_name };
        } else {
          delete data.diet_file_token;
          delete data.diet_file;
        }
        const status = body.status === "preenchida" ? "preenchida" : "pendente";
        const res = await upsertAnamnesis(env, student.id, data, status, me.userId);
        const wasComplete = ["preenchida", "revisada"].includes(res.beforeStatus);
        if (status === "preenchida" && !wasComplete) await notify(env, {
          recipients: [me.ownerId].filter(Boolean), title: "Aluno pronto para atendimento",
          body: "Um aluno concluiu o onboarding e está pronto para acompanhamento. Acesse a ficha protegida no aplicativo.",
          path: `/alunos?student_id=${student.id}&focus=anamnese&entity_type=anamnesis&entity_id=${student.id}`, idempotencyKey: `onboarding-complete:${student.id}`, email: true, ctx,
        });
        await log(env, {
          actorId: me.userId,
          actorRole: "aluno",
          action: "anamnesis_save",
          entity: "anamnesis",
          entityId: String(student.id),
          before: res.before ? { exists: true } : null,
          after: { status },
        });
        const row = await env.DB.prepare("SELECT * FROM anamnesis WHERE student_id = ?").bind(student.id).first();
        const savedData = await hydrateAnamnesisData(env, student.id, parsedAnamnesisData(row.data));
        return Response.json({ anamnesis: { data: savedData, status: row.status, updated_at: row.updated_at } }, { headers: { "Cache-Control": "private, no-store" } });
      }
    }

    // ---- Anamnese (professor) ----
    const anamMatch = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/anamnesis$/);
    if (anamMatch && me.isOwner) {
      const studentId = Number(anamMatch[1]);
      if (!(await professionalOwnsStudent(env, me, studentId))) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      const student = (await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(studentId).first()) ?? null;
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      if (request.method === "GET") {
        const row = (await env.DB.prepare("SELECT * FROM anamnesis WHERE student_id = ?").bind(studentId).first()) ?? null;
        const data = row ? await hydrateAnamnesisData(env, studentId, parsedAnamnesisData(row.data)) : null;
        const account = await env.DB.prepare("SELECT username, email FROM app_users WHERE student_id=? AND role='student' AND status='ativo' ORDER BY created_at DESC LIMIT 1").bind(studentId).first();
        return Response.json({
          anamnesis: row ? { data, status: row.status, updated_at: row.updated_at } : null,
          student: { id: studentId, display_name: student.display_name || data?.nome || "", username: account?.username || student.username || "", email: account?.email || data?.email || "" },
          hasHistory: !!row,
        }, { headers: { "Cache-Control": "private, no-store" } });
      }
      if (request.method === "PUT") {
        const body = await request.json().catch(() => ({}));
        if (typeof body.data !== "object" || body.data === null || Array.isArray(body.data)) {
          return Response.json({ error: "Dados inválidos." }, { status: 400 });
        }
        const existing = await env.DB.prepare("SELECT data FROM anamnesis WHERE student_id=?").bind(studentId).first();
        const prepared = await prepareAnamnesisData(env, { incoming: body.data, previous: parsedAnamnesisData(existing?.data), studentId, editorUserId: me.userId });
        if (prepared.error) return Response.json({ error: prepared.error }, { status: 400 });
        const status = body.status === "revisada" ? "revisada" : body.status === "preenchida" ? "preenchida" : "pendente";
        const res = await upsertAnamnesis(env, studentId, prepared.data, status, me.userId);
        await log(env, {
          actorId: me.userId,
          actorRole: "professor",
          action: "anamnesis_review",
          entity: "anamnesis",
          entityId: String(studentId),
          before: res.before ? { exists: true } : null,
          after: { status },
        });
        const row = await env.DB.prepare("SELECT * FROM anamnesis WHERE student_id = ?").bind(studentId).first();
        const savedData = await hydrateAnamnesisData(env, studentId, parsedAnamnesisData(row.data));
        return Response.json({ anamnesis: { data: savedData, status: row.status, updated_at: row.updated_at } }, { headers: { "Cache-Control": "private, no-store" } });
      }
    }

    // ---- Avaliações físicas ----
    // Rota única: /api/student/me/evaluations ou /api/professor/students/:sid/evaluations (+ /:eid)
    let evalPath = null;
    const profEval = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/evaluations(?:\/(\d+))?$/);
    const studEval = url.pathname.match(/^\/api\/student\/me\/evaluations(?:\/(\d+))?$/);

    let evalStudentId = null;
    if (profEval && me.isOwner) evalStudentId = Number(profEval[1]);
    if (studEval) {
      const st = await studentForRequest(env, request, me);
      if (st) evalStudentId = st.id;
    }
    const evalRoute = profEval || studEval;
    if (profEval && !me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
    if (studEval && !me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
    if (evalRoute && evalStudentId) {
      const eid = evalRoute[1] ? (profEval ? Number(profEval[2]) : Number(studEval[1])) : null;
      const sid = evalStudentId;

      // Valida que esta avaliação pertence ao aluno (segurança em profundidade)
      if (eid) {
        const owner = (await env.DB.prepare("SELECT student_id FROM evaluations WHERE id = ?").bind(eid).first());
        if (!owner) return Response.json({ error: "Avaliação não encontrada." }, { status: 404 });
        if (owner.student_id !== sid) return Response.json({ error: "Sem permissão." }, { status: 403 });
      }

      const full = async (id) => {
        const ev = (await env.DB.prepare("SELECT * FROM evaluations WHERE id = ?").bind(id).first());
        const get = async (tbl) => {
          const { results } = await env.DB.prepare(`SELECT * FROM ${tbl} WHERE evaluation_id = ? AND COALESCE(status, 'ativo') <> 'arquivado' ORDER BY id`).bind(id).all();
          return results;
        };
        return {
          ...ev,
          measurements: await get("evaluation_measurements"),
          skinfolds: await get("evaluation_skinfolds"),
          tests: await get("evaluation_tests"),
          photos: (await get("evaluation_photos")).map((photo) => ({ ...photo, url: `/api/evaluation/photos/${photo.id}` })),
        };
      };

      const insertEval = async (studentId, body) => {
        const date = (body.date || new Date().toISOString().slice(0, 10));
        const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
        const { meta } = await env.DB
          .prepare("INSERT INTO evaluations (student_id, date, weight, height, notes, user_id) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(studentId, date, num(body.weight), num(body.height), body.notes ?? null, me.userId)
          .run();
        const id = Number(meta.last_row_id);
        await replaceContent(env, id, body, me.userId);
        return id;
      };

      if (request.method === "GET") {
        if (!eid) {
          const { results } = await env.DB
          .prepare("SELECT e.id, e.date, e.weight, e.height, e.notes, e.created_at, (SELECT COUNT(*) FROM evaluation_measurements m WHERE m.evaluation_id=e.id AND COALESCE(m.status,'ativo') <> 'arquivado') AS measurements_count FROM evaluations e WHERE e.student_id = ? AND COALESCE(e.status,'ativa') <> 'arquivada' ORDER BY e.date ASC")
            .bind(sid)
            .all();
          return Response.json({ evaluations: results });
        }
        const ev = await full(eid);
        return Response.json({ evaluation: ev });
      }
      if (request.method === "POST") {
        if (studEval) return Response.json({ error: "O aluno pode apenas visualizar avaliações profissionais." }, { status: 403 });
        const body = await request.json().catch(() => ({}));
        const validation = validateEvaluationContent(body);
        if (validation.error) return Response.json({ error: validation.error }, { status: 400 });
        Object.assign(body, validation.content);
        const id = await insertEval(sid, body);
        await log(env, { actorId: me.userId, actorRole: me.isOwner ? "professor" : "aluno", action: "create_evaluation", entity: "evaluation", entityId: String(id), after: { student_id: sid, date: body.date } });
        return Response.json({ evaluation: await full(id) });
      }
      if (request.method === "PUT" && eid) {
        if (studEval) return Response.json({ error: "O aluno pode apenas visualizar avaliações profissionais." }, { status: 403 });
        const body = await request.json().catch(() => ({}));
        const validation = validateEvaluationContent(body);
        if (validation.error) return Response.json({ error: validation.error }, { status: 400 });
        Object.assign(body, validation.content);
        const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
        const cur = (await env.DB.prepare("SELECT * FROM evaluations WHERE id = ?").bind(eid).first());
        const before = { date: cur.date, weight: cur.weight, height: cur.height, notes: cur.notes };
        await env.DB
          .prepare("UPDATE evaluations SET date = ?, weight = ?, height = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(body.date ?? cur.date, num(body.weight ?? cur.weight), num(body.height ?? cur.height), body.notes ?? cur.notes, eid)
          .run();
        if (body.replaceContent) await replaceContent(env, eid, body, me.userId);
        await log(env, { actorId: me.userId, actorRole: me.isOwner ? "professor" : "aluno", action: "update_evaluation", entity: "evaluation", entityId: String(eid), before, after: { date: body.date } });
        return Response.json({ evaluation: await full(eid) });
      }
      if (request.method === "DELETE" && eid && me.isOwner) {
        const current = await env.DB.prepare("SELECT * FROM evaluations WHERE id = ?").bind(eid).first();
        await env.DB.prepare("UPDATE evaluations SET status = 'arquivada', updated_at = datetime('now') WHERE id = ?").bind(eid).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "archive_evaluation", entity: "evaluation", entityId: String(eid), before: current, after: { status: "arquivada" } });
        return Response.json({ ok: true });
      }
    }

    const evaluationPhotoMatch = url.pathname.match(/^\/api\/evaluation\/photos\/(\d+)$/);
    if (evaluationPhotoMatch) {
      const photoId = Number(evaluationPhotoMatch[1]);
      if (request.method === "GET") {
        if (!me.signedIn || !env.BLOB) return new Response("Not found", { status: 404 });
        const photo = await env.DB.prepare("SELECT ep.*, e.student_id FROM evaluation_photos ep JOIN evaluations e ON e.id=ep.evaluation_id WHERE ep.id=? AND COALESCE(ep.status,'ativo') <> 'arquivado'").bind(photoId).first();
        if (!photo) return new Response("Not found", { status: 404 });
        const ownStudent = !me.isOwner ? await studentByUser(env, me.userId) : null;
        if (!me.isOwner && (!ownStudent || ownStudent.id !== photo.student_id)) return new Response("Not found", { status: 404 });
        if (me.isOwner && !(await professionalOwnsStudent(env, me, Number(photo.student_id)))) return new Response("Not found", { status: 404 });
        const object = await env.BLOB.get(photo.url);
        if (!object) return new Response("Not found", { status: 404 });
        return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
      }
      if (request.method === "DELETE") {
        if (!me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
        if (!env.BLOB) return Response.json({ error: "Armazenamento de fotos indisponível." }, { status: 503 });
        const photo = await env.DB.prepare("SELECT ep.*, e.student_id FROM evaluation_photos ep JOIN evaluations e ON e.id=ep.evaluation_id WHERE ep.id=? AND COALESCE(ep.status,'ativo') <> 'arquivado'").bind(photoId).first();
        if (!photo) return Response.json({ error: "Foto não encontrada." }, { status: 404 });
        let canDelete = false;
        let actorRole = "aluno";
        if (me.isOwner) {
          canDelete = await professionalOwnsStudent(env, me, Number(photo.student_id));
          actorRole = "professor";
        } else {
          const ownStudent = await studentByUser(env, me.userId);
          canDelete = !!ownStudent && Number(ownStudent.id) === Number(photo.student_id) && String(photo.user_id) === String(me.userId);
        }
        if (!canDelete) return Response.json({ error: "Você não tem permissão para excluir esta foto." }, { status: 403 });
        const object = await env.BLOB.get(photo.url);
        if (!object) return Response.json({ error: "Arquivo da foto não encontrado no armazenamento privado." }, { status: 404 });
        const bytes = await object.arrayBuffer();
        const contentType = photo.content_type || object.httpMetadata?.contentType || "application/octet-stream";
        await env.BLOB.delete(photo.url);
        try {
          await env.DB.prepare("UPDATE evaluation_photos SET status='arquivado' WHERE id=? AND COALESCE(status,'ativo') <> 'arquivado'").bind(photoId).run();
        } catch (error) {
          await env.BLOB.put(photo.url, bytes, { httpMetadata: { contentType } }).catch(() => {});
          throw error;
        }
        await log(env, { actorId: me.userId, actorRole: actorRole, action: "delete_evaluation_photo", entity: "evaluation_photo", entityId: String(photoId), before: { evaluation_id: photo.evaluation_id, kind: photo.kind }, after: { status: "arquivado" } });
        return Response.json({ ok: true, photoId });
      }
    }

    // ---- Upload de foto de avaliação ----
    if (request.method === "POST" && url.pathname === "/api/photo/upload") {
      const userId = me.userId;
      if (!userId) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
      if (!me.isOwner) return Response.json({ error: "Somente o profissional pode anexar fotos à avaliação." }, { status: 403 });
      const eid = Number(url.searchParams.get("evaluation"));
      const kind = url.searchParams.get("kind") || "outras";
      if (!eid) return Response.json({ error: "Avaliação obrigatória." }, { status: 400 });
      if (!["frente", "costas", "lado direito", "lado esquerdo", "outras"].includes(kind)) return Response.json({ error: "Tipo de foto inválido." }, { status: 400 });
       const ev = (await env.DB.prepare("SELECT e.* FROM evaluations e JOIN students s ON s.id=e.student_id WHERE e.id = ? AND s.owner_user_id=?").bind(eid, me.userId).first());
      if (!ev) return Response.json({ error: "Avaliação não encontrada." }, { status: 404 });
      // Avaliações profissionais e seus anexos são registrados pelo professor.
       if (!me.isOwner) return Response.json({ error: "Somente o professor pode anexar fotos à avaliação." }, { status: 403 });

      const contentType = request.headers.get("content-type") ?? "";
      const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
      if (!allowedPhotoTypes.has(contentType)) return Response.json({ error: "Envie JPG, PNG ou WebP." }, { status: 400 });
      const bytes = await request.arrayBuffer();
      if (!env.BLOB) return Response.json({ error: "Armazenamento de fotos indisponível." }, { status: 503 });
      if (bytes.byteLength < 16 || bytes.byteLength > 8 * 1024 * 1024) return Response.json({ error: "Imagem inválida ou maior que 8 MB." }, { status: 400 });
      const head = new Uint8Array(bytes.slice(0, 12));
      const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
      const webp = new TextDecoder().decode(head.slice(0, 4)) === "RIFF" && new TextDecoder().decode(head.slice(8, 12)) === "WEBP";
      if ((contentType === "image/jpeg" && !jpeg) || (contentType === "image/png" && !png) || (contentType === "image/webp" && !webp)) return Response.json({ error: "O conteúdo não corresponde ao tipo informado." }, { status: 400 });
      const blobUrl = `evaluations/${randomId()}`;
      await env.BLOB.put(blobUrl, bytes, { httpMetadata: { contentType } });
      const { meta } = await env.DB
        .prepare("INSERT INTO evaluation_photos (evaluation_id, kind, url, user_id) VALUES (?, ?, ?, ?)")
        .bind(eid, kind, blobUrl, userId)
        .run();
      return Response.json({ photo: { id: Number(meta.last_row_id), evaluation_id: eid, kind, url: `/api/evaluation/photos/${Number(meta.last_row_id)}` } });
    }

    // ---- Biblioteca de exercícios ----
    if (request.method === "GET" && url.pathname === "/api/exercise-categories") {
      if (!me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
      const student = me.isOwner ? null : await studentByUser(env, me.userId);
      if (!me.isOwner && !student) return Response.json({ error: "Sem vínculo de aluno." }, { status: 403 });
      const query = me.isOwner
        ? env.DB.prepare("SELECT name FROM exercise_categories ORDER BY sort ASC")
        : env.DB.prepare("SELECT DISTINCT c.name FROM exercise_categories c JOIN exercises e ON e.category = c.name WHERE e.status = 'ativo' AND EXISTS (SELECT 1 FROM prescriptions pr JOIN workouts w ON w.id = pr.workout_id JOIN training_phases ph ON ph.id = w.phase_id JOIN training_programs pg ON pg.id = ph.program_id WHERE pr.exercise_id = e.id AND pg.student_id = ? AND COALESCE(pr.status, 'ativo') <> 'arquivado') ORDER BY c.sort ASC").bind(student.id);
      const { results } = await query.all();
      return Response.json({ categories: results.map((r) => r.name) });
    }

    const exMatch = url.pathname.match(/^\/api\/exercises(?:\/(\d+))?$/);
    if (exMatch) {
      const id = exMatch[1];
      if (request.method === "GET") {
        if (!me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
        const student = me.isOwner ? null : await studentByUser(env, me.userId);
        if (!me.isOwner && !student) return Response.json({ error: "Sem vínculo de aluno." }, { status: 403 });
        if (id) {
          const ex = me.isOwner
            ? await env.DB.prepare("SELECT * FROM exercises WHERE id = ?").bind(Number(id)).first()
            : await env.DB.prepare("SELECT e.* FROM exercises e WHERE e.id = ? AND e.status = 'ativo' AND EXISTS (SELECT 1 FROM prescriptions pr JOIN workouts w ON w.id=pr.workout_id JOIN training_phases ph ON ph.id=w.phase_id JOIN training_programs pg ON pg.id=ph.program_id WHERE pr.exercise_id=e.id AND pg.student_id=? AND COALESCE(pr.status, 'ativo') <> 'arquivado')").bind(Number(id), student.id).first();
          if (!ex) return Response.json({ error: "Exercício não encontrado." }, { status: 404 });
          return Response.json({ exercise: ex });
        }
        const cat = url.searchParams.get("category");
        const q = (url.searchParams.get("q") ?? "").trim();
        let sql = "SELECT e.id, e.name, e.category, e.tags, e.equipment, e.video_url, e.status FROM exercises e WHERE 1=1";
        const binds = [];
        if (!me.isOwner) {
          sql += " AND e.status = 'ativo' AND EXISTS (SELECT 1 FROM prescriptions pr JOIN workouts w ON w.id=pr.workout_id JOIN training_phases ph ON ph.id=w.phase_id JOIN training_programs pg ON pg.id=ph.program_id WHERE pr.exercise_id=e.id AND pg.student_id=? AND COALESCE(pr.status, 'ativo') <> 'arquivado')";
          binds.push(student.id);
        }
        if (cat) { sql += " AND category = ?"; binds.push(cat); }
        if (q) { sql += " AND (e.name LIKE ? OR e.tags LIKE ?)"; binds.push(`%${q}%`, `%${q}%`); }
        sql += " ORDER BY e.category, e.name";
        const { results } = (await env.DB.prepare(sql).bind(...binds).all());
        return Response.json({ exercises: results });
      }

      if (!me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });

      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const name = (b.name || "").trim();
        if (!name) return Response.json({ error: "Informe o nome do exercício." }, { status: 400 });
        const videoUrl = (b.video_url || "").trim();
        if (videoUrl && !normalizeVideoUrl(videoUrl)) return Response.json({ error: "Informe um link válido do YouTube ou Vimeo." }, { status: 400 });
        const { meta } = await env.DB
          .prepare("INSERT INTO exercises (name, category, tags, equipment, description, instructions, common_errors, observations, video_url, status, visibility, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(name, (b.category || "").trim() || "Específico", b.tags || "", b.equipment || "", b.description || "", b.instructions || "", b.common_errors || "", b.observations || "", videoUrl, b.status === "inativo" ? "inativo" : "ativo", b.visibility || "privado", me.userId)
          .run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "create_exercise", entity: "exercise", entityId: String(meta.last_row_id), after: { name } });
        const ex = await env.DB.prepare("SELECT * FROM exercises WHERE id = ?").bind(Number(meta.last_row_id)).first();
        return Response.json({ exercise: ex });
      }

      if ((request.method === "PUT" || request.method === "DELETE") && id) {
        const ex = (await env.DB.prepare("SELECT * FROM exercises WHERE id = ?").bind(Number(id)).first()) ?? null;
        if (!ex) return Response.json({ error: "Exercício não encontrado." }, { status: 404 });
        if (request.method === "DELETE") {
          await env.DB.prepare("UPDATE exercises SET status = 'inativo', updated_at = datetime('now') WHERE id = ?").bind(Number(id)).run();
          await log(env, { actorId: me.userId, actorRole: "professor", action: "archive_exercise", entity: "exercise", entityId: id, before: ex, after: { status: "inativo" } });
          return Response.json({ ok: true });
        }
        const b = await request.json().catch(() => ({}));
        if (Object.prototype.hasOwnProperty.call(b, "video_url")) {
          const videoUrl = (b.video_url || "").trim();
          if (videoUrl && !normalizeVideoUrl(videoUrl)) return Response.json({ error: "Informe um link válido do YouTube ou Vimeo." }, { status: 400 });
        }
        const next = {
          name: (b.name || "").trim() || ex.name,
          category: (b.category || "").trim() || ex.category,
          tags: b.tags ?? ex.tags, equipment: b.equipment ?? ex.equipment,
          description: b.description ?? ex.description, instructions: b.instructions ?? ex.instructions,
          common_errors: b.common_errors ?? ex.common_errors, observations: b.observations ?? ex.observations,
          video_url: Object.prototype.hasOwnProperty.call(b, "video_url") ? (b.video_url || "").trim() : ex.video_url,
          status: ["ativo", "inativo"].includes(b.status) ? b.status : ex.status,
          visibility: b.visibility ?? ex.visibility,
        };
        const before = { name: ex.name, category: ex.category, status: ex.status };
        await env.DB
          .prepare("UPDATE exercises SET name=?, category=?, tags=?, equipment=?, description=?, instructions=?, common_errors=?, observations=?, video_url=?, status=?, visibility=?, updated_at=datetime('now') WHERE id=?")
          .bind(next.name, next.category, next.tags, next.equipment, next.description, next.instructions, next.common_errors, next.observations, next.video_url, next.status, next.visibility, Number(id))
          .run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "update_exercise", entity: "exercise", entityId: id, before, after: { name: next.name, category: next.category } });
        const updated = await env.DB.prepare("SELECT * FROM exercises WHERE id = ?").bind(Number(id)).first();
        return Response.json({ exercise: updated });
      }
    }

    // ---- Sistema de treinamento ----
    const ownerGuard = () => { if (!me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 }); if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 }); };

const buildTree = async (studentId) => studentTree(env, studentId);

    // GET árvore completa do aluno
    const treeMatch = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/training$/);
    if (treeMatch && me.isOwner) {
      return Response.json({ programs: await buildTree(Number(treeMatch[1])) });
    }

    // Programas
    const progMatch = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/programs(?:\/(\d+))?$/);
    if (progMatch && me.isOwner) {
      const sid = Number(progMatch[1]);
      const pid = progMatch[2] ? Number(progMatch[2]) : null;
      const student = await env.DB.prepare("SELECT id FROM students WHERE id = ?").bind(sid).first();
      if (!student) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      if (pid) {
        const belongs = await env.DB.prepare("SELECT id FROM training_programs WHERE id = ? AND student_id = ?").bind(pid, sid).first();
        if (!belongs) return Response.json({ error: "Programa não pertence a este aluno." }, { status: 403 });
      }
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        if (!(b.name || "").trim()) return Response.json({ error: "Informe o nome do programa." }, { status: 400 });
        const { meta } = await env.DB.prepare("INSERT INTO training_programs (student_id, name, notes) VALUES (?, ?, ?)").bind(sid, b.name.trim(), b.notes || null).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "create_program", entity: "program", entityId: String(meta.last_row_id), after: { student_id: sid, name: b.name.trim() } });
        return Response.json({ program: await env.DB.prepare("SELECT * FROM training_programs WHERE id = ?").bind(Number(meta.last_row_id)).first() });
      }
      if (pid && (request.method === "PATCH" || request.method === "DELETE")) {
        if (request.method === "DELETE") {
          const current = await env.DB.prepare("SELECT * FROM training_programs WHERE id = ?").bind(pid).first();
          await env.DB.prepare("UPDATE training_programs SET status = 'arquivado', updated_at = datetime('now') WHERE id = ?").bind(pid).run();
          await log(env, { actorId: me.userId, actorRole: "professor", action: "archive_program", entity: "program", entityId: String(pid), before: current, after: { status: "arquivado" } });
          return Response.json({ ok: true });
        }
        const b = await request.json().catch(() => ({}));
        const current = await env.DB.prepare("SELECT * FROM training_programs WHERE id = ?").bind(pid).first();
        await env.DB.prepare("UPDATE training_programs SET name = COALESCE(?, name), notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?").bind(b.name ?? null, b.notes ?? null, pid).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "update_program", entity: "program", entityId: String(pid), before: current, after: { name: b.name ?? current.name, notes: b.notes ?? current.notes } });
        return Response.json({ program: await env.DB.prepare("SELECT * FROM training_programs WHERE id = ?").bind(pid).first() });
      }
      if (!progMatch[2] && request.method === "GET") {
        return Response.json({ programs: await buildTree(sid) });
      }
      return new Response("Not found", { status: 404 });
    }

    // Fases: /api/professor/programs/:pid/phases/:phid?
    const phaseMatch = url.pathname.match(/^\/api\/professor\/programs\/(\d+)\/phases(?:\/(\d+))?$/);
    if (phaseMatch && me.isOwner) {
      const pid = Number(phaseMatch[1]);
      const phid = phaseMatch[2] ? Number(phaseMatch[2]) : null;
      const prog = (await env.DB.prepare("SELECT * FROM training_programs WHERE id = ?").bind(pid).first());
      if (!prog) return Response.json({ error: "Programa não encontrado." }, { status: 404 });
      if (!(await professionalOwnsStudent(env, me, Number(prog.student_id)))) return Response.json({ error: "Programa não encontrado." }, { status: 404 });
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const { meta } = await env.DB.prepare("INSERT INTO training_phases (program_id, name, target, order_idx) VALUES (?, ?, ?, ?)").bind(pid, (b.name || "").trim() || "Fase", b.target || null, b.order_idx ?? 0).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "create_phase", entity: "phase", entityId: String(meta.last_row_id), after: { program_id: pid, name: (b.name || "").trim() || "Fase" } });
        return Response.json({ phase: await env.DB.prepare("SELECT * FROM training_phases WHERE id = ?").bind(Number(meta.last_row_id)).first() });
      }
      if (phid && (request.method === "PATCH" || request.method === "DELETE")) {
        const phase = await env.DB.prepare("SELECT * FROM training_phases WHERE id = ? AND program_id = ?").bind(phid, pid).first();
        if (!phase) return Response.json({ error: "Fase não pertence ao programa." }, { status: 403 });
        if (request.method === "DELETE") { await env.DB.prepare("UPDATE training_phases SET status = 'arquivado' WHERE id = ?").bind(phid).run(); await log(env, { actorId: me.userId, actorRole: "professor", action: "archive_phase", entity: "phase", entityId: String(phid), before: phase, after: { status: "arquivado" } }); return Response.json({ ok: true }); }
        const b = await request.json().catch(() => ({}));
        await env.DB.prepare("UPDATE training_phases SET name = COALESCE(?, name), target = COALESCE(?, target), order_idx = COALESCE(?, order_idx) WHERE id = ?").bind(b.name ?? null, b.target ?? null, b.order_idx ?? null, phid).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "update_phase", entity: "phase", entityId: String(phid), before: phase, after: { name: b.name ?? phase.name, target: b.target ?? phase.target } });
        return Response.json({ phase: await env.DB.prepare("SELECT * FROM training_phases WHERE id = ?").bind(phid).first() });
      }
      return new Response("Not found", { status: 404 });
    }

    // Ordem dos treinos dentro de uma fase/programa.
    const workoutOrderMatch = url.pathname.match(/^\/api\/professor\/phases\/(\d+)\/workouts\/reorder$/);
    if (workoutOrderMatch && me.isOwner && request.method === "PATCH") {
      const phid = Number(workoutOrderMatch[1]);
      const phaseOwner = await env.DB.prepare("SELECT ph.id, pr.student_id FROM training_phases ph JOIN training_programs pr ON pr.id=ph.program_id WHERE ph.id=? AND COALESCE(ph.status,'ativo') <> 'arquivado' AND COALESCE(pr.status,'ativo') <> 'arquivado'").bind(phid).first();
      if (!phaseOwner || !(await professionalOwnsStudent(env, me, Number(phaseOwner.student_id)))) return Response.json({ error: "Fase não encontrada." }, { status: 404 });
      const body = await request.json().catch(() => ({}));
      const order = Array.isArray(body.order) ? body.order.map(Number) : [];
      const current = (await env.DB.prepare("SELECT id FROM workouts WHERE phase_id=? AND COALESCE(status,'ativo') <> 'arquivado' ORDER BY order_idx, id").bind(phid).all()).results;
      const currentIds = current.map((row) => Number(row.id));
      if (order.length !== currentIds.length || new Set(order).size !== order.length || order.some((id) => !currentIds.includes(id))) {
        return Response.json({ error: "A ordem enviada não corresponde aos treinos desta fase." }, { status: 400 });
      }
      try {
        await env.DB.batch(order.map((id, index) => env.DB.prepare("UPDATE workouts SET order_idx=? WHERE id=? AND phase_id=? AND COALESCE(status,'ativo') <> 'arquivado'").bind(index + 1, id, phid)));
      } catch (error) {
        return Response.json({ error: "Não foi possível salvar a nova ordem." }, { status: 500 });
      }
      await log(env, { actorId: me.userId, actorRole: "professor", action: "reorder_workouts", entity: "phase", entityId: String(phid), after: { order } });
      const workouts = (await env.DB.prepare("SELECT * FROM workouts WHERE phase_id=? AND COALESCE(status,'ativo') <> 'arquivado' ORDER BY order_idx, id").bind(phid).all()).results;
      return Response.json({ workouts });
    }

    // Treinos: /api/professor/phases/:phid/workouts/:wid?
    const wkMatch = url.pathname.match(/^\/api\/professor\/phases\/(\d+)\/workouts(?:\/(\d+))?$/);
    if (wkMatch && me.isOwner) {
      const phid = Number(wkMatch[1]);
      const wid = wkMatch[2] ? Number(wkMatch[2]) : null;
      const phase = (await env.DB.prepare("SELECT * FROM training_phases WHERE id = ?").bind(phid).first());
      if (!phase) return Response.json({ error: "Fase não encontrada." }, { status: 404 });
      const phaseOwner = await env.DB.prepare("SELECT pr.student_id FROM training_programs pr JOIN training_phases ph ON ph.program_id = pr.id WHERE ph.id = ?").bind(phid).first();
      if (!phaseOwner || !(await professionalOwnsStudent(env, me, Number(phaseOwner.student_id)))) return Response.json({ error: "Fase não encontrada." }, { status: 404 });
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const { meta } = await env.DB.prepare("INSERT INTO workouts (phase_id, label, name, order_idx) VALUES (?, ?, ?, ?)").bind(phid, b.label || null, b.name || null, b.order_idx ?? 0).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "create_workout", entity: "workout", entityId: String(meta.last_row_id), after: { phase_id: phid, name: b.name || null } });
        return Response.json({ workout: await env.DB.prepare("SELECT * FROM workouts WHERE id = ?").bind(Number(meta.last_row_id)).first() });
      }
      if (wid && (request.method === "PATCH" || request.method === "DELETE")) {
        const workout = await env.DB.prepare("SELECT * FROM workouts WHERE id = ? AND phase_id = ?").bind(wid, phid).first();
        if (!workout) return Response.json({ error: "Treino não pertence à fase." }, { status: 403 });
        if (request.method === "DELETE") { await env.DB.prepare("UPDATE workouts SET status = 'arquivado' WHERE id = ?").bind(wid).run(); await log(env, { actorId: me.userId, actorRole: "professor", action: "archive_workout", entity: "workout", entityId: String(wid), before: workout, after: { status: "arquivado" } }); return Response.json({ ok: true }); }
        const b = await request.json().catch(() => ({}));
        await env.DB.prepare("UPDATE workouts SET label = COALESCE(?, label), name = COALESCE(?, name), order_idx = COALESCE(?, order_idx) WHERE id = ?").bind(b.label ?? null, b.name ?? null, b.order_idx ?? null, wid).run();
        await log(env, { actorId: me.userId, actorRole: "professor", action: "update_workout", entity: "workout", entityId: String(wid), before: workout, after: { label: b.label ?? workout.label, name: b.name ?? workout.name } });
        return Response.json({ workout: await env.DB.prepare("SELECT * FROM workouts WHERE id = ?").bind(wid).first() });
      }
      return new Response("Not found", { status: 404 });
    }

    // Prescrições: /api/professor/workouts/:wid/prescriptions/:piid?
    const prMatch = url.pathname.match(/^\/api\/professor\/workouts\/(\d+)\/prescriptions(?:\/(\d+)|\/reorder)?$/);
    if (prMatch && me.isOwner) {
      const wid = Number(prMatch[1]);
      const piid = prMatch[2] ? Number(prMatch[2]) : null;
      const w = (await env.DB.prepare("SELECT * FROM workouts WHERE id = ?").bind(wid).first());
      if (!w) return Response.json({ error: "Treino não encontrado." }, { status: 404 });
      const workoutOwner = await env.DB.prepare("SELECT pr.student_id FROM training_programs pr JOIN training_phases ph ON ph.program_id = pr.id JOIN workouts w ON w.phase_id = ph.id WHERE w.id = ? AND COALESCE(w.status,'ativo') <> 'arquivado' AND COALESCE(ph.status,'ativo') <> 'arquivado' AND COALESCE(pr.status,'ativo') <> 'arquivado'").bind(wid).first();
      if (!workoutOwner || !(await professionalOwnsStudent(env, me, Number(workoutOwner.student_id)))) return Response.json({ error: "Treino não encontrado." }, { status: 404 });

      if (request.method === "PATCH" && url.pathname.endsWith("/prescriptions/reorder")) {
        const body = await request.json().catch(() => ({}));
        const order = Array.isArray(body.order) ? body.order.map((id) => Number(id)) : [];
        const current = (await env.DB.prepare("SELECT id FROM prescriptions WHERE workout_id=? AND COALESCE(status,'ativo') <> 'arquivado' ORDER BY order_idx, id").bind(wid).all()).results;
        const currentIds = current.map((row) => Number(row.id));
        if (order.some((id) => !Number.isSafeInteger(id)) || order.length !== currentIds.length || new Set(order).size !== order.length || order.some((id) => !currentIds.includes(id))) {
          return Response.json({ error: "A ordem enviada não corresponde aos exercícios deste treino." }, { status: 400 });
        }
        try {
          await env.DB.batch(order.map((id, index) => env.DB.prepare("UPDATE prescriptions SET order_idx=?, updated_at=datetime('now') WHERE id=? AND workout_id=? AND COALESCE(status,'ativo') <> 'arquivado'").bind(index + 1, id, wid)));
        } catch (error) {
          return Response.json({ error: "Não foi possível salvar a nova ordem dos exercícios." }, { status: 500 });
        }
        await log(env, { actorId: me.userId, actorRole: "professor", action: "reorder_prescriptions", entity: "workout", entityId: String(wid), after: { order } });
        const prescriptions = (await env.DB.prepare("SELECT * FROM prescriptions WHERE workout_id=? AND COALESCE(status,'ativo') <> 'arquivado' ORDER BY order_idx, id").bind(wid).all()).results;
        return Response.json({ prescriptions });
      }

      const norm = (b) => ({
        exercise_id: b.exercise_id ? Number(b.exercise_id) : null,
        exercise_name: (b.exercise_name || "").trim() || null,
        kind: b.kind || "exercise",
        sets: b.sets === "" || b.sets == null ? null : Number(b.sets),
        reps_min: b.reps_min === "" || b.reps_min == null ? null : Number(b.reps_min),
        reps_max: b.reps_max === "" || b.reps_max == null ? null : Number(b.reps_max),
        warmup_enabled: b.warmup_enabled === true || b.warmup_enabled === 1 || b.warmup_enabled === "1" ? 1 : 0,
        warmup_sets: b.warmup_sets === "" || b.warmup_sets == null ? null : Number(b.warmup_sets),
        warmup_reps_min: b.warmup_reps_min === "" || b.warmup_reps_min == null ? null : Number(b.warmup_reps_min),
        warmup_reps_max: b.warmup_reps_max === "" || b.warmup_reps_max == null ? null : Number(b.warmup_reps_max),
        warmup_load_mode: b.warmup_load_mode === "work_percent" ? "work_percent" : "fixed",
        warmup_load_value: typeof b.warmup_load_value === "string" || typeof b.warmup_load_value === "number" ? String(b.warmup_load_value).trim().slice(0, 80) || null : null,
        load: b.load ?? null, rir: b.rir ?? null, rest: b.rest ?? null, cadence: b.cadence ?? null,
        execution_speed: b.execution_speed ?? null,
        time_sec: b.time_sec === "" || b.time_sec == null ? null : Number(b.time_sec),
        note: b.note ?? null,
        reason: typeof b.reason === "string" ? b.reason.trim().slice(0, 500) || null : null,
        execution_guidance: typeof b.execution_guidance === "string" ? b.execution_guidance.trim().slice(0, 1000) || null : null,
        approved_alternative: typeof b.approved_alternative === "string" ? b.approved_alternative.trim().slice(0, 500) || null : null,
      });

      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        if (b.techniques != null && !Array.isArray(b.techniques)) return Response.json({ error: "As técnicas devem ser enviadas em uma lista." }, { status: 400 });
        if (b.exercise_id) {
          const ex = (await env.DB.prepare("SELECT id, name FROM exercises WHERE id = ?").bind(Number(b.exercise_id)).first());
          if (ex) b.exercise_name = ex.name;
        }
        if (!b.exercise_name && !b.exercise_id && b.kind === "exercise") return Response.json({ error: "Escolha um exercício." }, { status: 400 });
        const next = norm(b);
        const rangeError = prescriptionRangeError(next);
        if (rangeError) return Response.json({ error: rangeError }, { status: 400 });
        const count = (await env.DB.prepare("SELECT COUNT(*) c FROM prescriptions WHERE workout_id = ?").bind(wid).first()).c;
        const { meta } = await env.DB.prepare(
          "INSERT INTO prescriptions (workout_id, exercise_id, exercise_name, kind, order_idx, sets, reps_min, reps_max, warmup_enabled, warmup_sets, warmup_reps_min, warmup_reps_max, warmup_load_mode, warmup_load_value, load, rir, rest, cadence, execution_speed, time_sec, note, reason, execution_guidance, approved_alternative, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(wid, next.exercise_id, next.exercise_name, next.kind, count + 1, next.sets, next.reps_min, next.reps_max, next.warmup_enabled, next.warmup_sets, next.warmup_reps_min, next.warmup_reps_max, next.warmup_load_mode, next.warmup_load_value, next.load, next.rir, next.rest, next.cadence, next.execution_speed, next.time_sec, next.note, next.reason, next.execution_guidance, next.approved_alternative, me.userId).run();
        const newPrescriptionId = Number(meta.last_row_id);
        if (Array.isArray(b.techniques)) {
          const techniqueError = await savePrescriptionTechniques(env, newPrescriptionId, wid, b.techniques);
          if (techniqueError) { await env.DB.prepare("UPDATE prescriptions SET status='arquivado' WHERE id=? AND workout_id=?").bind(newPrescriptionId, wid).run(); return Response.json({ error: techniqueError }, { status: 400 }); }
        }
        await log(env, { actorId: me.userId, actorRole: "professor", action: "create_prescription", entity: "prescription", entityId: String(meta.last_row_id), after: { workout_id: wid, exercise_id: next.exercise_id, exercise_name: next.exercise_name, sets: next.sets, reps_min: next.reps_min, reps_max: next.reps_max } });
        return Response.json({ prescription: await prescriptionWithTechniques(env, await env.DB.prepare("SELECT * FROM prescriptions WHERE id = ?").bind(newPrescriptionId).first()) });
      }
      if (piid && (request.method === "PATCH" || request.method === "DELETE")) {
        if (request.method === "DELETE") {
          const current = await env.DB.prepare("SELECT * FROM prescriptions WHERE id = ? AND workout_id = ?").bind(piid, wid).first();
          if (!current) return Response.json({ error: "Prescrição não encontrada." }, { status: 404 });
          await env.DB.prepare("UPDATE prescriptions SET status = 'arquivado', updated_at = datetime('now') WHERE id = ? AND workout_id = ?").bind(piid, wid).run();
          await log(env, { actorId: me.userId, actorRole: "professor", action: "archive_prescription", entity: "prescription", entityId: String(piid), before: current, after: { status: "arquivado" } });
          return Response.json({ ok: true });
        }
        const b = await request.json().catch(() => ({}));
        if (b.techniques != null && !Array.isArray(b.techniques)) return Response.json({ error: "As técnicas devem ser enviadas em uma lista." }, { status: 400 });
        const cur = (await env.DB.prepare("SELECT * FROM prescriptions WHERE id = ? AND workout_id = ?").bind(piid, wid).first());
        if (!cur) return Response.json({ error: "Prescrição não encontrada." }, { status: 404 });
        if (b.exercise_id && Number(b.exercise_id) !== cur.exercise_id) {
          const ex = (await env.DB.prepare("SELECT id, name FROM exercises WHERE id = ?").bind(Number(b.exercise_id)).first());
          if (ex) { b.exercise_id = ex.id; b.exercise_name = ex.name; }
        }
        const next = norm({ ...cur, ...b });
        const rangeError = prescriptionRangeError(next);
        if (rangeError) return Response.json({ error: rangeError }, { status: 400 });
        if (Array.isArray(b.techniques)) {
          const techniqueCheck = normalizeTechniqueList(b.techniques, piid, Math.min(20, Math.max(1, Number(next.sets) || 3)));
          if (techniqueCheck.error) return Response.json({ error: techniqueCheck.error }, { status: 400 });
          for (const technique of techniqueCheck.techniques) {
            if (!technique.exercise_ids.length) continue;
            const placeholders = technique.exercise_ids.map(() => "?").join(",");
            const found = (await env.DB.prepare(`SELECT id FROM prescriptions WHERE workout_id=? AND kind='exercise' AND id IN (${placeholders}) AND COALESCE(status,'ativo')<>'arquivado'`).bind(wid, ...technique.exercise_ids).all()).results;
            if (found.length !== technique.exercise_ids.length) return Response.json({ error: "Todos os exercÃ­cios da combinaÃ§Ã£o precisam pertencer ao mesmo treino e estar ativos." }, { status: 400 });
          }
        }
        await env.DB.prepare("UPDATE prescriptions SET exercise_id=?, exercise_name=?, kind=?, sets=?, reps_min=?, reps_max=?, warmup_enabled=?, warmup_sets=?, warmup_reps_min=?, warmup_reps_max=?, warmup_load_mode=?, warmup_load_value=?, load=?, rir=?, rest=?, cadence=?, execution_speed=?, time_sec=?, note=?, reason=?, execution_guidance=?, approved_alternative=?, updated_at=datetime('now') WHERE id=?").bind(next.exercise_id, next.exercise_name, next.kind, next.sets, next.reps_min, next.reps_max, next.warmup_enabled, next.warmup_sets, next.warmup_reps_min, next.warmup_reps_max, next.warmup_load_mode, next.warmup_load_value, next.load, next.rir, next.rest, next.cadence, next.execution_speed, next.time_sec, next.note, next.reason, next.execution_guidance, next.approved_alternative, piid).run();
        if (Array.isArray(b.techniques)) {
          const techniqueError = await savePrescriptionTechniques(env, piid, wid, b.techniques);
          if (techniqueError) return Response.json({ error: techniqueError }, { status: 400 });
        }
        await log(env, { actorId: me.userId, actorRole: "professor", action: "update_prescription", entity: "prescription", entityId: String(piid), before: { exercise_name: cur.exercise_name, sets: cur.sets }, after: { exercise_name: next.exercise_name, sets: next.sets } });
        return Response.json({ prescription: await prescriptionWithTechniques(env, await env.DB.prepare("SELECT * FROM prescriptions WHERE id = ?").bind(piid).first()) });
      }
      return new Response("Not found", { status: 404 });
    }

    // ---- Execução (aluno, próprio) ----
    const st = (await studentForRequest(env, request, me)) || null;
    if (st) {
      const sid = st.id;

      if (url.pathname === "/api/student/me/video-reviews" && request.method === "GET") {
        const monthKey = new Date().toISOString().slice(0, 7);
        const [enabled, quota, reviews, sessions] = await Promise.all([
          studentHasAscend(env, sid),
          env.DB.prepare("SELECT used_count FROM video_review_monthly_quotas WHERE student_id=? AND month_key=?").bind(sid, monthKey).first(),
          env.DB.prepare("SELECT id, session_id, file_name, exercise_name, session_date, status, response_text, response_audio_url, response_audio_type, next_step, reviewed_at, created_at FROM video_reviews WHERE student_id=? ORDER BY created_at DESC LIMIT 60").bind(sid).all(),
          env.DB.prepare("SELECT ws.id, ws.started_at, ws.completed_at, w.name AS workout_name FROM workout_sessions ws JOIN workouts w ON w.id=ws.workout_id WHERE ws.student_id=? ORDER BY ws.started_at DESC LIMIT 30").bind(sid).all(),
        ]);
        const list = reviews.results.map((item) => ({ ...item, file_url: `/api/student/me/video-reviews/${item.id}/file`, response_audio_url: item.response_audio_url ? `/api/student/me/video-reviews/${item.id}/audio` : null }));
        return Response.json({ enabled, month: monthKey, used: Number(quota?.used_count || 0), remaining: Math.max(0, 2 - Number(quota?.used_count || 0)), reviews: list, sessions: sessions.results }, { headers: { "Cache-Control": "private, no-store" } });
      }

      if (url.pathname === "/api/student/me/video-reviews" && request.method === "POST") {
        if (!(await studentHasAscend(env, sid))) return Response.json({ error: "A análise de vídeos está disponível no plano ASCEND." }, { status: 403 });
        if (!env.BLOB) return Response.json({ error: "Armazenamento privado indisponível." }, { status: 503 });
        const sessionId = String(request.headers.get("x-session-id") || "").trim();
        const session = sessionId ? await env.DB.prepare("SELECT ws.id, date(ws.started_at) AS session_date FROM workout_sessions ws WHERE ws.id=? AND ws.student_id=?").bind(sessionId, sid).first() : null;
        if (!session) return Response.json({ error: "Selecione uma sessão de treino válida." }, { status: 400 });
        const exerciseName = String(request.headers.get("x-exercise-name") || "").trim().slice(0, 160);
        if (!exerciseName) return Response.json({ error: "Informe o exercício relacionado ao vídeo." }, { status: 400 });
        const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        const videoExtensions = { "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };
        if (!videoExtensions[contentType]) return Response.json({ error: "Envie um vídeo MP4, MOV ou WebM." }, { status: 400 });
        const maxBytes = 80 * 1024 * 1024;
        const videoBody = await readRequestBodyWithinLimit(request, maxBytes);
        if (videoBody.error || !videoBody.bytes.byteLength) return Response.json({ error: "O vídeo está vazio ou excede 80 MB." }, { status: 413 });
        const bytes = videoBody.bytes;
        const data = bytes;
        const isMp4 = data.length >= 12 && new TextDecoder().decode(data.slice(4, 8)) === "ftyp";
        const isWebm = data.length >= 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3;
        if ((contentType === "video/webm" && !isWebm) || (contentType !== "video/webm" && !isMp4)) return Response.json({ error: "O conteúdo não corresponde ao formato de vídeo informado." }, { status: 400 });
        const rawName = String(request.headers.get("x-file-name") || "video").normalize("NFC").replace(/[\\/\u0000-\u001F\u007F]/g, "_").trim().slice(0, 180) || "video";
        const monthKey = new Date().toISOString().slice(0, 7);
        const reservation = await env.DB.prepare("INSERT INTO video_review_monthly_quotas (student_id, month_key, used_count) VALUES (?, ?, 1) ON CONFLICT(student_id, month_key) DO UPDATE SET used_count=used_count+1 WHERE used_count<2").bind(sid, monthKey).run();
        if (Number(reservation.meta?.changes || 0) < 1) return Response.json({ error: "Você já usou os dois vídeos de análise deste mês.", used: 2, remaining: 0 }, { status: 429 });
        const token = crypto.randomUUID();
        const extension = videoExtensions[contentType];
        const objectKey = `video-reviews/${sid}/${token}${extension}`;
        try {
          await env.BLOB.put(objectKey, bytes, { httpMetadata: { contentType } });
          var videoMeta = (await env.DB.prepare("INSERT INTO video_reviews (student_id, uploader_user_id, session_id, video_token, file_url, file_name, content_type, bytes, exercise_name, session_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(sid, me.userId, session.id, token, objectKey, rawName, contentType, bytes.byteLength, exerciseName, session.session_date).run()).meta;
        } catch {
          await env.BLOB.delete(objectKey).catch(() => {});
          await env.DB.prepare("UPDATE video_review_monthly_quotas SET used_count=MAX(0, used_count-1) WHERE student_id=? AND month_key=?").bind(sid, monthKey).run().catch(() => {});
          return Response.json({ error: "Não foi possível guardar o vídeo. Tente novamente." }, { status: 503 });
        }
        await notify(env, { recipients: [me.ownerId].filter(Boolean), title: "Vídeo recebido para análise", body: "Um aluno enviou um vídeo vinculado ao treino.", path: `/alunos?student_id=${sid}&focus=videos&entity_type=video_review&entity_id=${videoMeta.last_row_id}`, idempotencyKey: `video-review:${token}` });
        return Response.json({ ok: true, remaining: Math.max(0, 2 - Number(reservation.meta?.changes ? (await env.DB.prepare("SELECT used_count FROM video_review_monthly_quotas WHERE student_id=? AND month_key=?").bind(sid, monthKey).first())?.used_count || 1 : 1)) }, { status: 201 });
      }

      const ownVideoFile = url.pathname.match(/^\/api\/student\/me\/video-reviews\/(\d+)\/(file|audio)$/);
      if (ownVideoFile && request.method === "GET") {
        if (!env.BLOB) return new Response("Not found", { status: 404 });
        const review = await env.DB.prepare("SELECT * FROM video_reviews WHERE id=? AND student_id=?").bind(Number(ownVideoFile[1]), sid).first();
        const isAudio = ownVideoFile[2] === "audio";
        const objectKey = isAudio ? review?.response_audio_url : review?.file_url;
        if (!review || !objectKey) return new Response("Not found", { status: 404 });
        return privateStoredObjectResponse(await env.BLOB.get(objectKey), isAudio ? (review.response_audio_type || "audio/webm") : review.content_type, isAudio ? "retorno" : review.file_name);
      }

      if (url.pathname === "/api/student/me/workout-sessions" && request.method === "POST") {
        if ((await studentAccess(env, sid)).restricted) return Response.json({ error: "Acesso ao treinamento restrito pela assinatura." }, { status: 402 });
        const body = await request.json().catch(() => ({}));
        const workoutId = Number(body.workout_id || 0);
        const workout = await env.DB.prepare("SELECT w.id FROM workouts w JOIN training_phases ph ON ph.id=w.phase_id JOIN training_programs pg ON pg.id=ph.program_id WHERE w.id=? AND pg.student_id=? AND COALESCE(w.status,'ativo')<>'arquivado' AND COALESCE(ph.status,'ativo')<>'arquivado' AND COALESCE(pg.status,'ativo')<>'arquivado'").bind(workoutId, sid).first();
        if (!workout) return Response.json({ error: "Treino não encontrado." }, { status: 404 });
        const existing = await env.DB.prepare("SELECT * FROM workout_sessions WHERE student_id=? AND workout_id=? AND completed_at IS NULL ORDER BY started_at DESC LIMIT 1").bind(sid, workoutId).first();
        if (existing) return Response.json({ session: existing, resumed: true });
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO workout_sessions (id, student_id, workout_id) VALUES (?, ?, ?)").bind(id, sid, workoutId).run();
        const session = await env.DB.prepare("SELECT * FROM workout_sessions WHERE id=?").bind(id).first();
        return Response.json({ session, resumed: false }, { status: 201 });
      }

      const sessionCompleteMatch = url.pathname.match(/^\/api\/student\/me\/workout-sessions\/([a-f0-9-]{36})$/i);
      if (sessionCompleteMatch && request.method === "PATCH") {
        const sessionId = sessionCompleteMatch[1];
        const session = await env.DB.prepare("SELECT * FROM workout_sessions WHERE id=? AND student_id=?").bind(sessionId, sid).first();
        if (!session) return Response.json({ error: "Sessão não encontrada." }, { status: 404 });
        if (session.completed_at) return Response.json({ error: "Esta sessão já foi concluída." }, { status: 409 });
        const incomplete = await env.DB.prepare("SELECT COUNT(*) AS count FROM prescriptions p WHERE p.workout_id=? AND COALESCE(p.status,'ativo')<>'arquivado' AND NOT EXISTS (SELECT 1 FROM executions e WHERE e.prescription_id=p.id AND e.session_id=? AND e.completed=1)").bind(session.workout_id, sessionId).first("count");
        if (Number(incomplete || 0) > 0) return Response.json({ error: "Registre todos os exercícios antes de concluir a sessão." }, { status: 400 });
        await env.DB.prepare("UPDATE workout_sessions SET completed_at=datetime('now') WHERE id=? AND student_id=? AND completed_at IS NULL").bind(sessionId, sid).run();
        const completed = await env.DB.prepare("SELECT * FROM workout_sessions WHERE id=?").bind(sessionId).first();
        await notify(env, {
          recipients: [me.ownerId].filter(Boolean), title: "Treino concluído",
          body: "Um aluno concluiu uma sessão de treino.",
          path: `/alunos?student_id=${sid}&focus=treinos&entity_type=workout_session&entity_id=${encodeURIComponent(sessionId)}`,
          idempotencyKey: `workout-session-completed:${sessionId}`, ctx,
        });
        return Response.json({ session: completed });
      }

      if (request.method === "GET" && url.pathname === "/api/student/me/training") {
        const [access, programs] = await Promise.all([studentAccess(env, sid), studentTree(env, sid)]);
        if (access.restricted) return Response.json({ error: "Acesso ao treinamento restrito pela assinatura." }, { status: 402 });
        return Response.json({ programs });
      }

      const swMatch = url.pathname.match(/^\/api\/student\/me\/workouts\/(\d+)$/);
      if (request.method === "GET" && swMatch) {
        if ((await studentAccess(env, sid)).restricted) return Response.json({ error: "Acesso ao treinamento restrito pela assinatura." }, { status: 402 });
        const wid = Number(swMatch[1]);
        const w = (await env.DB.prepare(
          "SELECT w.* FROM workouts w JOIN training_phases p ON p.id=w.phase_id JOIN training_programs pr ON pr.id=p.program_id WHERE w.id=? AND pr.student_id=?"
        ).bind(wid, sid).first());
        if (!w) return Response.json({ error: "Treino não encontrado." }, { status: 404 });
        const pres = (await env.DB.prepare("SELECT pr.*, ex.video_url, ex.category AS muscle_group FROM prescriptions pr LEFT JOIN exercises ex ON ex.id=pr.exercise_id WHERE pr.workout_id=? AND COALESCE(pr.status, 'ativo') <> 'arquivado' ORDER BY pr.order_idx").bind(wid).all()).results;
        const techniquesByPrescription = await techniquesForPrescriptions(env, pres.map((item) => item.id));
        const exs = (await env.DB.prepare("SELECT * FROM executions WHERE workout_id=? AND student_id=? ORDER BY date DESC, id DESC").bind(wid, sid).all()).results;
        const sessions = (await env.DB.prepare("SELECT * FROM workout_sessions WHERE workout_id=? AND student_id=? ORDER BY started_at DESC LIMIT 20").bind(wid, sid).all()).results;
        const withSets = [];
        for (const ex of exs) withSets.push(await execWithSets(env, ex.id));
        const byPres = {};
        for (const ex of withSets) (byPres[ex.prescription_id] = byPres[ex.prescription_id] || []).push(ex);
        return Response.json({ workout: w, prescriptions: pres.map((p) => ({ ...p, techniques: techniquesByPrescription[p.id] || [], executions: byPres[p.id] || [] })), sessions });
      }

      if (url.pathname === "/api/student/me/executions") {
        if ((await studentAccess(env, sid)).restricted) return Response.json({ error: "Acesso ao treinamento restrito pela assinatura." }, { status: 402 });
        if (request.method === "GET") {
          const pid = Number(url.searchParams.get("prescription_id") || 0);
          if (!pid) return Response.json({ executions: [] });
          const rows = (await env.DB.prepare("SELECT e.* FROM executions e JOIN prescriptions pr ON pr.id=e.prescription_id JOIN workouts w ON w.id=pr.workout_id JOIN training_phases ph ON ph.id=w.phase_id JOIN training_programs pg ON pg.id=ph.program_id WHERE e.prescription_id=? AND e.student_id=? AND pg.student_id=? AND COALESCE(pr.status, 'ativo') <> 'arquivado' ORDER BY e.date DESC, e.id DESC").bind(pid, sid, sid).all()).results;
          const out = [];
          for (const r of rows) out.push(await execWithSets(env, r.id));
          return Response.json({ executions: out });
        }
        if (request.method === "POST") {
          const b = await request.json().catch(() => ({}));
          if (b.completed != null && typeof b.completed !== "boolean") return Response.json({ error: "Estado de conclusão inválido." }, { status: 400 });
          if (b.pain != null && typeof b.pain !== "boolean") return Response.json({ error: "Estado de desconforto inválido." }, { status: 400 });
          const pid = Number(b.prescription_id || 0);
          const pres = (await env.DB.prepare(
            "SELECT pr.*, w.id wid FROM prescriptions pr JOIN workouts w ON w.id=pr.workout_id JOIN training_phases p ON p.id=w.phase_id JOIN training_programs pg ON pg.id=p.program_id WHERE pr.id=? AND pg.student_id=? AND COALESCE(pr.status,'ativo')<>'arquivado' AND COALESCE(w.status,'ativo')<>'arquivado' AND COALESCE(p.status,'ativo')<>'arquivado' AND COALESCE(pg.status,'ativo')<>'arquivado'"
          ).bind(pid, sid).first());
          if (!pres) return Response.json({ error: "Exercício não encontrado no seu programa." }, { status: 404 });

          const sets = Array.isArray(b.sets) ? b.sets : [];
          if (sets.length > 50) return Response.json({ error: "Informe no máximo 50 séries por exercício." }, { status: 400 });
          const sessionId = typeof b.session_id === "string" && /^[a-f0-9-]{36}$/i.test(b.session_id) ? b.session_id : null;
          if (b.session_id && !sessionId) return Response.json({ error: "Sessão inválida." }, { status: 400 });
          let session = null;
          if (sessionId) {
            session = await env.DB.prepare("SELECT id, completed_at FROM workout_sessions WHERE id=? AND student_id=? AND workout_id=?").bind(sessionId, sid, pres.wid).first();
            if (!session || session.completed_at) return Response.json({ error: "Esta sessão não pode mais ser alterada." }, { status: 409 });
          }
          const warmupCount = session && pres.warmup_enabled ? Math.max(0, Number(pres.warmup_sets) || 0) : 0;
          const workCount = Math.max(1, Math.min(30, Number(pres.sets) || 3));
          if (session && sets.length !== warmupCount + workCount) return Response.json({ error: "A quantidade de séries enviadas não corresponde à prescrição salva." }, { status: 400 });
          const workoutPrescriptionIds = (await env.DB.prepare("SELECT id FROM prescriptions WHERE workout_id=? AND COALESCE(status,'ativo')<>'arquivado'").bind(pres.wid).all()).results.map((row) => Number(row.id));
          const techniquesByPrescription = await techniquesForPrescriptions(env, workoutPrescriptionIds);
          const techniques = techniquesByPrescription[pid] || [];
          for (const [index, set] of sets.entries()) {
            if (!set || typeof set !== "object") return Response.json({ error: `Série ${index + 1} inválida.` }, { status: 400 });
            if (set.completed != null && typeof set.completed !== "boolean") return Response.json({ error: `Estado da série ${index + 1} inválido.` }, { status: 400 });
            if (set.technique_data != null && (typeof set.technique_data !== "object" || Array.isArray(set.technique_data))) return Response.json({ error: `Dados da técnica na série ${index + 1} inválidos.` }, { status: 400 });
            const weight = set.weight === "" || set.weight == null ? null : Number(set.weight);
            const reps = set.reps === "" || set.reps == null ? null : Number(set.reps);
            const rir = set.rir === "" || set.rir == null ? null : Number(set.rir);
            const restSeconds = set.rest_seconds === "" || set.rest_seconds == null ? null : Number(set.rest_seconds);
            if (session && set.set_type != null && set.set_type !== (index < warmupCount ? "preparatory" : "valid")) return Response.json({ error: "O tipo de série enviada não corresponde à prescrição salva." }, { status: 400 });
            if (weight != null && (!Number.isFinite(weight) || weight < 0 || weight > 2000)) return Response.json({ error: `Carga inválida na série ${index + 1}.` }, { status: 400 });
            if (reps != null && (!Number.isInteger(reps) || reps < 0 || reps > 1000)) return Response.json({ error: `Repetições inválidas na série ${index + 1}.` }, { status: 400 });
            if (rir != null && (!Number.isFinite(rir) || rir < 0 || rir > 10)) return Response.json({ error: `RIR inválido na série ${index + 1}.` }, { status: 400 });
            if (restSeconds != null && (!Number.isInteger(restSeconds) || restSeconds < 0 || restSeconds > 3600)) return Response.json({ error: `Descanso inválido na série ${index + 1}.` }, { status: 400 });
          }
          if (session && b.completed && !sets.some((set, index) => index >= warmupCount && set.completed !== false)) return Response.json({ error: "Conclua ao menos uma série válida antes de concluir o exercício." }, { status: 400 });
          for (const [index, set] of sets.entries()) {
            const setType = session ? (index < warmupCount ? "preparatory" : "valid") : set.set_type === "preparatory" ? "preparatory" : "valid";
            const validSetNumber = setType === "preparatory" ? null : index - warmupCount + 1;
            const data = set.technique_data && typeof set.technique_data === "object" && !Array.isArray(set.technique_data) ? set.technique_data : {};
            for (const key of Object.keys(data)) if (!techniques.some((technique) => String(technique.id) === String(key))) return Response.json({ error: "A execução contém dados de uma técnica não prescrita." }, { status: 400 });
            for (const technique of techniques) {
              if (setType !== "valid" || !technique.apply_to_sets.includes(validSetNumber)) continue;
              if (set.completed === false) continue;
              const value = data[String(technique.id)];
              if (!value || typeof value !== "object" || Array.isArray(value)) return Response.json({ error: `Registre a técnica prescrita para a série válida ${validSetNumber}.` }, { status: 400 });
              if (technique.technique_type === "drop_set") {
                if (!Array.isArray(value.reductions) || value.reductions.length !== Number(technique.reduction_count) || value.reductions.some((item) => item?.weight === "" || item?.weight == null || item?.reps === "" || item?.reps == null || !Number.isFinite(Number(item.weight)) || Number(item.weight) < 0 || Number(item.weight) > 2000 || !Number.isInteger(Number(item.reps)) || Number(item.reps) < 0 || Number(item.reps) > 1000)) return Response.json({ error: "Informe carga e repetições válidas para cada redução do drop-set." }, { status: 400 });
              } else if (["rest_pause", "cluster_set", "myo_reps"].includes(technique.technique_type)) {
                if (!Array.isArray(value.blocks) || value.blocks.length !== Number(technique.blocks) || value.blocks.some((item) => item?.reps === "" || item?.reps == null || !Number.isInteger(Number(item.reps)) || Number(item.reps) < 0)) return Response.json({ error: "Informe as repetições de cada bloco da técnica." }, { status: 400 });
              } else if (technique.technique_type === "isometria" && (!Number.isInteger(Number(value.hold_seconds)) || Number(value.hold_seconds) < 1 || Number(value.hold_seconds) > 3600)) return Response.json({ error: "Informe a duração da isometria realizada." }, { status: 400 });
              else if (["superset", "biset", "triset"].includes(technique.technique_type) && (!Array.isArray(value.completed_exercise_ids) || value.completed_exercise_ids.length !== technique.exercise_ids.length || technique.exercise_ids.some((id, exerciseIndex) => value.completed_exercise_ids[exerciseIndex] !== id))) return Response.json({ error: "Confirme os exercícios realizados na combinação na ordem prescrita." }, { status: 400 });
              else if (technique.technique_type === "custom" && (typeof value.notes !== "string" || !value.notes.trim() || value.notes.length > 500)) return Response.json({ error: "Descreva como realizou a técnica personalizada." }, { status: 400 });
            }
          }
          const flags = computeFlags(pres, sets, { completed: !!b.completed, pain: !!b.pain });
          const date = isDateOnly(b.date) ? b.date : saoDate(new Date());
          let exId = null;
          if (sessionId) exId = Number(await env.DB.prepare("SELECT id FROM executions WHERE prescription_id=? AND student_id=? AND session_id=? ORDER BY id DESC LIMIT 1").bind(pid, sid, sessionId).first("id")) || null;
          if (exId) {
            await env.DB.prepare("UPDATE executions SET date=?, flags=?, completed=?, note=?, user_id=? WHERE id=? AND student_id=? AND session_id=?").bind(date, flags.join(","), b.completed ? 1 : 0, typeof b.note === "string" ? b.note.slice(0, 500) || null : null, me.userId, exId, sid, sessionId).run();
            await env.DB.prepare("DELETE FROM execution_sets WHERE execution_id=?").bind(exId).run();
          } else {
            const { meta } = await env.DB.prepare("INSERT INTO executions (prescription_id, workout_id, student_id, date, flags, completed, note, user_id, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(pid, pres.wid, sid, date, flags.join(","), b.completed ? 1 : 0, typeof b.note === "string" ? b.note.slice(0, 500) || null : null, me.userId, sessionId).run();
            exId = Number(meta.last_row_id);
          }
          await env.DB.batch(sets.map((set, index) => {
            const setType = session ? (index < warmupCount ? "preparatory" : "valid") : set.set_type === "preparatory" ? "preparatory" : "valid";
            const restSeconds = set.rest_seconds === "" || set.rest_seconds == null ? null : Number(set.rest_seconds);
            return env.DB.prepare("INSERT INTO execution_sets (execution_id, set_number, weight, load_label, reps, rir, completed, user_id, set_type, rest_seconds, technique_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
              .bind(exId, index + 1, set.weight === "" || set.weight == null ? null : Number(set.weight), typeof set.weight_label === "string" ? set.weight_label.slice(0, 80) : null, set.reps === "" || set.reps == null ? null : Number(set.reps), set.rir === "" || set.rir == null ? null : String(set.rir).slice(0, 8), set.completed === false ? 0 : 1, me.userId, setType, restSeconds, Object.keys(set.technique_data || {}).length ? JSON.stringify(set.technique_data) : null);
          }));
          await log(env, { actorId: me.userId, actorRole: "aluno", action: "execution", entity: "prescription", entityId: String(pid), after: { date, flags } });
          if (flags.includes("abaixo_da_faixa") || flags.includes("acima_da_faixa")) {
            await notify(env, {
              recipients: [me.ownerId].filter(Boolean), title: "Execução fora da prescrição",
              body: "Há uma execução que merece revisão do profissional.",
              path: `/alunos?student_id=${sid}&focus=treinos&entity_type=execution&entity_id=${exId}`,
              idempotencyKey: `execution-divergence:${exId}`, ctx,
            });
          } else if (!sessionId) {
            // Registros legados sem sessão mantêm o resumo de evolução diário.
            const activityDay = new Date().toISOString().slice(0, 10);
            await notify(env, {
              recipients: [me.ownerId].filter(Boolean), title: "Atualização de evolução recebida",
              body: "Um aluno registrou uma atualização de evolução no aplicativo.",
              path: `/alunos?student_id=${sid}&focus=evolucao`, idempotencyKey: `student-evolution:${sid}:${activityDay}`, ctx,
            });
          }
          return Response.json({ execution: await execWithSets(env, exId), flags });
        }
      }
    }

    // ---- Histórico de execução (professor) ----
    const pex = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/prescriptions\/(\d+)\/executions$/);
    if (pex && me.isOwner) {
      const sid = Number(pex[1]);
      const pid = Number(pex[2]);
      const pres = (await env.DB.prepare(
        "SELECT pr.* FROM prescriptions pr JOIN workouts w ON w.id=pr.workout_id JOIN training_phases p ON p.id=w.phase_id JOIN training_programs pg ON pg.id=p.program_id WHERE pr.id=? AND pg.student_id=?"
      ).bind(pid, sid).first());
      if (!pres) return Response.json({ error: "Não encontrado." }, { status: 404 });
      const rows = (await env.DB.prepare("SELECT * FROM executions WHERE prescription_id=? ORDER BY date DESC, id DESC").bind(pid).all()).results;
      const out = [];
      for (const r of rows) out.push(await execWithSets(env, r.id));
      return Response.json({ prescription: pres, executions: out });
    }

    // ---- Evolução ----
    if (url.pathname === "/api/student/me/evolution") {
      const own = await studentForRequest(env, request, me);
      if (!own) return Response.json({ error: "Sem vínculo de aluno." }, { status: 403 });
      if ((await studentAccess(env, own.id)).restricted) return Response.json({ error: "Acesso à evolução restrito pela assinatura." }, { status: 402 });
      return Response.json(await buildEvolution(env, own.id));
    }
    const evSid = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/evolution$/);
    if (evSid && me.isOwner) {
      return Response.json(await buildEvolution(env, Number(evSid[1])));
    }

    // ---- Check-ins ----
    if (url.pathname === "/api/professor/checkin-config") {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      if (request.method === "GET") return Response.json({ config: await getCheckinConfig(env) });
      if (request.method === "PUT") {
        const b = await request.json().catch(() => ({}));
        const periodicity = ["semanal", "quinzenal", "mensal", "personalizado"].includes(b.periodicity) ? b.periodicity : "semanal";
        const custom_days = Number(b.custom_days) > 0 ? Number(b.custom_days) : null;
        const questions = typeof b.questions === "object" && b.questions ? b.questions : {};
        const thresholds = typeof b.thresholds === "object" && b.thresholds ? b.thresholds : {};
        await env.DB.prepare("UPDATE checkin_config SET periodicity=?, custom_days=?, questions=?, threshold=?, updated_at=datetime('now') WHERE id=1").bind(periodicity, custom_days, JSON.stringify(questions), JSON.stringify(thresholds)).run();
        return Response.json({ config: await getCheckinConfig(env) });
      }
    }

    // Histórico/unidade de check-in (professor por aluno)
    const reportResponse = await handleProfessionalReports(env, request, url, me);
    if (reportResponse) return reportResponse;

    const videoReviewResponse = await handleProfessionalVideoReviews(env, request, url, me);
    if (videoReviewResponse) return videoReviewResponse;

    const ciSid = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/checkins$/);
    if (ciSid && me.isOwner) {
      const sid = Number(ciSid[1]);
      if (!(await professionalOwnsStudent(env, me, sid))) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      const config = await getCheckinConfig(env);
      const { results: checkins } = await env.DB.prepare("SELECT * FROM checkins WHERE student_id = ? ORDER BY answered_at DESC").bind(sid).all();
      return Response.json({
        config,
        due: await isCheckinDue(env, sid, checkins),
        checkins: checkins.map((c) => { const answers = JSON.parse(c.answers || "{}"); return { id: c.id, period_start: c.period_start, answered_at: c.answered_at, answers, flags: computeCheckinFlags(answers, config.thresholds).join(","), review_status: c.review_status, professional_observation: c.professional_observation, plan_decision: c.plan_decision, next_step: c.next_step, reviewed_at: c.reviewed_at }; }),
      });
    }

    const checkinReview = url.pathname.match(/^\/api\/professor\/checkins\/(\d+)\/reply$/);
    if (checkinReview && me.isOwner) {
      if (request.method !== "PATCH") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const checkinId = Number(checkinReview[1]);
      const checkin = await env.DB.prepare("SELECT c.* FROM checkins c JOIN students s ON s.id=c.student_id WHERE c.id=? AND s.owner_user_id=?").bind(checkinId, me.userId).first();
      if (!checkin || !(await professionalOwnsStudent(env, me, Number(checkin.student_id)))) return Response.json({ error: "Check-in não encontrado." }, { status: 404 });
      const body = await request.json().catch(() => ({}));
      if (body.status === "in_progress") {
        await env.DB.prepare("UPDATE checkins SET review_status='in_progress' WHERE id=? AND review_status<>'responded'").bind(checkinId).run();
        return Response.json({ ok: true, review_status: "in_progress" });
      }
      const observation = typeof body.observation === "string" ? body.observation.trim().slice(0, 2000) : "";
      const decision = ["manter", "ajustar"].includes(body.plan_decision) ? body.plan_decision : null;
      const nextStep = typeof body.next_step === "string" ? body.next_step.trim().slice(0, 1000) : "";
      if (!observation || !decision || !nextStep) return Response.json({ error: "Registre observação, decisão do plano e próximo passo." }, { status: 400 });
      await env.DB.prepare("UPDATE checkins SET review_status='responded', professional_observation=?, plan_decision=?, next_step=?, reviewed_at=datetime('now') WHERE id=?").bind(observation, decision, nextStep, checkinId).run();
      await log(env, { actorId: me.userId, actorRole: "professor", action: "checkin_reply", entity: "checkin", entityId: String(checkinId), after: { plan_decision: decision } });
      await notify(env, { recipients: [checkin.user_id].filter(Boolean), title: "Retorno do check-in", body: "Seu profissional respondeu ao check-in.", path: `/checkin?student_id=${checkin.student_id}&entity_type=checkin&entity_id=${checkinId}`, idempotencyKey: `checkin-reply:${checkinId}:${Date.now()}` });
      return Response.json({ ok: true, review_status: "responded" });
    }

    // Aluno: ver e responder o próprio check-in
    const ownSt = (await studentForRequest(env, request, me)) || null;
    if (ownSt && url.pathname === "/api/student/me/dashboard") {
      if (request.method !== "GET") return Response.json({ error: "Método não suportado." }, { status: 405 });
      const [access, programs] = await Promise.all([studentAccess(env, ownSt.id), studentTree(env, ownSt.id)]);
      const hasTraining = programs.length > 0 && programs.some((p) => p.phases?.length > 0);
      const nowIso = new Date().toISOString();
      const [checkinRows, appointmentRows, executionRow, evaluationRow] = await Promise.all([
        env.DB.prepare("SELECT * FROM checkins WHERE student_id = ? ORDER BY answered_at DESC").bind(ownSt.id).all(),
        env.DB.prepare("SELECT id, title, type, starts_at, ends_at, status FROM appointments WHERE student_id = ? AND status IN ('agendado','confirmado') AND ends_at >= ? ORDER BY starts_at ASC").bind(ownSt.id, nowIso).all(),
        env.DB.prepare("SELECT 1 AS found FROM executions WHERE student_id=? AND completed=1 LIMIT 1").bind(ownSt.id).first(),
        env.DB.prepare("SELECT 1 AS found FROM evaluations WHERE student_id=? AND COALESCE(status,'ativa')<>'arquivada' LIMIT 1").bind(ownSt.id).first(),
      ]);
      const checkins = checkinRows.results;
      const due = await isCheckinDue(env, ownSt.id, checkins);
      const appointments = appointmentRows.results;
      const isEval = (a) => ["avaliacao_fisica", "reavaliacao", "avaliacao"].includes(a.type);
      const isAtend = (a) => ["chamada_acompanhamento", "consultoria", "atendimento", "chamada", "outro"].includes(a.type);
      const nextEvaluation = appointments.find(isEval) || null;
      const nextAtendimento = appointments.find(isAtend) || null;
      return Response.json({
        access: { restricted: access.restricted, state: access.state },
        hasTraining,
        hasExecution: !!executionRow?.found,
        hasEvaluation: !!evaluationRow?.found,
        checkin: { due: hasTraining && due, available: hasTraining },
        latestCheckin: checkins[0] ? { id: checkins[0].id, period_start: checkins[0].period_start, review_status: checkins[0].review_status, professional_observation: checkins[0].professional_observation, plan_decision: checkins[0].plan_decision, next_step: checkins[0].next_step } : null,
        nextEvaluation,
        nextAtendimento,
      });
    }

    if (ownSt && url.pathname === "/api/student/me/checkins") {
      if (request.method === "GET") {
        if ((await studentAccess(env, ownSt.id)).restricted) return Response.json({ error: "Acesso aos check-ins restrito pela assinatura." }, { status: 402 });
        const config = await getCheckinConfig(env);
        const { results: checkins } = await env.DB.prepare("SELECT * FROM checkins WHERE student_id = ? ORDER BY answered_at DESC").bind(ownSt.id).all();
        return Response.json({
          config,
          due: await isCheckinDue(env, ownSt.id, checkins),
          checkins: checkins.map((c) => { const answers = JSON.parse(c.answers || "{}"); return { id: c.id, period_start: c.period_start, answered_at: c.answered_at, answers, flags: computeCheckinFlags(answers, config.thresholds).join(","), review_status: c.review_status, professional_observation: c.professional_observation, plan_decision: c.plan_decision, next_step: c.next_step, reviewed_at: c.reviewed_at }; }),
        });
      }
      if (request.method === "POST") {
        if ((await studentAccess(env, ownSt.id)).restricted) return Response.json({ error: "Acesso aos check-ins restrito pela assinatura." }, { status: 402 });
        const b = await request.json().catch(() => ({}));
        const { results: checkins } = await env.DB.prepare("SELECT * FROM checkins WHERE student_id = ? ORDER BY answered_at DESC").bind(ownSt.id).all();
        if (!(await isCheckinDue(env, ownSt.id, checkins))) {
          return Response.json({ error: "Ciclo de check-in já respondido neste período." }, { status: 400 });
        }
        const answers = typeof b.answers === "object" && b.answers ? b.answers : {};
        const cfg = await getCheckinConfig(env);
        const flags = computeCheckinFlags(answers, cfg.thresholds);
        const today = new Date().toISOString().slice(0, 10);
          const { meta } = await env.DB
          .prepare("INSERT INTO checkins (student_id, period_start, answers, flags, user_id, review_status) VALUES (?, ?, ?, ?, ?, 'received')")
          .bind(ownSt.id, today, JSON.stringify(answers), flags.join(","), me.userId)
          .run();
        await log(env, { actorId: me.userId, actorRole: "aluno", action: "checkin", entity: "checkin", entityId: String(meta.last_row_id), after: { flags } });
        await notify(env, { recipients: [me.ownerId].filter(Boolean), title: "Novo check-in recebido", body: `${ownSt.display_name || ownSt.username} respondeu o check-in.`, path: `/alunos?student_id=${ownSt.id}&focus=checkins&entity_type=checkin&entity_id=${meta.last_row_id}`, idempotencyKey: `checkin:${meta.last_row_id}`, ctx });
        return Response.json({ checkin: { id: Number(meta.last_row_id), period_start: today, answers, flags } });
      }
    }

    // ---- Chat ----
    const chatStudent = (await studentForRequest(env, request, me)) || null;
    const chatListStudent = (sid) =>
      env.DB.prepare("SELECT cm.*, cu.token AS private_file_token FROM chat_messages cm LEFT JOIN chat_uploads cu ON cu.file_url=cm.file_url AND cu.student_id=cm.student_id WHERE cm.student_id = ? ORDER BY cm.id ASC").bind(sid).all();
    const presentChatMessages = (rows) => rows.map(({ private_file_token, ...message }) => ({
      ...message,
      file_url: private_file_token ? `/api/chat/files/${private_file_token}` : null,
    }));

    if (request.method === "GET" && url.pathname === "/api/student/me/chat/unread") {
      if (!me.signedIn || me.appUser?.role !== "student" || !chatStudent) return Response.json({ error: "Conversa indisponível." }, { status: me.signedIn ? 403 : 401 });
      const unread = await env.DB.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE student_id=? AND sender='professor' AND read_at IS NULL").bind(chatStudent.id).first();
      return Response.json({ unread_count: Number(unread?.count || 0) }, { headers: { "Cache-Control": "private, no-store" } });
    }

    // Aluno: ler e enviar
    if (url.pathname === "/api/student/me/chat" && chatStudent) {
      if (request.method === "GET") {
        const { results } = await chatListStudent(chatStudent.id);
        await env.DB.prepare("UPDATE chat_messages SET read_at = COALESCE(read_at, datetime('now')) WHERE student_id = ? AND sender = 'professor' AND read_at IS NULL").bind(chatStudent.id).run();
        await env.DB.prepare(`
          UPDATE internal_notifications SET read_at=COALESCE(read_at, datetime('now'))
          WHERE recipient_user_id=? AND idempotency_key IN (
            SELECT 'chat:' || id || ':' || ? FROM chat_messages WHERE student_id=? AND sender='professor'
          )
        `).bind(me.userId, me.userId, chatStudent.id).run();
        const unread = await env.DB.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE student_id = ? AND sender = 'professor' AND read_at IS NULL").bind(chatStudent.id).first();
        return Response.json({ messages: presentChatMessages(results), unread_count: Number(unread?.count || 0) });
      }
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const text = typeof b.text === "string" ? b.text.trim().slice(0, 2000) : "";
        const contextType = ["training", "checkin"].includes(b.context_type) ? b.context_type : null;
        const fileToken = typeof b.file_token === "string" ? b.file_token : null;
        const upload = fileToken ? await env.DB.prepare("SELECT * FROM chat_uploads WHERE token=? AND uploader_user_id=? AND student_id=? AND used_at IS NULL").bind(fileToken, me.userId, chatStudent.id).first() : null;
        if (b.file_url && !upload) return Response.json({ error: "Anexo inválido. Envie o arquivo pelo botão do chat." }, { status: 400 });
        const file_url = upload?.file_url || null;
        const file_name = upload?.file_name || null;
        if (!text && !file_url) return Response.json({ error: "Mensagem vazia." }, { status: 400 });
        const { meta } = await env.DB
          .prepare("INSERT INTO chat_messages (student_id, sender, sender_user_id, user_id, text, file_url, file_name, context_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(chatStudent.id, "student", me.userId, me.userId, text || null, file_url, file_name, contextType)
          .run();
        if (upload) await env.DB.prepare("UPDATE chat_uploads SET used_at=datetime('now') WHERE id=? AND used_at IS NULL").bind(upload.id).run();
        const msg = await env.DB.prepare("SELECT * FROM chat_messages WHERE id = ?").bind(Number(meta.last_row_id)).first();
        await notify(env, { recipients: [chatStudent.owner_user_id || me.ownerId].filter(Boolean), title: "Nova mensagem", body: `${chatStudent.display_name || chatStudent.username} enviou uma mensagem.`, path: `/chat?student_id=${chatStudent.id}&entity_id=${msg.id}&entity_type=message&focus=chat`, idempotencyKey: `chat:${msg.id}`, ctx });
        return Response.json({ message: msg });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    // Professor: ler e enviar por aluno
    const chatSid = url.pathname.match(/^\/api\/professor\/students\/(\d+)\/chat$/);
    if (chatSid) {
      if (!me.isOwner) return Response.json({ error: "Somente o professor." }, { status: 403 });
      const sid = Number(chatSid[1]);
      const chatTarget = await env.DB.prepare("SELECT * FROM students WHERE id = ? AND owner_user_id = ?").bind(sid, me.userId).first();
      if (!chatTarget) return Response.json({ error: "Aluno não encontrado." }, { status: 404 });
      if (request.method === "GET") {
        const { results } = await chatListStudent(sid);
        await env.DB.prepare("UPDATE chat_messages SET read_at = COALESCE(read_at, datetime('now')) WHERE student_id = ? AND sender = 'student' AND read_at IS NULL").bind(sid).run();
        await env.DB.prepare(`
          UPDATE internal_notifications SET read_at=COALESCE(read_at, datetime('now'))
          WHERE recipient_user_id=? AND idempotency_key IN (
            SELECT 'chat:' || id || ':' || ? FROM chat_messages WHERE student_id=? AND sender='student'
          )
        `).bind(me.userId, me.userId, sid).run();
        const unread = await env.DB.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE student_id = ? AND sender = 'student' AND read_at IS NULL").bind(sid).first();
        return Response.json({ messages: presentChatMessages(results), unread_count: Number(unread?.count || 0) });
      }
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const text = typeof b.text === "string" ? b.text.trim().slice(0, 2000) : "";
        const contextType = ["training", "checkin"].includes(b.context_type) ? b.context_type : null;
        const fileToken = typeof b.file_token === "string" ? b.file_token : null;
        const upload = fileToken ? await env.DB.prepare("SELECT * FROM chat_uploads WHERE token=? AND uploader_user_id=? AND student_id=? AND used_at IS NULL").bind(fileToken, me.userId, sid).first() : null;
        if (b.file_url && !upload) return Response.json({ error: "Anexo inválido. Envie o arquivo pelo botão do chat." }, { status: 400 });
        const file_url = upload?.file_url || null;
        const file_name = upload?.file_name || null;
        if (!text && !file_url) return Response.json({ error: "Mensagem vazia." }, { status: 400 });
        const { meta } = await env.DB
          .prepare("INSERT INTO chat_messages (student_id, sender, sender_user_id, user_id, text, file_url, file_name, context_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(sid, "professor", me.userId, me.userId, text || null, file_url, file_name, contextType)
          .run();
        if (upload) await env.DB.prepare("UPDATE chat_uploads SET used_at=datetime('now') WHERE id=? AND used_at IS NULL").bind(upload.id).run();
        const msg = await env.DB.prepare("SELECT * FROM chat_messages WHERE id = ?").bind(Number(meta.last_row_id)).first();
        const studentAccount = await env.DB.prepare("SELECT id FROM app_users WHERE student_id=? AND role='student' AND status='ativo' ORDER BY created_at DESC LIMIT 1").bind(sid).first();
        await notify(env, { recipients: [studentAccount?.id || chatTarget.user_id].filter(Boolean), title: "Nova mensagem do professor", body: "Seu profissional enviou uma nova mensagem.", path: `/chat?student_id=${sid}&focus=chat&entity_type=message&entity_id=${msg.id}`, idempotencyKey: `chat:${msg.id}`, ctx });
        return Response.json({ message: msg });
      }
      return Response.json({ error: "Método não suportado." }, { status: 405 });
    }

    // Upload de anexo de chat (documentos apenas — sem fotos/vídeos/áudio)
    const fileMatch = url.pathname.match(/^\/api\/chat\/files\/([a-zA-Z0-9_-]+)$/);
    if (fileMatch && request.method === "GET") {
      if (!me.signedIn || !env.BLOB) return new Response("Not found", { status: 404 });
      const upload = await env.DB.prepare("SELECT * FROM chat_uploads WHERE token = ?").bind(fileMatch[1]).first();
      if (!upload) return new Response("Not found", { status: 404 });
      let healthAttachment = false;
      if (!upload.used_at) {
        const intake = await env.DB.prepare("SELECT data FROM anamnesis WHERE student_id=?").bind(upload.student_id).first();
        const intakeData = parsedAnamnesisData(intake?.data);
        healthAttachment = Array.isArray(intakeData.health_document_tokens) && intakeData.health_document_tokens.includes(upload.token);
        const linkedToIntake = intakeData.diet_file_token === upload.token || healthAttachment;
        if (!linkedToIntake) return new Response("Not found", { status: 404 });
      } else {
        const intake = await env.DB.prepare("SELECT data FROM anamnesis WHERE student_id=?").bind(upload.student_id).first();
        const intakeData = parsedAnamnesisData(intake?.data);
        healthAttachment = Array.isArray(intakeData.health_document_tokens) && intakeData.health_document_tokens.includes(upload.token);
      }
      const student = !me.isOwner ? await studentByUser(env, me.userId) : null;
      if (me.isOwner ? !(await professionalOwnsStudent(env, me, Number(upload.student_id))) : (!student || student.id !== upload.student_id)) return new Response("Not found", { status: 404 });
      const object = await env.BLOB.get(upload.file_url);
      if (!object) return new Response("Not found", { status: 404 });
      const originalName = String(upload.file_name || "arquivo").normalize("NFC").replace(/[\u0000-\u001F\u007F]/g, "").trim() || "arquivo";
      const asciiName = originalName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
      const encodedName = encodeURIComponent(originalName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      const disposition = healthAttachment ? "attachment" : "inline";
      return new Response(object.body, { headers: { "content-type": upload.content_type, "content-disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    }

    if (request.method === "POST" && url.pathname === "/api/chat/upload") {
      if (!me.signedIn) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
      const contentType = request.headers.get("content-type") ?? "";
      const base = contentType.split(";")[0].trim();
      const uploadPurpose = request.headers.get("x-upload-purpose") || "chat";
      if (!["chat", "anamnesis-diet", "anamnesis-health"].includes(uploadPurpose)) return Response.json({ error: "Finalidade de upload inválida." }, { status: 400 });
      const allowedTypes = new Set([
        "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain",
      ]);
      if (uploadPurpose === "anamnesis-health") { allowedTypes.add("image/jpeg"); allowedTypes.add("image/png"); }
      if (!allowedTypes.has(base)) return Response.json({ error: "O chat aceita apenas PDF, DOC, DOCX, XLS, XLSX ou TXT." }, { status: 400 });
      let rawFileName = request.headers.get("x-file-name") || "arquivo";
      const encodedFileName = request.headers.get("x-file-name-b64");
      if (encodedFileName) {
        try {
          const binary = atob(encodedFileName);
          rawFileName = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
        } catch { /* fall back to the legacy header below */ }
      }
      const fname = String(rawFileName).normalize("NFC").replace(/[\\/\u0000-\u001F\u007F]/g, "_").trim().slice(0, 200) || "arquivo";
      const ext = (fname.split(".").pop() || "").toLowerCase();
      const mimeByExtension = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
      if (!mimeByExtension[ext]) return Response.json({ error: "Extensão de arquivo não permitida." }, { status: 400 });
      if (["jpg", "jpeg", "png"].includes(ext) && uploadPurpose !== "anamnesis-health") return Response.json({ error: "Imagens são aceitas somente como documentos de saúde." }, { status: 400 });
      if (mimeByExtension[ext] !== base) return Response.json({ error: "A extensão e o tipo do arquivo não correspondem." }, { status: 400 });
      const studentIdHeader = Number(request.headers.get("x-student-id"));
      const uploadStudent = me.isOwner
        ? (Number.isInteger(studentIdHeader) && studentIdHeader > 0 && await professionalOwnsStudent(env, me, studentIdHeader) ? await env.DB.prepare("SELECT id FROM students WHERE id=?").bind(studentIdHeader).first() : null)
        : await studentByUser(env, me.userId);
      if (!uploadStudent) return Response.json({ error: "O anexo precisa estar vinculado a um aluno válido." }, { status: 400 });
      if (!env.BLOB) return Response.json({ error: "Armazenamento privado não configurado." }, { status: 503 });
      const maxBytes = 10 * 1024 * 1024;
      const uploadBody = await readRequestBodyWithinLimit(request, maxBytes);
      if (uploadBody.error) return Response.json({ error: "Arquivo grande demais (máx 10 MB)." }, { status: 400 });
      const bytes = uploadBody.bytes;
      if (!validAnamnesisUploadContent(base, ext, bytes)) return Response.json({ error: "O conteúdo do arquivo não corresponde ao formato declarado." }, { status: 400 });
      if (base === "application/pdf") {
        const header = new TextDecoder().decode(bytes.slice(0, 5));
        if (header !== "%PDF-") return Response.json({ error: "O conteúdo não corresponde a um PDF válido." }, { status: 400 });
      }
      const objectKey = `chat/${randomId()}.${ext}`;
      const token = crypto.randomUUID();
      await env.BLOB.put(objectKey, bytes, { httpMetadata: { contentType: base } });
      await env.DB.prepare("INSERT INTO chat_uploads (uploader_user_id, student_id, token, file_url, file_name, content_type, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(me.userId, uploadStudent.id, token, objectKey, fname, base, bytes.byteLength).run();
      return Response.json({ file_url: `/api/chat/files/${token}`, file_name: fname, file_token: token, content_type: base, bytes: bytes.byteLength });
    }

    if (treeMatch && !me.isOwner) return ownerGuard();

    if (env.ASSETS && ["GET", "HEAD"].includes(request.method) && !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};

export default {
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    const contentType = headers.get("Content-Type") || "";
    if (/^text\/html(?:\s*;|$)/i.test(contentType) && !/\bcharset\s*=/i.test(contentType)) {
      headers.set("Content-Type", "text/html; charset=utf-8");
    }
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(Promise.all([runOrderWebhookQueue(env), runPlanNotifications(env)]).catch(() => {
      console.warn(JSON.stringify({ event: "scheduled_maintenance_failed", code: "maintenance_error" }));
    }));
  },
};

export {
  notify,
  webPushConfiguration,
  allowedPushEndpoint,
  safePushPath,
  encryptWebPushPayload,
  vapidAuthorization,
  sendWebPush,
  runPlanNotifications,
  paymentModeReady,
  mercadoPagoModeMatches,
  checkoutAppOrigin,
  validateMercadoPagoOrderWebhook,
  passwordRecoveryAvailability,
};

function validateEvaluationContent(body) {
  const measurementMetrics = new Set(["ombros", "torax", "antebraco_esq", "antebraco_dir"]);
  if (body.measurements != null && !Array.isArray(body.measurements)) return { error: "Formato de medidas inválido." };
  if (body.skinfolds != null && !Array.isArray(body.skinfolds)) return { error: "Formato de dobras cutâneas inválido." };
  const measurements = Array.isArray(body.measurements) ? body.measurements : [];
  const skinfolds = Array.isArray(body.skinfolds) ? body.skinfolds : [];
  if (measurements.length > 80 || skinfolds.length > 80) return { error: "Há itens demais na avaliação." };
  const cleanMeasurements = [];
  for (const item of measurements) {
    if (!item || typeof item.metric !== "string" || !item.metric.trim()) continue;
    const metric = item.metric.trim().slice(0, 80);
    if (item.value === "" || item.value == null) continue;
    const value = Number(item.value);
    if (!Number.isFinite(value) || value <= 0) return { error: `Valor inválido para a medida ${metric}.` };
    const unit = measurementMetrics.has(metric) ? "cm" : (typeof item.unit === "string" ? item.unit.trim().slice(0, 20) : "cm");
    cleanMeasurements.push({ metric, value, unit: unit || "cm" });
  }
  const seenFolds = new Set();
  const cleanSkinfolds = [];
  for (const item of skinfolds) {
    const site = typeof item?.site === "string" ? item.site.trim().slice(0, 100) : "";
    if (!site && (item?.value === "" || item?.value == null)) continue;
    if (!site || item.value === "" || item.value == null) return { error: "Cada dobra precisa de local e valor em milímetros." };
    const value = Number(item.value);
    if (!Number.isFinite(value) || value <= 0) return { error: `Valor inválido para a dobra ${site}.` };
    const protocol = typeof item.protocol === "string" ? item.protocol.trim().slice(0, 120) : "";
    if (!protocol) return { error: "Selecione o protocolo das dobras cutâneas." };
    const key = `${protocol.toLocaleLowerCase("pt-BR")}\u0000${site.toLocaleLowerCase("pt-BR")}`;
    if (seenFolds.has(key)) return { error: `O local ${site} está duplicado neste protocolo.` };
    seenFolds.add(key);
    cleanSkinfolds.push({ protocol, site, value, unit: "mm" });
  }
  return { content: { measurements: cleanMeasurements, skinfolds: cleanSkinfolds } };
}

async function replaceContent(env, eid, body, userId) {
  await env.DB.batch([
    env.DB.prepare("UPDATE evaluation_measurements SET status = 'arquivado' WHERE evaluation_id = ? AND COALESCE(status, 'ativo') <> 'arquivado'").bind(eid),
    env.DB.prepare("UPDATE evaluation_skinfolds SET status = 'arquivado' WHERE evaluation_id = ? AND COALESCE(status, 'ativo') <> 'arquivado'").bind(eid),
    env.DB.prepare("UPDATE evaluation_tests SET status = 'arquivado' WHERE evaluation_id = ? AND COALESCE(status, 'ativo') <> 'arquivado'").bind(eid),
  ]);
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  const ins = [];
  for (const m of body.measurements || []) {
    if (!m.metric) continue;
    ins.push(env.DB.prepare("INSERT INTO evaluation_measurements (evaluation_id, metric, value, unit, user_id) VALUES (?, ?, ?, ?, ?)").bind(eid, m.metric, num(m.value), m.unit ?? null, userId));
  }
  for (const s of body.skinfolds || []) {
    if (!s.site) continue;
    ins.push(env.DB.prepare("INSERT INTO evaluation_skinfolds (evaluation_id, protocol, site, value, unit, user_id) VALUES (?, ?, ?, ?, ?, ?)").bind(eid, s.protocol ?? "", s.site, num(s.value), "mm", userId));
  }
  for (const t of body.tests || []) {
    if (!t.name) continue;
    ins.push(env.DB.prepare("INSERT INTO evaluation_tests (evaluation_id, name, result, unit, note, user_id) VALUES (?, ?, ?, ?, ?, ?)").bind(eid, t.name, num(t.result), t.unit ?? null, t.note ?? null, userId));
  }
  if (ins.length) await env.DB.batch(ins);
}

