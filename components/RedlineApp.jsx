"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";

/* ---------------------------------------------------------
   COMMENT TYPES
--------------------------------------------------------- */
const COMMENT_TYPES = ["Clarity", "Repetition", "Pacing", "Style", "Continuity", "Character", "Worldbuilding", "Other"];
const PRIORITIES = ["Low", "Medium", "High"];
const MOBILE_BREAKPOINT = 768;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

/* ---------------------------------------------------------
   MAIN APP
--------------------------------------------------------- */
export default function RedlineApp() {
  const isMobile = useIsMobile();
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [manuscript, setManuscript] = useState(null); // null until loaded
  const [chapterList, setChapterList] = useState([]);
  const [activeChapter, setActiveChapter] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isLoadingDefault, setIsLoadingDefault] = useState(true);
  const fileInputRef = useRef(null);

  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [readerName, setReaderName] = useState("");
  const [selectedPassage, setSelectedPassage] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [draftType, setDraftType] = useState("Clarity");
  const [draftPriority, setDraftPriority] = useState("Medium");

  // Load shared comments on mount, then poll every 15s so readers see
  // comments other people add without needing to refresh manually.
  const loadComments = useCallback(() => {
    return fetch("/api/comments")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setCommentsError(data.error);
          return;
        }
        setCommentsError(null);
        setComments(data.comments || []);
      })
      .catch((err) => setCommentsError(String(err)))
      .finally(() => setCommentsLoading(false));
  }, []);

  useEffect(() => {
    loadComments();
    const interval = setInterval(loadComments, 15000);
    return () => clearInterval(interval);
  }, [loadComments]);

  // Auto-load the bundled manuscript on first mount, so the app opens
  // straight into the draft instead of requiring an upload every session.
  // The upload button below remains available to swap in a different draft.
  useEffect(() => {
    let cancelled = false;
    fetch("/data/manuscript.json")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.passages || !data.chapters) throw new Error("missing passages/chapters keys");
        setManuscript(data.passages);
        setChapterList(data.chapters);
        setActiveChapter(data.chapters[0]);
      })
      .catch((err) => {
        if (cancelled) return;
        // Not a hard failure -- just falls back to the upload screen.
        console.warn("Could not auto-load bundled manuscript:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDefault(false);
      });
    return () => { cancelled = true; };
  }, []);

  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#15171C" : "#FAFAF8",
    panel: isDark ? "#1C1F26" : "#FFFFFF",
    panelAlt: isDark ? "#1A1C22" : "#F4F2EC",
    border: isDark ? "#2C313C" : "#E5E2D9",
    text: isDark ? "#E8E6DF" : "#23241F",
    textMuted: isDark ? "#8C92A0" : "#6B6A62",
    accent: "#B23A2E",
    accentSoft: isDark ? "#3A211D" : "#FBEEEC",
  };
  const serif = "'Source Serif 4', Georgia, serif";
  const sans = "'Inter', -apple-system, sans-serif";

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.passages || !data.chapters) throw new Error("missing passages/chapters keys");
        setManuscript(data.passages);
        setChapterList(data.chapters);
        setActiveChapter(data.chapters[0]);
        // Loading a different draft invalidates any existing comments,
        // since they reference passage ids from the previous manuscript.
        setComments([]);
        setSelectedPassage(null);
      } catch (err) {
        setLoadError("Could not parse this file as manuscript data. Expected JSON with chapters and passages arrays.");
      }
    };
    reader.readAsText(file);
  }

  async function addComment() {
    if (!selectedPassage || !draftText.trim()) return;
    const passage = manuscript.find((p) => p.id === selectedPassage);
    const payload = {
      passageId: selectedPassage,
      chapter: passage?.chapter,
      text: draftText.trim(),
      type: draftType,
      priority: draftPriority,
      author: readerName.trim() || "Reader",
    };
    setIsSaving(true);
    setCommentsError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        setCommentsError(data.error);
        return;
      }
      setComments((c) => [...c, data.comment]);
      setDraftText("");
      setSelectedPassage(null);
    } catch (err) {
      setCommentsError(String(err));
    } finally {
      setIsSaving(false);
    }
  }

  function exportCsv() {
    const headers = ["id", "chapter", "type", "priority", "author", "createdAt", "passageId", "text"];
    const escape = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const rows = comments.map((c) => headers.map((h) => escape(c[h])).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `redline-comments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const passageComments = useCallback(
    (passageId) => comments.filter((c) => c.passageId === passageId),
    [comments]
  );

  const visiblePassages = useMemo(() => {
    if (!manuscript || !activeChapter) return [];
    return manuscript.filter((p) => p.chapter === activeChapter);
  }, [manuscript, activeChapter]);

  const chapterWordCounts = useMemo(() => {
    if (!manuscript) return {};
    const counts = {};
    manuscript.forEach((p) => {
      counts[p.chapter] = (counts[p.chapter] || 0) + p.text.split(/\s+/).length;
    });
    return counts;
  }, [manuscript]);

  /* ---------------- LOADING SCREEN (brief, while auto-load resolves) ---------------- */
  if (isLoadingDefault) {
    return (
      <div style={{ fontFamily: sans, background: colors.bg, color: colors.text, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
        <div style={{ width: 8, height: 18, background: colors.accent, borderRadius: 1, marginBottom: 16 }} />
        <div style={{ fontSize: 13, color: colors.textMuted }}>Loading manuscript...</div>
      </div>
    );
  }

  /* ---------------- UPLOAD SCREEN (fallback if auto-load found nothing, or to swap drafts) ---------------- */
  if (!manuscript) {
    return (
      <div style={{ fontFamily: sans, background: colors.bg, color: colors.text, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 24 }}>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
        <div style={{ width: 8, height: 18, background: colors.accent, borderRadius: 1, marginBottom: 16 }} />
        <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 6 }}>Redline</div>
        <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 28, textAlign: "center", maxWidth: 380 }}>
          No bundled draft found. Upload manuscript data to begin a review session. Expects JSON with <code>chapters</code> and <code>passages</code> arrays.
        </div>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFile} style={{ display: "none" }} />
        <button onClick={() => fileInputRef.current?.click()} style={{ ...btnStyle(colors), background: colors.accent, color: "#fff", borderColor: colors.accent, padding: "10px 20px", fontSize: 14 }}>
          Upload draft (.json)
        </button>
        {loadError && <div style={{ color: colors.accent, fontSize: 12, marginTop: 14, maxWidth: 360, textAlign: "center" }}>{loadError}</div>}
      </div>
    );
  }

  /* ---------------- MAIN APP ---------------- */
  return (
    <div style={{ fontFamily: sans, background: colors.bg, color: colors.text, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "12px 16px" : "14px 24px", borderBottom: `1px solid ${colors.border}`, background: colors.panel, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {isMobile && (
            <button onClick={() => setChaptersOpen(true)} aria-label="Open chapter list" style={{ ...iconBtnStyle(colors) }}>
              ☰
            </button>
          )}
          <div style={{ width: 8, height: 18, background: colors.accent, borderRadius: 1, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: 0.2, flexShrink: 0 }}>Redline</span>
          {!isMobile && (
            <span style={{ fontSize: 12, color: colors.textMuted, marginLeft: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              The American Foreign Legion — {manuscript.length} passages, {chapterList.length} chapters
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {!isMobile && (
            <>
              <button onClick={exportCsv} disabled={comments.length === 0} style={{ ...btnStyle(colors), opacity: comments.length === 0 ? 0.5 : 1 }}>
                Export comments (CSV)
              </button>
              <input
                type="text"
                value={readerName}
                onChange={(e) => setReaderName(e.target.value)}
                placeholder="Your name"
                style={{ ...selectStyle(colors), width: 120 }}
              />
              <button onClick={() => setTheme(isDark ? "light" : "dark")} style={btnStyle(colors)}>
                {isDark ? "Light mode" : "Dark mode"}
              </button>
            </>
          )}
          {isMobile && (
            <button onClick={() => setCommentsOpen(true)} aria-label="Open comments" style={{ ...iconBtnStyle(colors), position: "relative" }}>
              💬
              {comments.length > 0 && (
                <span style={{ position: "absolute", top: -2, right: -2, fontSize: 9, background: colors.accent, color: "#fff", borderRadius: 8, padding: "0 4px", lineHeight: "14px", minWidth: 14, textAlign: "center" }}>
                  {comments.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        {/* Backdrop for mobile overlays */}
        {isMobile && (chaptersOpen || commentsOpen) && (
          <div
            onClick={() => { setChaptersOpen(false); setCommentsOpen(false); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 20 }}
          />
        )}

        {/* CHAPTER NAV */}
        <div
          style={
            isMobile
              ? {
                  position: "fixed", top: 0, bottom: 0, left: 0, width: "min(280px, 80vw)",
                  background: colors.panelAlt, overflowY: "auto", padding: "16px 0", zIndex: 21,
                  transform: chaptersOpen ? "translateX(0)" : "translateX(-100%)",
                  transition: "transform 0.2s ease", boxShadow: chaptersOpen ? "2px 0 12px rgba(0,0,0,0.2)" : "none",
                }
              : { width: 200, borderRight: `1px solid ${colors.border}`, background: colors.panelAlt, overflowY: "auto", padding: "16px 0", flexShrink: 0 }
          }
        >
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px 12px" }}>
              <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500, letterSpacing: 0.4 }}>CHAPTERS</span>
              <button onClick={() => setChaptersOpen(false)} aria-label="Close" style={iconBtnStyle(colors)}>✕</button>
            </div>
          )}
          {!isMobile && (
            <div style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500, padding: "0 16px 8px", letterSpacing: 0.4 }}>CHAPTERS</div>
          )}
          {chapterList.map((ch) => {
            const isActive = ch === activeChapter;
            const cCount = comments.filter((cm) => {
              const p = manuscript.find((mp) => mp.id === cm.passageId);
              return p && p.chapter === ch;
            }).length;
            return (
              <div
                key={ch}
                onClick={() => { setActiveChapter(ch); setSelectedPassage(null); setChaptersOpen(false); }}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontSize: 13,
                  background: isActive ? colors.accentSoft : "transparent",
                  borderLeft: isActive ? `2px solid ${colors.accent}` : "2px solid transparent",
                  color: isActive ? colors.text : colors.textMuted,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{ch}</span>
                {cCount > 0 && (
                  <span style={{ fontSize: 10, background: colors.accent, color: "#fff", borderRadius: 10, padding: "1px 6px" }}>{cCount}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* MANUSCRIPT READER */}
        <div style={{ flex: "1 1 0", overflowY: "auto", padding: isMobile ? "20px 16px" : "40px 48px", minWidth: 0 }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 4 }}>
              <h2 style={{ fontFamily: serif, fontSize: isMobile ? 20 : 24, fontWeight: 600, color: colors.text, margin: 0 }}>{activeChapter}</h2>
              <span style={{ fontSize: 12, color: colors.textMuted }}>{chapterWordCounts[activeChapter] || 0} words</span>
            </div>
            {visiblePassages.map((p) => {
              const pc = passageComments(p.id);
              const isSelected = selectedPassage === p.id;
              return (
                <p
                  key={p.id}
                  onClick={() => {
                    const next = p.id === selectedPassage ? null : p.id;
                    setSelectedPassage(next);
                    if (isMobile && next) setCommentsOpen(true);
                  }}
                  style={{
                    fontFamily: serif,
                    fontSize: isMobile ? 16 : 17,
                    lineHeight: 1.75,
                    marginBottom: 14,
                    cursor: "pointer",
                    padding: "4px 8px",
                    marginLeft: -8,
                    borderRadius: 6,
                    background: isSelected ? colors.accentSoft : "transparent",
                    borderBottom: pc.length > 0 ? `1.5px dotted ${colors.accent}` : "1.5px dotted transparent",
                  }}
                >
                  {p.text}
                  {pc.length > 0 && (
                    <span style={{ fontFamily: sans, fontSize: 11, color: colors.accent, marginLeft: 8, verticalAlign: "super" }}>
                      {pc.length} comment{pc.length > 1 ? "s" : ""}
                    </span>
                  )}
                </p>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
              <ChapterNavButton
                label="Previous"
                target={chapterList[chapterList.indexOf(activeChapter) - 1]}
                onClick={(t) => { setActiveChapter(t); setSelectedPassage(null); }}
                colors={colors}
                align="left"
              />
              <ChapterNavButton
                label="Next"
                target={chapterList[chapterList.indexOf(activeChapter) + 1]}
                onClick={(t) => { setActiveChapter(t); setSelectedPassage(null); }}
                colors={colors}
                align="right"
              />
            </div>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div
          style={
            isMobile
              ? {
                  position: "fixed", top: 0, bottom: 0, right: 0, width: "min(380px, 88vw)",
                  background: colors.panel, overflowY: "auto", padding: "16px 0", zIndex: 21,
                  transform: commentsOpen ? "translateX(0)" : "translateX(100%)",
                  transition: "transform 0.2s ease", boxShadow: commentsOpen ? "-2px 0 12px rgba(0,0,0,0.2)" : "none",
                }
              : { width: 380, borderLeft: `1px solid ${colors.border}`, background: colors.panel, overflowY: "auto", padding: "20px 0", flexShrink: 0 }
          }
        >
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px 12px" }}>
              <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500, letterSpacing: 0.4 }}>COMMENTS</span>
              <button onClick={() => setCommentsOpen(false)} aria-label="Close" style={iconBtnStyle(colors)}>✕</button>
            </div>
          )}

          {isMobile && (
            <div style={{ padding: "0 16px 16px", borderBottom: `1px solid ${colors.border}`, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                value={readerName}
                onChange={(e) => setReaderName(e.target.value)}
                placeholder="Your name"
                style={{ ...selectStyle(colors), flex: "1 1 120px" }}
              />
              <button onClick={() => setTheme(isDark ? "light" : "dark")} style={{ ...btnStyle(colors), flex: "1 1 100px" }}>
                {isDark ? "Light mode" : "Dark mode"}
              </button>
              <button onClick={exportCsv} disabled={comments.length === 0} style={{ ...btnStyle(colors), flex: "1 1 100%", opacity: comments.length === 0 ? 0.5 : 1 }}>
                Export comments (CSV)
              </button>
            </div>
          )}

          {selectedPassage && (
            <div style={{ padding: isMobile ? "0 16px 20px" : "0 20px 20px", borderBottom: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>New comment on selected passage</div>
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Comment text..."
                style={{ width: "100%", minHeight: 60, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 6, padding: 8, fontFamily: sans, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <select value={draftType} onChange={(e) => setDraftType(e.target.value)} style={selectStyle(colors)}>
                  {COMMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={draftPriority} onChange={(e) => setDraftPriority(e.target.value)} style={selectStyle(colors)}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p} priority</option>)}
                </select>
              </div>
              <button onClick={addComment} disabled={isSaving} style={{ ...btnStyle(colors), marginTop: 10, width: "100%", background: colors.accent, color: "#fff", borderColor: colors.accent, opacity: isSaving ? 0.6 : 1 }}>
                {isSaving ? "Saving..." : "Add comment"}
              </button>
              {commentsError && (
                <div style={{ fontSize: 11, color: colors.accent, marginTop: 8 }}>{commentsError}</div>
              )}
            </div>
          )}

          <div style={{ padding: isMobile ? "0 16px" : "0 20px" }}>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10, fontWeight: 500 }}>
              ALL COMMENTS {!commentsLoading && `(${comments.length})`}
            </div>
            {commentsLoading && (
              <div style={{ fontSize: 12, color: colors.textMuted }}>Loading comments...</div>
            )}
            {!commentsLoading && commentsError && comments.length === 0 && (
              <div style={{ fontSize: 12, color: colors.accent }}>{commentsError}</div>
            )}
            {!commentsLoading && !commentsError && comments.length === 0 && (
              <div style={{ fontSize: 12, color: colors.textMuted }}>Tap any passage in the reader to leave the first comment.</div>
            )}
            {[...comments].reverse().map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                manuscript={manuscript}
                colors={colors}
                onJump={(passageId, chapter) => {
                  setActiveChapter(chapter);
                  setSelectedPassage(passageId);
                  if (isMobile) setCommentsOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function iconBtnStyle(colors) {
  return {
    width: 36, height: 36, borderRadius: 6, border: `1px solid ${colors.border}`,
    background: "transparent", color: colors.text, cursor: "pointer", fontSize: 16,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  };
}

function ChapterNavButton({ label, target, onClick, colors, align }) {
  if (!target) return <div />;
  return (
    <button onClick={() => onClick(target)} style={{ ...btnStyle(colors), fontSize: 12, textAlign: align, display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : "flex-end" }}>
      <span style={{ color: colors.textMuted, fontSize: 10 }}>{label}</span>
      <span>{target}</span>
    </button>
  );
}

function btnStyle(colors) {
  return {
    padding: "6px 12px",
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    background: "transparent",
    color: colors.text,
    cursor: "pointer",
  };
}
function selectStyle(colors) {
  return {
    fontSize: 12,
    padding: "5px 8px",
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    background: colors.bg,
    color: colors.text,
  };
}

function CommentCard({ comment, manuscript, colors, onJump }) {
  const passage = manuscript.find((p) => p.id === comment.passageId);
  return (
    <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{comment.author}</span>
        <span style={{ fontSize: 10, color: colors.accent, border: `1px solid ${colors.accent}`, borderRadius: 4, padding: "1px 6px" }}>{comment.priority}</span>
      </div>
      <div style={{ fontSize: 13, marginBottom: 6 }}>{comment.text}</div>
      <div
        onClick={() => passage && onJump(passage.id, passage.chapter)}
        style={{ fontSize: 11, color: colors.textMuted, cursor: "pointer" }}
      >
        {comment.type} &middot; {passage?.chapter} &mdash; &ldquo;{passage?.text.slice(0, 40)}&hellip;&rdquo;
      </div>
    </div>
  );
}
