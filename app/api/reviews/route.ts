import { getD1 } from "../../../db";

const categories = new Set(["copy", "readability", "language", "image", "navigation", "mobile", "other"]);
const tones = new Set(["correction", "concern", "idea", "positive"]);
const kinds = new Set(["pin", "highlight"]);
const languageChoices = new Set(["english", "spanish", "unsure"]);

class ValidationError extends Error {}

type RawAnnotation = {
  id?: unknown;
  kind?: unknown;
  sectionId?: unknown;
  sectionLabel?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  category?: unknown;
  tone?: unknown;
  comment?: unknown;
  suggestion?: unknown;
  viewport?: unknown;
};

function cleanText(value: unknown, maxLength: number, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new ValidationError("Completa todos los campos obligatorios.");
  if (text.length > maxLength) throw new ValidationError("Una de tus respuestas es demasiado larga.");
  return text;
}

function cleanRating(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
    throw new ValidationError("Completa las cuatro calificaciones.");
  }
  return Number(value);
}

function cleanRatio(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError("La posición de un comentario no es válida.");
  }
  return value;
}

function cleanChoice(value: unknown, allowed: Set<string>, message: string) {
  const text = cleanText(value, 64, true);
  if (!allowed.has(text)) throw new ValidationError(message);
  return text;
}

function cleanAnnotation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Uno de los comentarios no tiene un formato válido.");
  }
  const annotation = value as RawAnnotation;
  const sectionId = cleanText(annotation.sectionId, 64, true);
  if (!/^[a-z0-9-]+$/.test(sectionId)) throw new ValidationError("La sección de un comentario no es válida.");
  const x = cleanRatio(annotation.x);
  const y = cleanRatio(annotation.y);
  const width = cleanRatio(annotation.width);
  const height = cleanRatio(annotation.height);
  if (x + width > 1.000001 || y + height > 1.000001) {
    throw new ValidationError("El tamaño de un comentario no cabe dentro de su sección.");
  }
  return {
    clientId: cleanText(annotation.id, 64) || crypto.randomUUID(),
    kind: cleanChoice(annotation.kind, kinds, "El tipo de comentario no es válido."),
    sectionId,
    sectionLabel: cleanText(annotation.sectionLabel, 100, true),
    x,
    y,
    width,
    height,
    category: cleanChoice(annotation.category, categories, "La categoría del comentario no es válida."),
    tone: cleanChoice(annotation.tone, tones, "El tono del comentario no es válido."),
    comment: cleanText(annotation.comment, 1200, true),
    suggestion: cleanText(annotation.suggestion, 1200),
    viewport: cleanText(annotation.viewport, 40),
  };
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return Response.json({ error: "Envía la revisión como JSON." }, { status: 415 });
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 160_000) {
      return Response.json({ error: "Esta revisión es demasiado grande para enviarse." }, { status: 413 });
    }

    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ValidationError("Los datos de la revisión no tienen el formato correcto.");
    }
    const payload = parsed as Record<string, unknown>;
    if (cleanText(payload.website, 200)) {
      return Response.json({ reviewId: crypto.randomUUID() }, { status: 201 });
    }

    const reviewerName = cleanText(payload.reviewerName, 100);
    const reviewerEmail = cleanText(payload.reviewerEmail, 180);
    if (reviewerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reviewerEmail)) {
      return Response.json({ error: "Escribe un correo válido o deja el campo en blanco." }, { status: 400 });
    }

    if (payload.annotations !== undefined && !Array.isArray(payload.annotations)) {
      throw new ValidationError("La lista de comentarios no es válida.");
    }
    const rawAnnotations = Array.isArray(payload.annotations) ? payload.annotations : [];
    if (rawAnnotations.length > 50) {
      return Response.json({ error: "Envía un máximo de 50 comentarios por revisión." }, { status: 400 });
    }
    const annotations = rawAnnotations.map(cleanAnnotation);
    if (new Set(annotations.map((annotation) => annotation.clientId)).size !== annotations.length) {
      throw new ValidationError("Cada comentario debe tener un identificador único.");
    }

    const submissionId = cleanText(payload.submissionId, 64);
    if (submissionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
      throw new ValidationError("El identificador de la revisión no es válido.");
    }
    const reviewId = submissionId || crypto.randomUUID();
    const db = getD1();

    if (submissionId) {
      const existing = await db.prepare("SELECT id FROM reviews WHERE id = ? LIMIT 1").bind(reviewId).first<{ id: string }>();
      if (existing?.id) return Response.json({ reviewId: existing.id }, { status: 201 });
    }

    const insertMode = submissionId ? "INSERT OR IGNORE" : "INSERT";

    const statements = [
      db.prepare(`${insertMode} INTO reviews (
        id, reviewer_name, reviewer_email, reviewer_role, visit_frequency,
        overall, readability, navigation, welcome, language_default,
        top_priority, anything_else, annotation_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          reviewId,
          reviewerName,
          reviewerEmail,
          cleanText(payload.reviewerRole, 80),
          cleanText(payload.visitFrequency, 80),
          cleanRating(payload.overall),
          cleanRating(payload.readability),
          cleanRating(payload.navigation),
          cleanRating(payload.welcome),
          (() => {
            const value = cleanText(payload.languageDefault, 64);
            if (value && !languageChoices.has(value)) throw new ValidationError("La selección de idioma no es válida.");
            return value;
          })(),
          cleanText(payload.topPriority, 160),
          cleanText(payload.anythingElse, 1800),
          annotations.length,
        ),
      ...annotations.map((annotation) => db.prepare(`${insertMode} INTO annotations (
        id, review_id, kind, section_id, section_label, x, y, width, height,
        category, tone, comment, suggestion, viewport
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          submissionId ? `${reviewId}:${annotation.clientId}` : crypto.randomUUID(),
          reviewId,
          annotation.kind,
          annotation.sectionId,
          annotation.sectionLabel,
          annotation.x,
          annotation.y,
          annotation.width,
          annotation.height,
          annotation.category,
          annotation.tone,
          annotation.comment,
          annotation.suggestion,
          annotation.viewport,
        )),
    ];

    await db.batch(statements);
    return Response.json({ reviewId }, { status: 201 });
  } catch (error) {
    const isValidation = error instanceof ValidationError || error instanceof SyntaxError;
    const message = error instanceof ValidationError
      ? error.message
      : error instanceof SyntaxError
        ? "Los datos de la revisión no tienen el formato correcto."
        : "No pudimos guardar la revisión. Inténtalo de nuevo.";
    return Response.json(
      { error: message },
      { status: isValidation ? 400 : 500 },
    );
  }
}
