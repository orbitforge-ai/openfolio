import type { DocumentHistorySnapshot, DocumentSession, FormEdit, PageState, PdfAnnotation } from "../types";

export interface DocumentHistory {
  undo: DocumentHistorySnapshot[];
  redo: DocumentHistorySnapshot[];
}

const HISTORY_LIMIT = 100;

export function emptyDocumentHistory(): DocumentHistory {
  return { undo: [], redo: [] };
}

export function snapshotDocumentSession(session: DocumentSession): DocumentHistorySnapshot {
  return {
    pages: clonePages(session.pages),
    selectedPage: session.selectedPage,
    dirty: session.dirty,
    annotations: cloneAnnotations(session.annotations),
    formEdits: cloneFormEdits(session.formEdits)
  };
}

export function restoreDocumentSnapshot(session: DocumentSession, snapshot: DocumentHistorySnapshot): DocumentSession {
  return {
    ...session,
    pages: clonePages(snapshot.pages),
    selectedPage: snapshot.selectedPage,
    dirty: snapshot.dirty,
    annotations: cloneAnnotations(snapshot.annotations),
    formEdits: cloneFormEdits(snapshot.formEdits)
  };
}

export function applyDocumentEdit(
  session: DocumentSession,
  history: DocumentHistory,
  updater: (session: DocumentSession) => DocumentSession
): { session: DocumentSession; history: DocumentHistory } {
  const before = snapshotDocumentSession(session);
  const nextSession = updater(session);
  const after = snapshotDocumentSession(nextSession);

  if (documentSnapshotsEqual(before, after)) {
    return { session, history };
  }

  return {
    session: nextSession,
    history: {
      undo: [...history.undo, before].slice(-HISTORY_LIMIT),
      redo: []
    }
  };
}

export function undoDocumentEdit(
  session: DocumentSession,
  history: DocumentHistory
): { session: DocumentSession; history: DocumentHistory } {
  const previous = history.undo[history.undo.length - 1];
  if (!previous) return { session, history };

  return {
    session: restoreDocumentSnapshot(session, previous),
    history: {
      undo: history.undo.slice(0, -1),
      redo: [snapshotDocumentSession(session), ...history.redo].slice(0, HISTORY_LIMIT)
    }
  };
}

export function redoDocumentEdit(
  session: DocumentSession,
  history: DocumentHistory
): { session: DocumentSession; history: DocumentHistory } {
  const next = history.redo[0];
  if (!next) return { session, history };

  return {
    session: restoreDocumentSnapshot(session, next),
    history: {
      undo: [...history.undo, snapshotDocumentSession(session)].slice(-HISTORY_LIMIT),
      redo: history.redo.slice(1)
    }
  };
}

function documentSnapshotsEqual(left: DocumentHistorySnapshot, right: DocumentHistorySnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clonePages(pages: PageState[]): PageState[] {
  return pages.map((page) => ({ ...page }));
}

function cloneAnnotations(annotations: PdfAnnotation[]): PdfAnnotation[] {
  return annotations.map((annotation) => ({
    ...annotation,
    rect: { ...annotation.rect },
    points: annotation.points?.map((point) => ({ ...point })),
    signatureAsset: annotation.signatureAsset ? { ...annotation.signatureAsset } : undefined
  }));
}

function cloneFormEdits(formEdits: Record<string, FormEdit>): Record<string, FormEdit> {
  return Object.fromEntries(
    Object.entries(formEdits).map(([name, edit]) => [
      name,
      {
        ...edit,
        value: Array.isArray(edit.value) ? [...edit.value] : edit.value
      }
    ])
  );
}
