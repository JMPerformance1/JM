const STUDENT_ROUTES = {
  "/": "home",
  "/dashboard": "home",
  "/home": "home",
  "/alunos": "home",
  "/chat": "chat",
  "/treinos": "treinos",
  "/training": "treinos",
  "/evolucao": "evolucao",
  "/agenda": "agendas",
  "/agendamentos": "agendas",
  "/avaliacoes": "avaliacoes",
  "/checkin": "checkin",
  "/pagamentos": "pagamentos",
  "/financeiro": "pagamentos",
  "/perfil": "perfil",
};

const PROFESSIONAL_ROUTES = {
  "/": "dashboard",
  "/dashboard": "dashboard",
  "/home": "dashboard",
  "/alunos": "alunos",
  "/treinos": "treinos",
  "/training": "treinos",
  "/chat": "chat",
  "/agenda": "agenda",
  "/agendamentos": "agenda",
  "/avaliacoes": "avaliacoes",
  "/financeiro": "financeiro",
  "/pagamentos": "financeiro",
};

const ENTITY_TYPES = ["appointment", "charge", "payment", "checkout_order", "subscription", "checkin", "evaluation", "message", "execution", "video_review", "anamnesis", "student", "pain_record", "workout_session"];
const FOCUSES = ["training", "treinos", "chat", "checkins", "evaluations", "pagamentos", "profile", "anamnese", "videos", "dores", "evolucao", "reports"];

function positiveId(value) {
  return typeof value === "string" && /^\d{1,10}$/.test(value) && Number(value) > 0
    ? Number(value)
    : undefined;
}

export function resolveNotificationTarget(path, role) {
  const professional = role === "professional" || role === "professor";
  const fallback = { view: professional ? "dashboard" : "home", context: {} };
  const parsed = parseNotificationPath(path, role);
  if (!parsed) return fallback;
  const view = !professional && parsed.view === "treinos" && parsed.context.focus === "videos" ? "videos" : parsed.view;
  return { view, context: parsed.context };
}

export function isSupportedNotificationPath(path, role) {
  return !!parseNotificationPath(path, role);
}

function parseNotificationPath(path, role) {
  const professional = role === "professional" || role === "professor";
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[\u0000-\u001f]/.test(path) || path.length > 300) return null;
  let target;
  try { target = new URL(path, "https://jm.local"); } catch { return null; }
  if (target.origin !== "https://jm.local") return null;
  const routes = professional ? PROFESSIONAL_ROUTES : STUDENT_ROUTES;
  const view = routes[target.pathname];
  if (!view) return null;

  const context = {};
  const entityType = target.searchParams.get("entity_type") || (target.searchParams.has("appointment_id") ? "appointment" : "");
  if (entityType && !ENTITY_TYPES.includes(entityType)) return null;
  const studentId = positiveId(target.searchParams.get("student_id"));
  const rawEntityId = target.searchParams.get("entity_id") || target.searchParams.get("appointment_id");
  const entityId = positiveId(rawEntityId)
    || (entityType === "checkout_order" && typeof rawEntityId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(rawEntityId) ? rawEntityId : undefined)
    || (entityType === "workout_session" && typeof rawEntityId === "string" && /^[a-f0-9-]{36}$/i.test(rawEntityId) ? rawEntityId : undefined);
  if (rawEntityId && !entityId) return null;
  if (studentId) context.studentId = studentId;
  if (entityId) context.entityId = entityId;
  if (entityType) context.entityType = entityType;
  const focus = target.searchParams.get("focus");
  if (focus && !FOCUSES.includes(focus)) return null;
  if (focus) context.focus = focus;
  const status = target.searchParams.get("status");
  if (["PENDING", "OVERDUE", "PAID", "APPROVED", "REJECTED", "CANCELLED", "REFUNDED", "CONTESTED"].includes(status)) context.status = status;
  else if (status) return null;
  return { view, context };
}
