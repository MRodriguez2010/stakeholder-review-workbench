"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BreakdownItem, InsightReview, InsightsData, ScoreKey } from "./types";
import { makeCsv } from "./csv";
import { WebsiteResponseView } from "./website-response-view";
import styles from "./insights.module.css";

const scoreLabels: Record<ScoreKey, string> = {
  overall: "Overall impression",
  readability: "Reading comfort",
  navigation: "Visit information",
  welcome: "Welcoming and trust",
};

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

function scoreText(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

function geometryText(note: InsightReview["annotations"][number]) {
  const point = `x ${note.x.toFixed(3)} · y ${note.y.toFixed(3)}`;
  return note.kind === "highlight"
    ? `${point} · w ${note.width.toFixed(3)} · h ${note.height.toFixed(3)}`
    : point;
}

function Distribution({ title, items, empty }: { title: string; items: BreakdownItem[]; empty: string }) {
  const largest = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}><h2>{title}</h2><span>{items.reduce((sum, item) => sum + item.count, 0)} total</span></div>
      {items.length === 0 ? <p className={styles.emptyInline}>{empty}</p> : (
        <div className={styles.distribution}>
          {items.slice(0, 7).map((item) => (
            <div key={`${title}-${item.key}`} className={styles.distributionRow}>
              <div><span>{item.label}</span><strong>{item.count}</strong></div>
              <div className={styles.track}><span style={{ width: `${Math.max(5, item.count / largest * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ScoreStrip({ review }: { review: InsightReview }) {
  return (
    <div className={styles.scoreStrip}>
      {(Object.keys(scoreLabels) as ScoreKey[]).map((key) => (
        <span key={key} title={scoreLabels[key]} aria-label={`${scoreLabels[key]}: ${review.scores[key]} out of 5`}><b>{review.scores[key]}</b>/5</span>
      ))}
    </div>
  );
}

export function InsightsDashboard({ data, ownerName, signOutPath }: { data: InsightsData; ownerName: string; signOutPath: string }) {
  const router = useRouter();
  const [view, setView] = useState<"overview" | "website-response">("overview");
  const [selectedId, setSelectedId] = useState(data.reviews[0]?.id ?? "");
  const [surfaceFilter, setSurfaceFilter] = useState<"all" | "mobile" | "desktop">("all");
  const selected = useMemo(
    () => data.reviews.find((review) => review.id === selectedId) ?? data.reviews[0] ?? null,
    [data.reviews, selectedId],
  );
  const visibleNotes = selected?.annotations.filter((annotation) => surfaceFilter === "all" || annotation.surface === surfaceFilter) ?? [];

  if (view === "website-response") {
    return (
      <WebsiteResponseView
        reviews={data.websiteReviews}
        ownerName={ownerName}
        signOutPath={signOutPath}
        onExit={() => setView("overview")}
        onRefresh={() => router.refresh()}
      />
    );
  }

  const exportCsv = () => {
    const blob = new Blob([makeCsv(data.reviews)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `patio-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className={styles.shell} lang="en">
      <aside className={styles.sidebar}>
        <div className={styles.brandMark}>TDC</div>
        <div>
          <p className={styles.eyebrow}>Private workspace</p>
          <h1>Review<br />Insights</h1>
          <p className={styles.sidebarCopy}>Stakeholder corrections, critiques, and ratings in one owner-only view.</p>
        </div>
        <nav aria-label="Dashboard links">
          <a href="#overview" className={styles.activeLink}>Overview</a>
          <button type="button" onClick={() => setView("website-response")}>Website Response</button>
          <a href="#responses">Responses</a>
          <a href="/" target="_blank" rel="noreferrer">Open questionnaire ↗</a>
        </nav>
        <div className={styles.ownerCard}>
          <span>Signed in as</span>
          <strong>{ownerName}</strong>
          <a href={signOutPath}>Sign out</a>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>Casa del Patio · Website review</p>
            <h2>Stakeholder intake</h2>
            <p>Refresh this private view to load newly submitted responses.</p>
          </div>
          <div className={styles.topbarActions}>
            <span className={styles.privateBadge}><i /> Owner only</span>
            <button type="button" onClick={() => setView("website-response")}>Website Response</button>
            <button type="button" onClick={() => router.refresh()}>Refresh</button>
            <button type="button" onClick={exportCsv} disabled={data.reviews.length === 0} title="Exports the responses currently shown, up to the latest 100.">Export shown CSV</button>
          </div>
        </header>

        <div className={styles.content}>
          <section id="overview" className={styles.kpiGrid} aria-label="Response summary">
            <article className={styles.primaryKpi}><span>Total responses</span><strong>{data.summary.totalReviews}</strong><small>{data.summary.totalNotes} placed notes</small></article>
            {(Object.keys(scoreLabels) as ScoreKey[]).map((key) => (
              <article key={key}>
                <span>{scoreLabels[key]}</span>
                <strong>{scoreText(data.summary.averages[key])}<small>/5</small></strong>
                <div className={styles.miniTrack}><i style={{ width: `${(data.summary.averages[key] ?? 0) * 20}%` }} /></div>
              </article>
            ))}
          </section>

          <div className={styles.chartGrid}>
            <Distribution title="Notes by topic" items={data.breakdowns.categories} empty="No placed notes yet." />
            <Distribution title="Notes by page section" items={data.breakdowns.sections} empty="Section totals will appear after the first placed note." />
            <Distribution title="Review surface" items={data.breakdowns.surfaces} empty="Mobile and desktop totals will appear here." />
          </div>

          <section id="responses" className={styles.responsesPanel}>
            <div className={styles.responsesHeading}>
              <div><p className={styles.eyebrow}>Response inbox</p><h2>Individual submissions</h2></div>
              <span>Showing the latest {Math.min(100, data.reviews.length)}</span>
            </div>

            {data.reviews.length === 0 ? (
              <div className={styles.emptyState}>
                <span>0</span>
                <h3>No feedback has arrived yet.</h3>
                <p>Use the public questionnaire for a test submission. It will appear here automatically.</p>
                <a href="/" target="_blank" rel="noreferrer">Open test questionnaire ↗</a>
              </div>
            ) : (
              <div className={styles.responseLayout}>
                <div className={styles.responseList} aria-label="Submitted reviews">
                  {data.reviews.map((review, index) => (
                    <button key={review.id} type="button" aria-pressed={review.id === selected?.id} className={review.id === selected?.id ? styles.selectedResponse : ""} onClick={() => { setSelectedId(review.id); setSurfaceFilter("all"); }}>
                      <span className={styles.responseNumber}>{String(data.reviews.length - index).padStart(2, "0")}</span>
                      <span className={styles.responseSummary}>
                        <strong>{formatDate(review.createdAt)}</strong>
                        <small>{review.annotations.length} {review.annotations.length === 1 ? "note" : "notes"}{review.anythingElse ? " · final comment" : ""}</small>
                        <ScoreStrip review={review} />
                      </span>
                      <b>→</b>
                    </button>
                  ))}
                </div>

                {selected && (
                  <article className={styles.detailPanel}>
                    <header>
                      <div><p className={styles.eyebrow}>Submission {selected.id.slice(0, 8)}</p><h3>{formatDate(selected.createdAt, true)}</h3></div>
                      <ScoreStrip review={selected} />
                    </header>

                    <section className={styles.finalComment}>
                      <span>Anything else?</span>
                      <p>{selected.anythingElse || "No final comment was provided."}</p>
                    </section>

                    <div className={styles.notesHeader}>
                      <h4>Placed notes <span>{selected.annotations.length}</span></h4>
                      <div className={styles.filters} role="group" aria-label="Filter notes by review surface">
                        {(["all", "mobile", "desktop"] as const).map((filter) => (
                          <button key={filter} type="button" aria-pressed={surfaceFilter === filter} className={surfaceFilter === filter ? styles.activeFilter : ""} onClick={() => setSurfaceFilter(filter)}>{filter === "all" ? "All" : filter === "mobile" ? "Mobile" : "Desktop"}</button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.noteStack}>
                      {visibleNotes.length === 0 ? <p className={styles.emptyInline}>No notes match this view.</p> : visibleNotes.map((note) => {
                        const noteNumber = selected.annotations.findIndex((annotation) => annotation.id === note.id) + 1;
                        return <article key={note.id} className={styles.noteCard}>
                          <div className={styles.noteMeta}>
                            <span>{noteNumber}</span>
                            <div><strong>{note.sectionLabel}</strong><small>{note.surface === "desktop" ? "Desktop" : "Mobile"} · {categoryLabels[note.category] ?? note.category} · {toneLabels[note.tone] ?? note.tone}</small></div>
                          </div>
                          <p>{note.comment}</p>
                          {note.suggestion && <blockquote><span>Suggested change</span>{note.suggestion}</blockquote>}
                          <code>{note.viewport || "Viewport unavailable"} · {geometryText(note)}</code>
                        </article>;
                      })}
                    </div>
                  </article>
                )}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
