import { isSupportedNotificationPath } from "./notificationNavigation.js";

const BRAND = "JM Performance";
const EVENT_TYPES = new Set([
  "appointment", "anamnesis", "charge", "checkin", "checkout_order", "evaluation", "execution",
  "evolution", "message", "pain_record", "payment", "plan", "student", "subscription",
  "video_review", "workout_session", "update",
]);
const GENERIC_ACTORS = new Set(["aluno", "aluna", "um aluno", "uma aluna", "novo aluno", "undefined", "null"]);

function normalized(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
function cleanText(value, limit = 160) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
function actorFrom(body, pattern) {
  const match = String(body || "").match(pattern);
  if (!match?.[1]) return "";
  const name = cleanText(match[1], 70).replace(/[<>"\x60]/g, "").trim();
  return name && !/@/.test(name) && !GENERIC_ACTORS.has(normalized(name)) ? name : "";
}
function prefixedActor(body) {
  const actor = actorFrom(body, /^([^:]{1,70}):\s+/i);
  if (!actor || GENERIC_ACTORS.has(normalized(actor)) || /\b(enviou|respondeu|fez|cadastrou|registrou|atualizou|mensagem|check-in|texto|pagamento|pedido)\b/i.test(normalized(actor))) return "";
  return /^[\p{L}][\p{L}\p{M}'\u2019.-]*(?:\s+[\p{L}][\p{L}\p{M}'\u2019.-]*){0,6}$/u.test(actor) ? actor : "";
}

function safeIdentifier(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value);
  return /^\d{1,10}$/.test(text) && Number(text) > 0
    || /^[A-Za-z0-9_-]{1,128}$/.test(text)
    || /^[a-f0-9-]{36}$/i.test(text)
    ? text
    : undefined;
}

function notificationType(title, entityType) {
  if (EVENT_TYPES.has(entityType)) return entityType;
  const value = normalized(title);
  if (value.includes("mensagem") || value.includes("chat")) return "message";
  if (value.includes("check-in") || value.includes("checkin")) return "checkin";
  if (value.includes("cadastro") || value.includes("aluno")) return "student";
  if (value.includes("agendamento") || value.includes("atendimento")) return "appointment";
  if (value.includes("pagamento")) return "payment";
  if (value.includes("cobranca")) return "charge";
  if (value.includes("checkout")) return "checkout_order";
  if (value.includes("assinatura")) return "subscription";
  if (value.includes("evolucao")) return "evolution";
  if (value.includes("avaliacao")) return "evaluation";
  if (value.includes("fora da prescricao")) return "execution";
  if (value.includes("treino") || value.includes("execucao")) return "workout_session";
  if (value.includes("video")) return "video_review";
  if (value.includes("anamnese")) return "anamnesis";
  if (value.includes("dor") || value.includes("saude")) return "pain_record";
  if (value.includes("plano") || value.includes("experience")) return "plan";
  return "update";
}

function safeDestination(notification) {
  const raw = typeof notification?.path === "string" ? notification.path : "/membros/";
  const path = /^\/(?!\/)[^\u0000-\u001f]{0,190}$/.test(raw) ? raw : "/membros/";
  const parsed = new URL(path, "https://jm.local");
  const supported = isSupportedNotificationPath(path, "professional") || isSupportedNotificationPath(path, "student");
  if (!supported) return { path: "/membros/", type: notificationType(notification?.title, ""), studentId: undefined, eventId: undefined };
  const entityType = parsed.searchParams.get("entity_type") || (parsed.searchParams.has("appointment_id") ? "appointment" : "");
  const type = notificationType(notification?.title, entityType);
  const rawStudentId = parsed.searchParams.get("student_id");
  const studentId = /^\d{1,10}$/.test(rawStudentId || "") && Number(rawStudentId) > 0 ? Number(rawStudentId) : undefined;
  const eventId = safeIdentifier(parsed.searchParams.get("entity_id") || parsed.searchParams.get("appointment_id"));
  return { path, type, studentId, eventId };
}

export function notificationEventLabel(title) {
  const value = normalized(title);
  if (value.includes("mensagem") || value.includes("chat")) return "Nova mensagem";
  if (value.includes("retorno") && value.includes("check-in")) return "Retorno do check-in";
  if (value.includes("retorno") && value.includes("video")) return "Retorno de vídeo";
  if (value.includes("check-in") || value.includes("checkin")) return "Novo check-in";
  if (value.includes("pronto para atendimento")) return "Anamnese recebida";
  if (value.includes("cadastro") || value.includes("aluno")) return "Novo aluno";
  if (value.includes("agendamento") || value.includes("atendimento")) return "Agendamento";
  if (value.includes("pagamento") || value.includes("cobranca") || value.includes("checkout")) return "Atualiza\u00e7\u00e3o financeira";
  if (value.includes("evolucao")) return "Evolu\u00e7\u00e3o atualizada";
  if (value.includes("fora da prescricao")) return "Execu\u00e7\u00e3o fora da prescri\u00e7\u00e3o";
  if (value.includes("treino") && value.includes("concluido")) return "Treino conclu\u00eddo";
  if (value.includes("execucao") || value.includes("treino")) return "Treino atualizado";
  if (value.includes("video")) return "V\u00eddeo para an\u00e1lise";
  if (value.includes("anamnese")) return "Anamnese recebida";
  if (value.includes("avaliacao")) return "Avalia\u00e7\u00e3o atualizada";
  if (value.includes("dor") || value.includes("saude")) return "Acompanhamento";
  if (value.includes("plano") || value.includes("experience")) return "Plano atualizado";
  if (value.includes("retorno")) return "Retorno dispon\u00edvel";
  return "Atualiza\u00e7\u00e3o no acompanhamento";
}
export function notificationPushDescription(title, body) {
  const value = normalized(title);
  if (value.includes("retorno") && value.includes("check-in")) return "Seu profissional respondeu ao check-in.";
  if (value.includes("retorno") && value.includes("video")) return "Seu profissional registrou uma orientação sobre o vídeo.";
  if (value.includes("pronto para atendimento")) {
    const actor = prefixedActor(body) || actorFrom(body, /^(.+?)\s+(?:concluiu|completou) o (?:onboarding|cadastro)\b/i);
    return actor ? actor + " concluiu a anamnese." : "Um aluno concluiu a anamnese.";
  }
  if (value.includes("mensagem") || value.includes("chat")) {
    if (value.includes("do professor")) return "Seu profissional enviou uma nova mensagem.";
    const actor = actorFrom(body, /^(.+?)\s+enviou uma mensagem\b/i);
    return actor ? actor + " enviou uma mensagem." : "Um aluno enviou uma nova mensagem.";
  }
  if (value.includes("check-in") || value.includes("checkin")) {
    const actor = actorFrom(body, /^(.+?)\s+(?:respondeu o check-in|fez o check-in)\b/i);
    return actor ? actor + " fez o check-in." : "Um aluno enviou um novo check-in.";
  }
  if (value.includes("cadastro") || value.includes("aluno")) {
    const actor = prefixedActor(body) || actorFrom(body, /^(.+?)\s+(?:se cadastrou|concluiu (?:o cadastro|o acesso))\b/i);
    return actor ? actor + " se cadastrou." : "Um novo aluno se cadastrou.";
  }
  if (value.includes("agendamento") || value.includes("atendimento")) {
    const actor = actorFrom(body, /^(.+?)\s+(reservou um hor\u00e1rio|escolheu um novo hor\u00e1rio)\b/i);
    if (actor) return actor + (normalized(body).includes("escolheu") ? " escolheu um novo hor\u00e1rio." : " reservou um hor\u00e1rio.");
    const namedActor = prefixedActor(body);
    if (value.includes("cancelado")) return namedActor ? namedActor + " cancelou um agendamento." : "Um aluno cancelou um agendamento.";
    if (value.includes("reagendado")) return namedActor ? namedActor + " alterou um agendamento." : "Um aluno alterou um agendamento.";
    const remindedActor = actorFrom(body, /^(.+?)\s+tem um atendimento agendado\b/i);
    if (remindedActor) return remindedActor + " tem um agendamento próximo.";
    return value.includes("confirmado") ? "Seu hor\u00e1rio foi reservado." : "H\u00e1 uma atualiza\u00e7\u00e3o no seu agendamento.";
  }
  if (value.includes("pagamento") || value.includes("cobranca") || value.includes("checkout")) {
    const actor = prefixedActor(body);
    return actor ? actor + " tem uma atualiza\u00e7\u00e3o financeira." : "H\u00e1 uma atualiza\u00e7\u00e3o financeira.";
  }
  if (value.includes("evolucao")) {
    const actor = prefixedActor(body) || actorFrom(body, /^(.+?)\s+(?:registrou|enviou|atualizou)\b/i);
    return actor ? actor + " registrou uma atualiza\u00e7\u00e3o de evolu\u00e7\u00e3o." : "Um aluno registrou uma atualiza\u00e7\u00e3o de evolu\u00e7\u00e3o.";
  }
  if (value.includes("execucao") || value.includes("treino")) {
    const actor = prefixedActor(body) || actorFrom(body, /^(.+?)\s+(?:concluiu|registrou|enviou)\b/i);
    if (value.includes("fora da prescricao")) return actor ? actor + " registrou uma execução fora da prescrição." : "Uma execução precisa ser revisada pelo profissional.";
    if (value.includes("concluido")) return actor ? actor + " concluiu uma sessão de treino." : "Um aluno concluiu uma sessão de treino.";
    return actor ? actor + " registrou uma atividade de treino." : "H\u00e1 uma nova atividade de treino para revisar.";
  }
  if (value.includes("anamnese") || value.includes("avaliacao") || value.includes("dor") || value.includes("saude")) {
    const actor = prefixedActor(body) || actorFrom(body, /^(.+?)\s+(?:concluiu|enviou|registrou|preencheu)\b/i);
    return actor ? actor + " enviou uma atualiza\u00e7\u00e3o para o acompanhamento." : "H\u00e1 uma nova atualiza\u00e7\u00e3o no acompanhamento.";
  }
  if (value.includes("video")) {
    const actor = prefixedActor(body);
    return actor ? actor + " enviou um v\u00eddeo para an\u00e1lise." : "Um aluno enviou um v\u00eddeo para an\u00e1lise.";
  }
  if (value.includes("plano") || value.includes("experience")) {
    const actor = prefixedActor(body);
    return actor ? actor + " tem uma atualiza\u00e7\u00e3o no plano." : "H\u00e1 uma atualiza\u00e7\u00e3o de acesso dispon\u00edvel no aplicativo.";
  }
  if (value.includes("retorno")) return "Seu profissional registrou um novo retorno.";
  return "H\u00e1 uma nova atualiza\u00e7\u00e3o no acompanhamento.";
}
export function createPushNotificationPayload(notification) {
  const id = Number(notification?.id);
  const destination = safeDestination(notification);
  return {
    version: 2,
    id: Number.isSafeInteger(id) && id > 0 ? id : undefined,
    type: destination.type,
    title: BRAND + " \u00b7 " + notificationEventLabel(notification?.title),
    body: notificationPushDescription(notification?.title, notification?.body).slice(0, 160),
    ...(destination.studentId ? { studentId: destination.studentId } : {}),
    ...(destination.eventId ? { eventId: destination.eventId } : {}),
    path: destination.path,
  };
}
