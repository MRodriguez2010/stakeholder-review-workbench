"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Tool = "browse" | "pin" | "highlight";
type AnnotationKind = "pin" | "highlight";
type Category = "copy" | "readability" | "language" | "image" | "navigation" | "mobile" | "other";
type Tone = "correction" | "concern" | "idea" | "positive";
type Surface = "mobile" | "desktop";

type Annotation = {
  id: string;
  kind: AnnotationKind;
  sectionId: string;
  sectionLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  category: Category;
  tone: Tone;
  comment: string;
  suggestion: string;
  surface?: Surface;
  captureMode?: "live" | "desktop-preview";
  viewport?: string;
};

type Position = Annotation & {
  left: number;
  top: number;
  pixelWidth: number;
  pixelHeight: number;
};

const DESKTOP_WIDTH = 1280;
const DESKTOP_CAPTURE_HEIGHT = 856;

const categoryOptions: Array<{ value: Category; label: string }> = [
  { value: "copy", label: "Texto o datos" },
  { value: "readability", label: "Tamaño de texto" },
  { value: "language", label: "Idioma o traducción" },
  { value: "image", label: "Foto o video" },
  { value: "navigation", label: "Navegación" },
  { value: "mobile", label: "Vista móvil o escritorio" },
  { value: "other", label: "Otro" },
];

const toneOptions: Array<{ value: Tone; label: string }> = [
  { value: "correction", label: "Corrección" },
  { value: "concern", label: "Algo preocupa" },
  { value: "idea", label: "Idea" },
  { value: "positive", label: "Funciona bien" },
];

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function isDraftAnnotation(value: unknown): value is Annotation {
  if (!value || typeof value !== "object") return false;
  const annotation = value as Partial<Annotation>;
  return (
    typeof annotation.id === "string" && annotation.id.length <= 64 &&
    (annotation.kind === "pin" || annotation.kind === "highlight") &&
    typeof annotation.sectionId === "string" &&
    typeof annotation.sectionLabel === "string" &&
    typeof annotation.x === "number" && annotation.x >= 0 && annotation.x <= 1 &&
    typeof annotation.y === "number" && annotation.y >= 0 && annotation.y <= 1 &&
    typeof annotation.width === "number" && annotation.width >= 0 && annotation.x + annotation.width <= 1.000001 &&
    typeof annotation.height === "number" && annotation.height >= 0 && annotation.y + annotation.height <= 1.000001 &&
    categoryOptions.some((option) => option.value === annotation.category) &&
    toneOptions.some((option) => option.value === annotation.tone) &&
    typeof annotation.comment === "string" && annotation.comment.trim().length > 0 && annotation.comment.length <= 1200 &&
    typeof annotation.suggestion === "string" && annotation.suggestion.length <= 1200 &&
    (annotation.surface === undefined || annotation.surface === "mobile" || annotation.surface === "desktop") &&
    (annotation.captureMode === undefined || annotation.captureMode === "live" || annotation.captureMode === "desktop-preview") &&
    (annotation.viewport === undefined || /^(?:mobile|desktop):\d{3,4}x\d{3,5}(?::(?:live|desktop-preview))?$/.test(annotation.viewport))
  );
}

function isDesktopPreviewAnnotation(annotation: Annotation) {
  return annotation.captureMode === "desktop-preview" || (annotation.captureMode === undefined && annotation.surface === "desktop");
}

function sectionAtPoint(clientX: number, clientY: number) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const element of elements) {
    const section = element.closest<HTMLElement>("[data-review-section]");
    if (section) return section;
  }
  return document.querySelector<HTMLElement>("[data-review-section='hero']");
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset className="review-rating-row">
      <legend>{label}</legend>
      <div>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            className={value === rating ? "is-selected" : ""}
            aria-label={`${label}: ${rating} de 5`}
            aria-pressed={value === rating}
            onClick={() => onChange(rating)}
          >
            {rating}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Icon({ name }: { name: Tool | "notes" | "close" | "trash" | "desktop" }) {
  const paths = {
    browse: <><path d="M5 3l6.8 16 2.2-6 6-2.2L5 3z" /><path d="M13.5 13.5l4 4" /></>,
    pin: <><path d="M12 21s6-5.1 6-11A6 6 0 006 10c0 5.9 6 11 6 11z" /><circle cx="12" cy="10" r="2" /></>,
    highlight: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h5" /></>,
    notes: <><path d="M5 5h14v11H9l-4 3V5z" /><path d="M8 9h8M8 12h5" /></>,
    close: <><path d="M6 6l12 12M18 6L6 18" /></>,
    trash: <><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14" /></>,
    desktop: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function ReviewLayer() {
  const [mode, setMode] = useState<"checking" | "review" | "embedded">("checking");
  const [draftReady, setDraftReady] = useState(false);
  const [tool, setTool] = useState<Tool>("browse");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [candidate, setCandidate] = useState<Annotation | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [introOpen, setIntroOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [desktopPreviewOpen, setDesktopPreviewOpen] = useState(false);
  const [desktopAnnotating, setDesktopAnnotating] = useState(false);
  const [desktopZoom, setDesktopZoom] = useState<"fit" | "full">("fit");
  const [desktopHeight, setDesktopHeight] = useState(8600);
  const [fitScale, setFitScale] = useState(0.32);
  const [desktopPositions, setDesktopPositions] = useState<Position[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragRect, setDragRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [overall, setOverall] = useState(0);
  const [readability, setReadability] = useState(0);
  const [navigation, setNavigation] = useState(0);
  const [welcome, setWelcome] = useState(0);
  const [anythingElse, setAnythingElse] = useState("");
  const [website, setWebsite] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const pointerStart = useRef<{ clientX: number; clientY: number; section: HTMLElement } | null>(null);
  const desktopFrame = useRef<HTMLIFrameElement | null>(null);
  const submissionId = useRef("");
  const composerDialog = useRef<HTMLElement | null>(null);
  const drawerDialog = useRef<HTMLElement | null>(null);
  const desktopDialog = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const modalOpen = Boolean(candidate) || drawerOpen || desktopPreviewOpen;
  const dialogLayer = candidate ? "composer" : desktopPreviewOpen ? "desktop" : drawerOpen ? "drawer" : "";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const embedMode = new URLSearchParams(window.location.search).get("embed");
      const isEmbedded = embedMode === "desktop" || embedMode === "website-response";
      setMode(isEmbedded ? "embedded" : "review");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (mode !== "embedded") return;

    const parameters = new URLSearchParams(window.location.search);
    const isDesktopPreview = parameters.get("embed") === "desktop";
    if (!isDesktopPreview) return;
    document.documentElement.classList.add("review-embed-mode");
    if (parameters.get("reportHeight") !== "1") {
      return () => document.documentElement.classList.remove("review-embed-mode");
    }
    const contentRoot = document.querySelector<HTMLElement>("main");
    let reportFrame = 0;
    const reportHeight = () => {
      const height = contentRoot
        ? Math.ceil(Math.max(contentRoot.scrollHeight, contentRoot.getBoundingClientRect().height))
        : Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      window.parent.postMessage({
        type: "patio-desktop-preview-height",
        height,
      }, window.location.origin);
    };
    const scheduleHeightReport = () => {
      if (reportFrame) return;
      reportFrame = window.requestAnimationFrame(() => {
        reportFrame = 0;
        reportHeight();
      });
    };
    const observer = new ResizeObserver(scheduleHeightReport);
    observer.observe(contentRoot ?? document.documentElement);
    window.addEventListener("load", scheduleHeightReport);
    scheduleHeightReport();
    return () => {
      observer.disconnect();
      window.removeEventListener("load", scheduleHeightReport);
      if (reportFrame) window.cancelAnimationFrame(reportFrame);
      document.documentElement.classList.remove("review-embed-mode");
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "review") return;
    const resize = () => setFitScale(Math.min(1, Math.max(0.2, (window.innerWidth - 24) / DESKTOP_WIDTH)));
    const receiveHeight = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== desktopFrame.current?.contentWindow) return;
      const data = event.data as { type?: string; height?: number };
      if (data.type === "patio-desktop-preview-height" && typeof data.height === "number") {
        setDesktopHeight(Math.min(30000, Math.max(1200, data.height)));
      }
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("message", receiveHeight);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("message", receiveHeight);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "review") return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem("patio-review-draft");
        if (stored) {
          const parsed = JSON.parse(stored) as unknown;
          if (Array.isArray(parsed)) {
            const safeAnnotations = parsed.filter(isDraftAnnotation).slice(0, 50);
            setAnnotations(safeAnnotations.filter((annotation, index) => safeAnnotations.findIndex((item) => item.id === annotation.id) === index));
          }
        }
        const storedSubmissionId = window.localStorage.getItem("patio-review-submission-id");
        if (storedSubmissionId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storedSubmissionId)) {
          submissionId.current = storedSubmissionId;
        }
        if (window.localStorage.getItem("patio-review-intro-seen") === "yes") setIntroOpen(false);
      } catch {
        // El almacenamiento local del borrador es opcional.
      } finally {
        setDraftReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  useEffect(() => {
    if (mode !== "review" || !draftReady) return;
    try {
      window.localStorage.setItem("patio-review-draft", JSON.stringify(annotations));
    } catch {
      // La entrega final se guarda en el sitio aunque el borrador local falle.
    }
  }, [annotations, draftReady, mode]);

  useEffect(() => {
    if (mode !== "review") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (candidate) setCandidate(null);
      else if (desktopPreviewOpen) setDesktopPreviewOpen(false);
      else if (drawerOpen) setDrawerOpen(false);
      else setTool("browse");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [candidate, desktopPreviewOpen, drawerOpen, mode]);

  useEffect(() => {
    if (mode !== "review" || !modalOpen) return;
    if (document.activeElement instanceof HTMLElement) restoreFocus.current = document.activeElement;
    const roots = [
      document.querySelector<HTMLElement>("main"),
      document.querySelector<HTMLElement>(".review-intro"),
      document.querySelector<HTMLElement>(".review-toolbar"),
      document.querySelector<HTMLElement>(".review-annotation-layer"),
    ].filter((root): root is HTMLElement => Boolean(root));
    roots.forEach((root) => { root.inert = true; });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      roots.forEach((root) => { root.inert = false; });
      document.body.style.overflow = previousOverflow;
      restoreFocus.current?.focus({ preventScroll: true });
      restoreFocus.current = null;
    };
  }, [modalOpen, mode]);

  useEffect(() => {
    if (mode !== "review" || !dialogLayer) return;
    const dialog = dialogLayer === "composer"
      ? composerDialog.current
      : dialogLayer === "desktop"
        ? desktopDialog.current
        : drawerDialog.current;
    if (!dialog) return;
    const selector = "button:not(:disabled):not([tabindex='-1']), input:not(:disabled):not([tabindex='-1']), select:not(:disabled):not([tabindex='-1']), textarea:not(:disabled):not([tabindex='-1']), a[href]:not([tabindex='-1']), [tabindex]:not([tabindex='-1'])";
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter((element) => !element.closest("[inert]"));
    const focusTimer = window.setTimeout(() => focusable()[0]?.focus({ preventScroll: true }), 20);
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", trapFocus);
    };
  }, [dialogLayer, mode]);

  const refreshPositions = useCallback(() => {
    if (mode !== "review") return;
    const next = annotations.filter((annotation) => !isDesktopPreviewAnnotation(annotation)).flatMap((annotation) => {
      const section = document.querySelector<HTMLElement>(`[data-review-section='${annotation.sectionId}']`);
      if (!section) return [];
      const rect = section.getBoundingClientRect();
      return [{
        ...annotation,
        left: rect.left + annotation.x * rect.width,
        top: rect.top + annotation.y * rect.height,
        pixelWidth: Math.max(38, annotation.width * rect.width),
        pixelHeight: Math.max(38, annotation.height * rect.height),
      }];
    });
    setPositions(next);
  }, [annotations, mode]);

  useEffect(() => {
    if (mode !== "review") return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        refreshPositions();
      });
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [mode, refreshPositions]);

  const selectTool = (next: Tool) => {
    setIntroOpen(false);
    setDrawerOpen(false);
    setCandidate(null);
    setTool(next);
    try {
      window.localStorage.setItem("patio-review-intro-seen", "yes");
    } catch {
      // El indicador introductorio es opcional.
    }
  };

  const openDesktopPreview = () => {
    setIntroOpen(false);
    setDrawerOpen(false);
    setDesktopAnnotating(false);
    setDesktopZoom("fit");
    setDesktopPreviewOpen(true);
  };

  const makePin = (clientX: number, clientY: number, section: HTMLElement) => {
    const rect = section.getBoundingClientRect();
    const captureSurface: Surface = window.innerWidth >= 1080 ? "desktop" : "mobile";
    setCandidate({
      id: newId(),
      kind: "pin",
      sectionId: section.dataset.reviewSection ?? "hero",
      sectionLabel: section.dataset.reviewLabel ?? "Sitio web",
      x: clamp((clientX - rect.left) / rect.width),
      y: clamp((clientY - rect.top) / rect.height),
      width: 0,
      height: 0,
      category: "copy",
      tone: "correction",
      comment: "",
      suggestion: "",
      surface: captureSurface,
      captureMode: "live",
      viewport: `${captureSurface}:${window.innerWidth}x${window.innerHeight}:live`,
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const section = sectionAtPoint(event.clientX, event.clientY);
    if (!section) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "pin") {
      makePin(event.clientX, event.clientY, section);
      setTool("browse");
      return;
    }
    pointerStart.current = { clientX: event.clientX, clientY: event.clientY, section };
    setDragRect({ left: event.clientX, top: event.clientY, width: 1, height: 1 });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== "highlight" || !pointerStart.current) return;
    const start = pointerStart.current;
    setDragRect({
      left: Math.min(start.clientX, event.clientX),
      top: Math.min(start.clientY, event.clientY),
      width: Math.abs(event.clientX - start.clientX),
      height: Math.abs(event.clientY - start.clientY),
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== "highlight" || !pointerStart.current) return;
    const start = pointerStart.current;
    const sectionRect = start.section.getBoundingClientRect();
    let left = Math.min(start.clientX, event.clientX);
    let top = Math.min(start.clientY, event.clientY);
    let width = Math.abs(event.clientX - start.clientX);
    let height = Math.abs(event.clientY - start.clientY);
    if (width < 28 && height < 28) {
      left = event.clientX - 50;
      top = event.clientY - 32;
      width = 100;
      height = 64;
    }
    const x = clamp((left - sectionRect.left) / sectionRect.width);
    const y = clamp((top - sectionRect.top) / sectionRect.height);
    const captureSurface: Surface = window.innerWidth >= 1080 ? "desktop" : "mobile";
    setCandidate({
      id: newId(),
      kind: "highlight",
      sectionId: start.section.dataset.reviewSection ?? "hero",
      sectionLabel: start.section.dataset.reviewLabel ?? "Sitio web",
      x,
      y,
      width: clamp(width / sectionRect.width, 0.02, 1 - x),
      height: clamp(height / sectionRect.height, 0.02, 1 - y),
      category: "readability",
      tone: "concern",
      comment: "",
      suggestion: "",
      surface: captureSurface,
      captureMode: "live",
      viewport: `${captureSurface}:${window.innerWidth}x${window.innerHeight}:live`,
    });
    pointerStart.current = null;
    setDragRect(null);
    setTool("browse");
  };

  const cancelPointerGesture = () => {
    pointerStart.current = null;
    setDragRect(null);
  };

  const saveCandidate = () => {
    if (!candidate || !candidate.comment.trim()) return;
    setAnnotations((current) => [...current, {
      ...candidate,
      comment: candidate.comment.trim(),
      suggestion: candidate.suggestion.trim(),
    }]);
    setCandidate(null);
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((current) => current.filter((item) => item.id !== id));
    setActiveId((current) => current === id ? null : current);
  };

  const reviewReady = overall > 0 && readability > 0 && navigation > 0 && welcome > 0;

  const submitReview = async () => {
    if (!reviewReady || submitState === "sending") return;
    setSubmitState("sending");
    setSubmitMessage("");
    let requestTimeout: number | undefined;
    try {
      if (!submissionId.current) {
        submissionId.current = crypto.randomUUID();
        try {
          window.localStorage.setItem("patio-review-submission-id", submissionId.current);
        } catch {
          // A page-lifetime idempotency key still protects ordinary retries.
        }
      }
      const controller = new AbortController();
      requestTimeout = window.setTimeout(() => controller.abort(), 20_000);
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          submissionId: submissionId.current,
          reviewerName: "",
          reviewerEmail: "",
          reviewerRole: "",
          visitFrequency: "",
          overall,
          readability,
          navigation,
          welcome,
          languageDefault: "",
          topPriority: "",
          anythingElse,
          website,
          annotations: annotations.map((annotation) => ({
            ...annotation,
            viewport: annotation.viewport ?? (isDesktopPreviewAnnotation(annotation)
              ? `desktop:${DESKTOP_WIDTH}x${DESKTOP_CAPTURE_HEIGHT}:desktop-preview`
              : `${annotation.surface ?? (window.innerWidth >= 1080 ? "desktop" : "mobile")}:${window.innerWidth}x${window.innerHeight}:live`),
          })),
        }),
      });
      const result = await response.json().catch(() => ({})) as { reviewId?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "No pudimos guardar tu revisión.");
      setSubmitState("success");
      setSubmitMessage(result.reviewId ?? "guardada");
      try {
        window.localStorage.removeItem("patio-review-draft");
        window.localStorage.removeItem("patio-review-submission-id");
      } catch {
        // Successful delivery does not depend on local draft storage.
      }
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(error instanceof DOMException && error.name === "AbortError"
        ? "La conexión tardó demasiado. Inténtalo de nuevo; no duplicaremos tu revisión."
        : error instanceof Error ? error.message : "No pudimos guardar tu revisión. Inténtalo de nuevo.");
    } finally {
      if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
    }
  };

  const activeAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === activeId),
    [activeId, annotations],
  );
  const desktopScale = desktopZoom === "fit" ? fitScale : 1;

  const refreshDesktopPositions = useCallback(() => {
    const frameDocument = desktopFrame.current?.contentDocument;
    if (!frameDocument) return;
    const next = annotations.filter(isDesktopPreviewAnnotation).flatMap((annotation) => {
      const section = frameDocument.querySelector<HTMLElement>(`[data-review-section='${annotation.sectionId}']`);
      if (!section) return [];
      const rect = section.getBoundingClientRect();
      return [{
        ...annotation,
        left: (rect.left + annotation.x * rect.width) * desktopScale,
        top: (rect.top + annotation.y * rect.height) * desktopScale,
        pixelWidth: Math.max(38, annotation.width * rect.width * desktopScale),
        pixelHeight: Math.max(38, annotation.height * rect.height * desktopScale),
      }];
    });
    setDesktopPositions(next);
  }, [annotations, desktopScale]);

  useEffect(() => {
    if (!desktopPreviewOpen) return;
    const frame = window.requestAnimationFrame(refreshDesktopPositions);
    return () => window.cancelAnimationFrame(frame);
  }, [desktopHeight, desktopPreviewOpen, refreshDesktopPositions]);

  const addDesktopComment = (clientX: number, clientY: number) => {
    const frame = desktopFrame.current;
    const frameDocument = frame?.contentDocument;
    if (!frame || !frameDocument) return;
    const frameRect = frame.getBoundingClientRect();
    const virtualX = (clientX - frameRect.left) / desktopScale;
    const virtualY = (clientY - frameRect.top) / desktopScale;
    const target = frameDocument.elementFromPoint(virtualX, virtualY);
    const section = target?.closest<HTMLElement>("[data-review-section]");
    if (!section) return;
    const sectionRect = section.getBoundingClientRect();
    setCandidate({
      id: newId(),
      kind: "pin",
      sectionId: section.dataset.reviewSection ?? "hero",
      sectionLabel: section.dataset.reviewLabel ?? "Sitio web",
      x: clamp((virtualX - sectionRect.left) / sectionRect.width),
      y: clamp((virtualY - sectionRect.top) / sectionRect.height),
      width: 0,
      height: 0,
      category: "mobile",
      tone: "concern",
      comment: "",
      suggestion: "",
      surface: "desktop",
      captureMode: "desktop-preview",
      viewport: `desktop:${DESKTOP_WIDTH}x${DESKTOP_CAPTURE_HEIGHT}:desktop-preview`,
    });
    setDesktopAnnotating(false);
  };

  if (mode !== "review") return null;

  return (
    <>
      <div className="review-mode-badge"><span /> Modo de revisión · No es el sitio final</div>

      {introOpen && (
        <section className="review-intro" aria-labelledby="review-intro-title">
          <button className="review-icon-button" type="button" aria-label="Cerrar introducción" onClick={() => setIntroOpen(false)}><Icon name="close" /></button>
          <p className="review-kicker">Revisión interactiva del sitio</p>
          <h2 id="review-intro-title">Recorre el sitio. Marca lo que necesita atención.</h2>
          <p>Navega normalmente. Cuando veas algo, coloca una nota o dibuja un recuadro justo sobre esa área. Tus comentarios quedarán unidos a la revisión final.</p>
          <div className="review-raised">
            <span>Ya identificado</span>
            <ul>
              <li>El inglés será el idioma principal para la carga inicial y los buscadores.</li>
              <li>Señalar cualquier texto que resulte difícil de leer.</li>
            </ul>
          </div>
          <button className="review-primary" type="button" onClick={() => selectTool("pin")}>Comenzar con una nota <span>+</span></button>
          <div className="review-intro-actions">
            <button className="review-secondary" type="button" onClick={() => { setIntroOpen(false); selectTool("browse"); }}>Primero quiero navegar</button>
            <button className="review-secondary" type="button" onClick={openDesktopPreview}><Icon name="desktop" /> Ver versión de escritorio</button>
          </div>
        </section>
      )}

      <nav className="review-toolbar" aria-label="Herramientas de revisión del sitio">
        <button className={tool === "browse" ? "is-active" : ""} type="button" aria-pressed={tool === "browse"} onClick={() => selectTool("browse")}><Icon name="browse" /><span>Navegar</span></button>
        <button className={tool === "pin" ? "is-active" : ""} type="button" aria-pressed={tool === "pin"} onClick={() => selectTool("pin")}><Icon name="pin" /><span>Nota</span></button>
        <button className={tool === "highlight" ? "is-active" : ""} type="button" aria-pressed={tool === "highlight"} onClick={() => selectTool("highlight")}><Icon name="highlight" /><span>Resaltar</span></button>
        <button className={drawerOpen ? "is-active review-notes-button" : "review-notes-button"} type="button" aria-controls="review-drawer" aria-expanded={drawerOpen} onClick={() => { setTool("browse"); setDrawerOpen(true); }}><Icon name="notes" /><span>Finalizar</span><b>{annotations.length}</b></button>
      </nav>

      {tool !== "browse" && (
        <div className="review-tool-status" role="status">
          <strong>{tool === "pin" ? "Toca el punto exacto" : "Arrastra sobre el área"}</strong>
          <span>{tool === "pin" ? "La nota quedará unida a ese lugar." : "Dibuja un recuadro alrededor de lo que quieres señalar."}</span>
          <button type="button" onClick={() => setTool("browse")}>Cancelar</button>
        </div>
      )}

      {tool !== "browse" && (
        <div
          className={`review-capture-layer is-${tool}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={cancelPointerGesture}
          onLostPointerCapture={cancelPointerGesture}
          aria-label={tool === "pin" ? "Toca la página para colocar una nota" : "Arrastra sobre la página para resaltar un área"}
        />
      )}

      <div className="review-annotation-layer" aria-label={`${annotations.length} ${annotations.length === 1 ? "comentario colocado" : "comentarios colocados"}`}>
        {positions.map((position) => {
          const annotationNumber = annotations.findIndex((annotation) => annotation.id === position.id) + 1;
          return position.kind === "pin" ? (
            <button key={position.id} type="button" className="review-pin" style={{ left: position.left, top: position.top }} aria-label={`Abrir nota ${annotationNumber}: ${position.comment}`} onClick={() => { setActiveId(position.id); setDrawerOpen(true); }}>{annotationNumber}</button>
          ) : (
            <button key={position.id} type="button" className="review-highlight" style={{ left: position.left, top: position.top, width: position.pixelWidth, height: position.pixelHeight }} aria-label={`Abrir área ${annotationNumber}: ${position.comment}`} onClick={() => { setActiveId(position.id); setDrawerOpen(true); }}><span>{annotationNumber}</span></button>
          );
        })}
        {dragRect && <div className="review-drag-preview" style={dragRect} />}
      </div>

      {candidate && (
        <div className="review-sheet-scrim" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setCandidate(null); }}>
          <section ref={composerDialog} className="review-composer" role="dialog" aria-modal="true" aria-labelledby="review-composer-title">
            <div className="review-sheet-handle" aria-hidden="true" />
            <div className="review-sheet-heading">
              <div><p className="review-kicker">{candidate.kind === "pin" ? "Nota colocada" : "Área resaltada"} · {candidate.sectionLabel}</p><h2 id="review-composer-title">¿Qué debemos saber?</h2></div>
              <button className="review-icon-button" type="button" aria-label="Descartar comentario" onClick={() => setCandidate(null)}><Icon name="close" /></button>
            </div>
            <fieldset className="review-chip-group">
              <legend>Tipo de comentario</legend>
              <div>{toneOptions.map((option) => <button key={option.value} type="button" aria-pressed={candidate.tone === option.value} className={candidate.tone === option.value ? "is-selected" : ""} onClick={() => setCandidate({ ...candidate, tone: option.value })}>{option.label}</button>)}</div>
            </fieldset>
            <label className="review-field">Área
              <select value={candidate.category} onChange={(event) => setCandidate({ ...candidate, category: event.target.value as Category })}>{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            </label>
            <label className="review-field">Tu comentario <span>obligatorio</span>
              <textarea value={candidate.comment} required aria-required="true" maxLength={1200} placeholder="¿Qué está incorrecto, poco claro, desactualizado o especialmente bien logrado?" onChange={(event) => setCandidate({ ...candidate, comment: event.target.value })} />
            </label>
            <label className="review-field">Texto o solución sugerida <span>opcional</span>
              <textarea value={candidate.suggestion} maxLength={1200} placeholder="Si conoces la corrección, escríbela aquí." onChange={(event) => setCandidate({ ...candidate, suggestion: event.target.value })} />
            </label>
            <button className="review-primary" type="button" disabled={!candidate.comment.trim()} onClick={saveCandidate}>Guardar en este lugar <span>✓</span></button>
          </section>
        </div>
      )}

      <div className={`review-drawer-scrim ${drawerOpen ? "is-open" : ""}`} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}>
        <aside ref={drawerDialog} id="review-drawer" className="review-drawer" role="dialog" aria-modal="true" aria-label="Completar revisión del sitio" aria-hidden={!drawerOpen} inert={drawerOpen ? undefined : true}>
          <header>
            <div><p className="review-kicker">Casa del Patio</p><h2>{submitState === "success" ? "Comentarios recibidos" : "Finaliza tu revisión"}</h2></div>
            <button className="review-icon-button" type="button" aria-label="Cerrar revisión" onClick={() => setDrawerOpen(false)}><Icon name="close" /></button>
          </header>

          {submitState === "success" ? (
            <div className="review-success" role="status">
              <span>✓</span>
              <h3>Gracias por ayudarnos a ver el sitio con más claridad.</h3>
              <p>Tu revisión incluye {annotations.length} {annotations.length === 1 ? "comentario colocado" : "comentarios colocados"}. Referencia: <strong>{submitMessage.slice(0, 8)}</strong></p>
              <button className="review-primary" type="button" onClick={() => setDrawerOpen(false)}>Volver al sitio</button>
            </div>
          ) : (
            <div className="review-drawer-body">
              <section className="review-drawer-section">
                <div className="review-section-title"><span>01</span><div><h3>Tus comentarios colocados</h3><p>Toca un comentario para volver a esa parte del sitio.</p></div></div>
                {annotations.length === 0 ? (
                  <button className="review-empty" type="button" onClick={() => { setDrawerOpen(false); selectTool("pin"); }}><strong>Todavía no hay comentarios</strong><span>Coloca tu primera corrección en la página +</span></button>
                ) : (
                  <div className="review-note-list">
                    {annotations.map((annotation, index) => (
                      <article key={annotation.id} className={activeAnnotation?.id === annotation.id ? "is-active" : ""}>
                        <button className="review-note-main" type="button" onClick={() => {
                          setActiveId(annotation.id);
                          setDrawerOpen(false);
                          if (isDesktopPreviewAnnotation(annotation)) openDesktopPreview();
                          else document.querySelector(`[data-review-section='${annotation.sectionId}']`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}>
                          <span>{index + 1}</span>
                          <div><small>{annotation.surface === "desktop" ? "Escritorio" : "Móvil"} · {annotation.sectionLabel} · {categoryOptions.find((item) => item.value === annotation.category)?.label}</small><strong>{annotation.comment}</strong>{annotation.suggestion && <em>Sugerencia: {annotation.suggestion}</em>}</div>
                        </button>
                        <button className="review-delete" type="button" aria-label={`Eliminar comentario ${index + 1}`} onClick={() => removeAnnotation(annotation.id)}><Icon name="trash" /></button>
                      </article>
                    ))}
                  </div>
                )}
                <button className="review-desktop-card" type="button" onClick={openDesktopPreview}>
                  <Icon name="desktop" />
                  <span><strong>Revisar elementos que solo aparecen en escritorio</strong><small>Abre una copia completa de 1280 px que puedes ajustar o ampliar.</small></span>
                  <b>→</b>
                </button>
              </section>

              <section className="review-drawer-section">
                <div className="review-section-title"><span>02</span><div><h3>Una impresión rápida del sitio</h3><p>1 significa que necesita trabajo; 5 significa excelente.</p></div></div>
                <RatingRow label="Primera impresión general" value={overall} onChange={setOverall} />
                <RatingRow label="El texto fue cómodo de leer" value={readability} onChange={setReadability} />
                <RatingRow label="La información para visitar fue fácil de encontrar" value={navigation} onChange={setNavigation} />
                <RatingRow label="El sitio se sintió acogedor y confiable" value={welcome} onChange={setWelcome} />
              </section>

              <section className="review-drawer-section">
                <div className="review-section-title"><span>03</span><div><h3>¿Algo más?</h3><p>Comparte cualquier idea, dato incorrecto o detalle que todavía no hayas señalado.</p></div></div>
                <label className="review-field">Comentario final <span>opcional</span>
                  <textarea value={anythingElse} maxLength={1800} placeholder="Una idea final, una actividad que falta, un dato incorrecto…" onChange={(event) => setAnythingElse(event.target.value)} />
                </label>
                <label className="review-honeypot" aria-hidden="true">Sitio web<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
              </section>

              {submitState === "error" && <p className="review-error" role="alert">{submitMessage}</p>}
              <div className="review-submit-bar" aria-busy={submitState === "sending"}>
                <div><strong>{annotations.length}</strong><span>{annotations.length === 1 ? "comentario" : "comentarios"}</span></div>
                <button className="review-primary" type="button" disabled={!reviewReady || submitState === "sending"} onClick={submitReview}>{submitState === "sending" ? "Enviando…" : reviewReady ? "Enviar comentarios" : "Completa las cuatro calificaciones"}<span>→</span></button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {desktopPreviewOpen && (
        <section ref={desktopDialog} className="review-desktop-preview" role="dialog" aria-modal="true" aria-labelledby="review-desktop-title" aria-hidden={Boolean(candidate)} inert={candidate ? true : undefined}>
          <header>
            <div><p className="review-kicker">Comparación de diseño</p><h2 id="review-desktop-title">Vista completa de escritorio</h2></div>
            <div className="review-desktop-controls">
              <button type="button" aria-pressed={desktopAnnotating} className={desktopAnnotating ? "is-active" : ""} onClick={() => setDesktopAnnotating((current) => !current)}>Comentar</button>
              <button type="button" aria-pressed={desktopZoom === "fit"} className={desktopZoom === "fit" ? "is-active" : ""} onClick={() => setDesktopZoom("fit")}>Ajustar</button>
              <button type="button" aria-pressed={desktopZoom === "full"} className={desktopZoom === "full" ? "is-active" : ""} onClick={() => setDesktopZoom("full")}>100%</button>
              <button className="review-icon-button" type="button" aria-label="Cerrar vista de escritorio" onClick={() => { setDesktopAnnotating(false); setDesktopPreviewOpen(false); }}><Icon name="close" /></button>
            </div>
          </header>
          <p className="review-desktop-help">Esta copia activa el diseño de escritorio, incluso desde tu teléfono. Desplázate hasta el área, pulsa <strong>Comentar</strong> y toca el punto exacto.</p>
          <div className="review-desktop-scroll">
            <div className={`review-desktop-canvas ${desktopAnnotating ? "is-annotating" : "is-exploring"}`} style={{ width: DESKTOP_WIDTH * desktopScale, height: desktopHeight * desktopScale }}>
              <iframe
                ref={desktopFrame}
                title="Casa del Patio en vista de escritorio"
                src="/?embed=desktop&reportHeight=1"
                style={{ width: DESKTOP_WIDTH, height: desktopHeight, transform: `scale(${desktopScale})` }}
                tabIndex={-1}
                onLoad={refreshDesktopPositions}
              />
              {desktopPositions.map((position) => {
                const annotationNumber = annotations.findIndex((annotation) => annotation.id === position.id) + 1;
                return <span key={position.id} className="review-desktop-pin" style={{ left: position.left, top: position.top }} aria-label={`Comentario de escritorio ${annotationNumber}`}>{annotationNumber}</span>;
              })}
              {desktopAnnotating && (
                <button
                  type="button"
                  className="review-desktop-capture"
                  aria-label="Toca un punto de la vista de escritorio para agregar un comentario"
                  onClick={(event) => addDesktopComment(event.clientX, event.clientY)}
                />
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
