"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { InsightAnnotation, InsightReview, ScoreKey } from "./types";
import styles from "./insights.module.css";

type Surface = InsightAnnotation["surface"];
type CaptureMode = "live" | "desktop-preview";
type OverlayDock = "top" | "middle" | "bottom";

type AnnotationItem = {
  review: InsightReview;
  annotation: InsightAnnotation;
  number: number;
  numberInReview: number;
};

type MarkerPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const INITIAL_RESPONSE_COUNT = 25;
const RESPONSE_PAGE_SIZE = 25;

const categoryLabels: Record<string, string> = {
  copy: "Copy or details",
  readability: "Text size",
  language: "Language",
  image: "Photo or video",
  navigation: "Navigation",
  mobile: "Mobile or desktop",
  other: "Other",
};

const toneLabels: Record<string, string> = {
  correction: "Correction",
  concern: "Concern",
  idea: "Idea",
  positive: "Works well",
};

const scoreLabels: Record<ScoreKey, string> = {
  overall: "Overall",
  readability: "Reading",
  navigation: "Visit info",
  welcome: "Welcome",
};

const languageLabels: Record<string, string> = {
  english: "English first",
  spanish: "Spanish first",
  unsure: "Not sure",
};

function parseDatabaseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return new Date(value);
  }
  return new Date(Number.NaN);
}

function formatDate(value: string, detailed = false) {
  const date = parseDatabaseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(detailed ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function capturedViewport(viewport: string, surface: Surface) {
  const match = /^(?:mobile|desktop):(\d{3,4})x(\d{3,5})(?::(live|desktop-preview))?$/.exec(viewport);
  const fallback = surface === "desktop"
    ? { width: 1280, height: 856, mode: "desktop-preview" as const }
    : { width: 430, height: 744, mode: "live" as const };
  if (!match) return fallback;
  const rawWidth = Number(match[1]);
  const rawHeight = Number(match[2]);
  const mode: CaptureMode = match[3] === "live" || match[3] === "desktop-preview"
    ? match[3]
    : surface === "desktop" && rawHeight > 2400 ? "desktop-preview" : "live";
  return {
    width: mode === "desktop-preview"
      ? Math.min(1920, Math.max(1024, rawWidth))
      : Math.min(3840, Math.max(240, rawWidth)),
    height: mode === "desktop-preview"
      ? rawHeight >= 600 && rawHeight <= 1200 ? rawHeight : 856
      : Math.min(4000, Math.max(240, rawHeight)),
    mode,
  };
}

function rectanglesOverlap(first: DOMRect, second: DOMRect, padding = 0) {
  return first.right > second.left - padding && first.left < second.right + padding &&
    first.bottom > second.top - padding && first.top < second.bottom + padding;
}

function reviewerLabel(review: InsightReview) {
  return review.reviewer.name || review.reviewer.role || `Submission ${review.id.slice(0, 8)}`;
}

export function WebsiteResponseView({
  reviews,
  ownerName,
  signOutPath,
  onExit,
  onRefresh,
}: {
  reviews: InsightReview[];
  ownerName: string;
  signOutPath: string;
  onExit: () => void;
  onRefresh: () => void;
}) {
  const allItems = useMemo<AnnotationItem[]>(() => reviews.flatMap((review) =>
    review.annotations.map((annotation, index) => ({
      review,
      annotation,
      number: 0,
      numberInReview: index + 1,
    })),
  ).map((item, index) => ({ ...item, number: index + 1 })), [reviews]);
  const itemById = useMemo(() => new Map(allItems.map((item) => [item.annotation.id, item])), [allItems]);
  const firstItem = allItems[0] ?? null;
  const initialSurface = firstItem?.annotation.surface ?? "desktop";
  const initialCapture = firstItem
    ? capturedViewport(firstItem.annotation.viewport, firstItem.annotation.surface)
    : { width: 1280, height: 856, mode: "desktop-preview" as const };

  const [surface, setSurface] = useState<Surface>(initialSurface);
  const [frameViewport, setFrameViewport] = useState(() => ({ width: initialCapture.width, height: initialCapture.height }));
  const [frameMode, setFrameMode] = useState<CaptureMode>(initialCapture.mode);
  const [frameScale, setFrameScale] = useState(1);
  const [frameVersion, setFrameVersion] = useState(0);
  const [loadedFrameKey, setLoadedFrameKey] = useState("");
  const [responseLimit, setResponseLimit] = useState(INITIAL_RESPONSE_COUNT);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, MarkerPosition>>({});
  const [popoverPosition, setPopoverPosition] = useState({ left: 12, top: 12, maxHeight: 320, ready: false });
  const [viewBarDock, setViewBarDock] = useState<"top" | "bottom">("top");
  const [panelTabDock, setPanelTabDock] = useState<OverlayDock>("middle");

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const viewBarRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLElement | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement | null>(null);
  const detailTriggerIdRef = useRef<string | null>(null);
  const panelCloseRef = useRef<HTMLButtonElement | null>(null);
  const panelTabRef = useRef<HTMLButtonElement | null>(null);
  const panelFocusIntentRef = useRef<"panel" | "tab" | null>(null);
  const markerRefs = useRef(new Map<string, HTMLButtonElement>());

  const visibleReviews = useMemo(() => reviews.slice(0, responseLimit), [responseLimit, reviews]);
  const visibleReviewIds = useMemo(() => new Set(visibleReviews.map((review) => review.id)), [visibleReviews]);
  const surfaceItems = useMemo(
    () => allItems.filter((item) => visibleReviewIds.has(item.review.id) && item.annotation.surface === surface),
    [allItems, surface, visibleReviewIds],
  );
  const detailItem = detailId ? itemById.get(detailId) ?? null : null;
  const frameKey = `${surface}-${frameMode}-${frameViewport.width}x${frameViewport.height}`;
  const frameSrc = surface === "desktop" && frameMode === "desktop-preview"
    ? "/?embed=desktop"
    : "/?embed=website-response";

  const closeDetail = useCallback(() => {
    const triggerId = detailTriggerIdRef.current ?? detailId;
    setDetailId(null);
    window.requestAnimationFrame(() => {
      if (triggerId) markerRefs.current.get(triggerId)?.focus({ preventScroll: true });
    });
  }, [detailId]);

  const collapsePanel = useCallback(() => {
    panelFocusIntentRef.current = "tab";
    const selectedMarker = selectedId ? markerRefs.current.get(selectedId) : null;
    let nextDock: OverlayDock = "middle";
    if (selectedMarker) {
      const markerRect = selectedMarker.getBoundingClientRect();
      nextDock = markerRect.top + markerRect.height / 2 < window.innerHeight / 2 ? "bottom" : "top";
    }
    setPanelTabDock(nextDock);
    setPanelOpen(false);
  }, [selectedId]);

  const openPanel = useCallback(() => {
    panelFocusIntentRef.current = "panel";
    setPanelOpen(true);
  }, []);

  useEffect(() => {
    const updateScale = () => {
      const outerPadding = surface === "desktop" ? 24 : 32;
      const widthScale = (window.innerWidth - outerPadding) / frameViewport.width;
      const heightScale = (window.innerHeight - outerPadding) / frameViewport.height;
      setFrameScale(Math.max(0.1, Math.min(1, widthScale, heightScale)));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [frameViewport, surface]);

  const refreshPositions = useCallback(() => {
    const frameWindow = frameRef.current?.contentWindow;
    const frameDocument = frameRef.current?.contentDocument;
    if (!frameWindow || !frameDocument) return;

    const next: Record<string, MarkerPosition> = {};
    for (const item of surfaceItems) {
      const section = frameDocument.querySelector<HTMLElement>(`[data-review-section='${item.annotation.sectionId}']`);
      if (!section) continue;
      const rect = section.getBoundingClientRect();
      const left = rect.left + item.annotation.x * rect.width;
      const top = rect.top + item.annotation.y * rect.height;
      next[item.annotation.id] = {
        left: left * frameScale,
        top: top * frameScale,
        width: Math.max(1, item.annotation.width * rect.width * frameScale),
        height: Math.max(1, item.annotation.height * rect.height * frameScale),
      };
    }
    setPositions(next);
  }, [frameScale, surfaceItems]);

  useEffect(() => {
    const frameWindow = frameRef.current?.contentWindow;
    const frameDocument = frameRef.current?.contentDocument;
    if (!frameWindow || !frameDocument) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        refreshPositions();
      });
    };
    const observer = new MutationObserver((mutations) => {
      schedule();
      if (mutations.some((mutation) => mutation.target === frameDocument.documentElement && mutation.attributeName === "class")) {
        setFrameVersion((current) => current + 1);
      }
    });
    observer.observe(frameDocument.documentElement, { attributeFilter: ["class"], attributes: true });
    observer.observe(frameDocument.body, { childList: true, characterData: true, subtree: true });
    const media = Array.from(frameDocument.querySelectorAll("img, video"));
    media.forEach((element) => element.addEventListener("load", schedule));
    frameWindow.addEventListener("scroll", schedule, { passive: true });
    frameWindow.addEventListener("resize", schedule);
    frameDocument.fonts?.ready.then(schedule).catch(() => undefined);
    schedule();
    return () => {
      observer.disconnect();
      media.forEach((element) => element.removeEventListener("load", schedule));
      frameWindow.removeEventListener("scroll", schedule);
      frameWindow.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [frameVersion, refreshPositions]);

  useEffect(() => {
    if (!pendingTargetId) return;
    if (loadedFrameKey !== frameKey) return;
    const item = itemById.get(pendingTargetId);
    const frameWindow = frameRef.current?.contentWindow;
    const frameDocument = frameRef.current?.contentDocument;
    if (!item || !frameWindow || !frameDocument) return;
    if (frameMode === "desktop-preview" && !frameDocument.documentElement.classList.contains("review-embed-mode")) return;
    const section = frameDocument.querySelector<HTMLElement>(`[data-review-section='${item.annotation.sectionId}']`);
    if (!section) return;
    const sectionRect = section.getBoundingClientRect();
    const targetY = frameWindow.scrollY + sectionRect.top + item.annotation.y * sectionRect.height - frameWindow.innerHeight / 2;
    frameWindow.scrollTo({ top: Math.max(0, targetY), behavior: "instant" });

    let positionFrame = 0;
    let attempts = 0;
    const updateTargetPosition = () => {
      refreshPositions();
      positionFrame = window.requestAnimationFrame(revealTarget);
    };
    const revealTarget = () => {
      const marker = markerRefs.current.get(pendingTargetId);
      if (!marker && attempts < 20) {
        attempts += 1;
        positionFrame = window.requestAnimationFrame(updateTargetPosition);
        return;
      }
      if (!marker) {
        setPendingTargetId(null);
        return;
      }
      marker.focus({ preventScroll: true });
      const panelRect = panelRef.current?.getBoundingClientRect();
      const viewBarRect = viewBarRef.current?.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      if (viewBarRect && rectanglesOverlap(markerRect, viewBarRect, 8)) {
        setViewBarDock("bottom");
      }
      if (panelOpen && panelRect && rectanglesOverlap(markerRect, panelRect, 12)) {
        setPanelTabDock(markerRect.top + markerRect.height / 2 < window.innerHeight / 2 ? "bottom" : "top");
        setPanelOpen(false);
      }
      setPendingTargetId(null);
    };
    positionFrame = window.requestAnimationFrame(updateTargetPosition);
    return () => {
      window.cancelAnimationFrame(positionFrame);
    };
  }, [frameKey, frameMode, frameVersion, itemById, loadedFrameKey, panelOpen, pendingTargetId, refreshPositions]);

  useEffect(() => {
    if (!detailId) return;
    const frame = window.requestAnimationFrame(() => detailCloseRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [detailId]);

  useEffect(() => {
    const intent = panelFocusIntentRef.current;
    if (!intent) return;
    panelFocusIntentRef.current = null;
    const focusTarget = (retryOnly = false) => {
      const target = intent === "tab" ? panelTabRef.current : panelCloseRef.current;
      if (!target) return;
      if (retryOnly) {
        const active = document.activeElement;
        const focusWasLost = active === document.body || active === null ||
          (active instanceof HTMLElement && Boolean(active.closest("[inert]")));
        if (!focusWasLost) return;
      }
      target.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(() => focusTarget());
    const retry = window.setTimeout(() => focusTarget(true), 280);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retry);
    };
  }, [panelOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (detailId) {
        closeDetail();
      } else if (panelOpen) {
        collapsePanel();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeDetail, collapsePanel, detailId, panelOpen]);

  const updatePopoverPosition = useCallback(() => {
    if (!detailId) return;
    const marker = markerRefs.current.get(detailId);
    const popover = popoverRef.current;
    if (!marker || !popover) return;
    const markerRect = marker.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const gap = 14;
    const padding = 12;
    const fitsRight = markerRect.right + gap + popoverRect.width <= window.innerWidth - padding;
    const fitsLeft = markerRect.left - gap - popoverRect.width >= padding;
    let left = fitsRight ? markerRect.right + gap : markerRect.left - popoverRect.width - gap;
    let top = Math.min(
      window.innerHeight - popoverRect.height - padding,
      Math.max(padding, markerRect.top - Math.min(32, popoverRect.height / 4)),
    );
    let maxHeight = window.innerHeight - padding * 2;

    if (!fitsRight && !fitsLeft) {
      left = markerRect.left + markerRect.width / 2 - popoverRect.width / 2;
      const roomAbove = markerRect.top - gap - padding;
      const roomBelow = window.innerHeight - markerRect.bottom - gap - padding;
      if (roomBelow >= roomAbove) {
        top = markerRect.bottom + gap;
        maxHeight = Math.max(96, roomBelow);
      } else {
        maxHeight = Math.max(96, roomAbove);
        top = Math.max(padding, markerRect.top - gap - Math.min(popoverRect.height, maxHeight));
      }
    }

    left = Math.min(window.innerWidth - popoverRect.width - padding, Math.max(padding, left));
    setPopoverPosition({ left, top, maxHeight, ready: true });
  }, [detailId]);

  useEffect(() => {
    if (!detailId) return;
    const frame = window.requestAnimationFrame(updatePopoverPosition);
    const viewport = viewportRef.current;
    const frameWindow = frameRef.current?.contentWindow;
    viewport?.addEventListener("scroll", updatePopoverPosition, { passive: true });
    frameWindow?.addEventListener("scroll", updatePopoverPosition, { passive: true });
    window.addEventListener("resize", updatePopoverPosition);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("scroll", updatePopoverPosition);
      frameWindow?.removeEventListener("scroll", updatePopoverPosition);
      window.removeEventListener("resize", updatePopoverPosition);
    };
  }, [detailId, panelOpen, positions, updatePopoverPosition]);

  const navigateToItem = (item: AnnotationItem) => {
    const nextSurface = item.annotation.surface;
    const capture = capturedViewport(item.annotation.viewport, nextSurface);
    setSurface(nextSurface);
    setFrameViewport({ width: capture.width, height: capture.height });
    setFrameMode(capture.mode);
    setViewBarDock("top");
    setSelectedId(item.annotation.id);
    if (detailId) closeDetail();
    setPendingTargetId(item.annotation.id);
  };

  const chooseSurface = (nextSurface: Surface) => {
    const firstForSurface = allItems.find((item) => item.annotation.surface === nextSurface);
    const capture = firstForSurface
      ? capturedViewport(firstForSurface.annotation.viewport, nextSurface)
      : nextSurface === "desktop"
        ? { width: 1280, height: 856, mode: "desktop-preview" as const }
        : { width: 430, height: 744, mode: "live" as const };
    setSurface(nextSurface);
    setFrameViewport({ width: capture.width, height: capture.height });
    setFrameMode(capture.mode);
    setViewBarDock("top");
    setSelectedId(null);
    if (detailId) closeDetail();
    setPendingTargetId(null);
  };

  return (
    <main className={styles.websiteResponse} lang="en">
      <div
        ref={viewBarRef}
        className={`${styles.websiteViewBar} ${viewBarDock === "bottom" ? styles.websiteViewBarBottom : ""}`}
      >
        <button type="button" onClick={onExit}>← Dashboard</button>
        <div><span>Private owner view</span><strong>Website Response</strong></div>
        <span className={styles.websiteSurfaceLabel}>{surface === "desktop" ? "Desktop" : "Mobile"} · {frameViewport.width}px</span>
      </div>

      <div ref={viewportRef} className={styles.websiteViewport} aria-label="Reviewed website with response annotations">
        <div
          className={`${styles.websiteCanvas} ${surface === "mobile" ? styles.mobileCanvas : ""}`}
          style={{ width: frameViewport.width * frameScale, height: frameViewport.height * frameScale }}
        >
          <iframe
            key={frameKey}
            ref={frameRef}
            title={`Casa del Patio reviewed website in ${surface} layout`}
            src={frameSrc}
            style={{ width: frameViewport.width, height: frameViewport.height, transform: `scale(${frameScale})` }}
            onLoad={() => {
              setLoadedFrameKey(frameKey);
              setFrameVersion((current) => current + 1);
            }}
          />
          <div className={styles.websiteMarkerLayer} aria-label={`${surfaceItems.length} visible ${surface} annotations`}>
            {surfaceItems.map((item) => {
              const position = positions[item.annotation.id];
              if (!position) return null;
              const markerStyle: CSSProperties = item.annotation.kind === "highlight"
                ? { left: position.left, top: position.top, width: position.width, height: position.height }
                : { left: position.left, top: position.top };
              return (
                <button
                  key={item.annotation.id}
                  ref={(node) => {
                    if (node) markerRefs.current.set(item.annotation.id, node);
                    else markerRefs.current.delete(item.annotation.id);
                  }}
                  id={`website-marker-${item.annotation.id}`}
                  type="button"
                  className={`${item.annotation.kind === "highlight" ? styles.websiteHighlight : styles.websitePin} ${selectedId === item.annotation.id ? styles.selectedMarker : ""}`}
                  style={markerStyle}
                  aria-label={`Open response ${item.number}: ${item.annotation.sectionLabel}`}
                  aria-pressed={detailId === item.annotation.id}
                  aria-expanded={detailId === item.annotation.id}
                  aria-controls={detailId === item.annotation.id ? "website-detail-card" : undefined}
                  onClick={() => {
                    setSelectedId(item.annotation.id);
                    detailTriggerIdRef.current = item.annotation.id;
                    setPopoverPosition((current) => ({ ...current, ready: false }));
                    setDetailId(item.annotation.id);
                  }}
                >
                  <span>{item.number}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {detailItem && (
        <article
          ref={popoverRef}
          id="website-detail-card"
          className={styles.websiteDetailCard}
          style={{ left: popoverPosition.left, top: popoverPosition.top, maxHeight: popoverPosition.maxHeight, opacity: popoverPosition.ready ? 1 : 0 }}
          role="dialog"
          aria-modal="false"
          aria-labelledby="website-detail-title"
        >
          <header>
            <div><span>Response {detailItem.number}</span><h2 id="website-detail-title">{detailItem.annotation.sectionLabel}</h2></div>
            <button ref={detailCloseRef} type="button" aria-label="Close response details" onClick={closeDetail}>×</button>
          </header>
          <div className={styles.websiteDetailMeta}>
            <span>{detailItem.annotation.surface === "desktop" ? "Desktop" : "Mobile"}</span>
            <span>{detailItem.annotation.kind === "pin" ? "Pin" : "Highlight"}</span>
            <span>{categoryLabels[detailItem.annotation.category] ?? detailItem.annotation.category}</span>
            <span>{toneLabels[detailItem.annotation.tone] ?? detailItem.annotation.tone}</span>
          </div>
          <section className={styles.websiteResponseCopy}>
            <span>Stakeholder comment</span>
            <p>{detailItem.annotation.comment}</p>
            {detailItem.annotation.suggestion && <blockquote><b>Suggested change</b>{detailItem.annotation.suggestion}</blockquote>}
          </section>
          <section className={styles.websiteQuestionnaire}>
            <h3>Questionnaire details</h3>
            <div className={styles.websiteScoreGrid}>
              {(Object.keys(scoreLabels) as ScoreKey[]).map((key) => (
                <span key={key}><small>{scoreLabels[key]}</small><strong>{detailItem.review.scores[key]}<i>/5</i></strong></span>
              ))}
            </div>
            <dl>
              <div><dt>Language preference</dt><dd>{(languageLabels[detailItem.review.languageDefault] ?? detailItem.review.languageDefault) || "Not provided"}</dd></div>
              <div><dt>Top priority</dt><dd>{detailItem.review.topPriority || "Not provided"}</dd></div>
              <div><dt>Final comment</dt><dd>{detailItem.review.anythingElse || "Not provided"}</dd></div>
              {(detailItem.review.reviewer.name || detailItem.review.reviewer.email || detailItem.review.reviewer.role || detailItem.review.reviewer.visitFrequency) && (
                <div><dt>Reviewer</dt><dd>{[detailItem.review.reviewer.name, detailItem.review.reviewer.role, detailItem.review.reviewer.visitFrequency, detailItem.review.reviewer.email].filter(Boolean).join(" · ")}</dd></div>
              )}
            </dl>
          </section>
          <footer>{formatDate(detailItem.review.createdAt, true)} · Submission {detailItem.review.id.slice(0, 8)}</footer>
        </article>
      )}

      <aside ref={panelRef} className={`${styles.websiteResponsePanel} ${panelOpen ? styles.websitePanelOpen : styles.websitePanelClosed}`} aria-hidden={!panelOpen} inert={panelOpen ? undefined : true}>
        <header>
          <div><span>Casa del Patio</span><h2>Website Response</h2><p>{reviews.length} {reviews.length === 1 ? "submission" : "submissions"} · {allItems.length} pinned or highlighted</p></div>
          <button ref={panelCloseRef} type="button" aria-label="Collapse response panel" onClick={collapsePanel}>×</button>
        </header>
        <div className={styles.websitePanelTools}>
          <div role="group" aria-label="Website review surface">
            {(["mobile", "desktop"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={surface === item} className={surface === item ? styles.activeWebsiteSurface : ""} onClick={() => chooseSurface(item)}>{item === "mobile" ? "Mobile" : "Desktop"}</button>
            ))}
          </div>
          <button type="button" onClick={onRefresh}>Refresh</button>
        </div>
        <div className={styles.websiteResponseList}>
          {visibleReviews.length === 0 ? (
            <div className={styles.websiteEmptyResponses}><strong>No responses yet</strong><span>New submissions will appear here after refresh.</span></div>
          ) : visibleReviews.map((review, reviewIndex) => (
            <section key={review.id} className={styles.websiteResponseGroup}>
              <header><span>{String(reviews.length - reviewIndex).padStart(2, "0")}</span><div><strong>{reviewerLabel(review)}</strong><small>{formatDate(review.createdAt)} · {review.annotations.length} {review.annotations.length === 1 ? "annotation" : "annotations"}</small></div></header>
              {review.annotations.length === 0 ? (
                <p>No pinned or highlighted location for this submission.</p>
              ) : (
                <div>
                  {review.annotations.map((annotation) => {
                    const item = itemById.get(annotation.id);
                    if (!item) return null;
                    return (
                      <button
                        key={annotation.id}
                        type="button"
                        aria-current={selectedId === annotation.id ? "true" : undefined}
                        aria-controls={`website-marker-${annotation.id}`}
                        className={selectedId === annotation.id ? styles.selectedWebsiteResponse : ""}
                        onClick={() => navigateToItem(item)}
                      >
                        <span>{item.number}</span>
                        <div><strong>{annotation.sectionLabel}</strong><small>{annotation.surface === "desktop" ? "Desktop" : "Mobile"} · {annotation.kind === "pin" ? "Pin" : "Highlight"} · {categoryLabels[annotation.category] ?? annotation.category}</small><p>{annotation.comment}</p></div>
                        <b>→</b>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
          {responseLimit < reviews.length && (
            <button className={styles.websiteLoadMore} type="button" onClick={() => setResponseLimit((current) => Math.min(reviews.length, current + RESPONSE_PAGE_SIZE))}>
              Load more responses · {reviews.length - responseLimit} remaining
            </button>
          )}
        </div>
        <footer><span>Signed in as <strong>{ownerName}</strong></span><a href={signOutPath}>Sign out</a></footer>
      </aside>

      {!panelOpen && (
        <button
          ref={panelTabRef}
          className={`${styles.websitePanelTab} ${panelTabDock === "top" ? styles.websitePanelTabTop : panelTabDock === "bottom" ? styles.websitePanelTabBottom : ""}`}
          type="button"
          aria-label="Open response panel"
          onClick={openPanel}
        >
          <span>{reviews.length}</span> Responses
        </button>
      )}
    </main>
  );
}
