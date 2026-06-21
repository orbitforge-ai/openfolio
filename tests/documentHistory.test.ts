import { describe, expect, it } from "vitest";
import {
  applyDocumentEdit,
  emptyDocumentHistory,
  redoDocumentEdit,
  undoDocumentEdit
} from "../src/lib/documentHistory";
import { createInitialPages, rotatePage } from "../src/lib/pageOperations";
import type { DocumentSession } from "../src/types";

function makeSession(): DocumentSession {
  return {
    id: "session-test",
    name: "Test.pdf",
    bytes: new Uint8Array(),
    pageCount: 2,
    pages: createInitialPages(2),
    selectedPage: 0,
    zoom: 1,
    dirty: false,
    annotations: [],
    formEdits: {},
    addedTextFields: []
  };
}

describe("document history", () => {
  it("pushes document edits and clears redo", () => {
    const first = applyDocumentEdit(makeSession(), emptyDocumentHistory(), (session) => ({
      ...session,
      dirty: true,
      pages: rotatePage(session.pages, 0)
    }));
    const undone = undoDocumentEdit(first.session, first.history);
    const editedAgain = applyDocumentEdit(undone.session, undone.history, (session) => ({
      ...session,
      dirty: true,
      annotations: [
        {
          id: "txt-1",
          kind: "text",
          pageIndex: 0,
          rect: { x: 10, y: 10, width: 100, height: 20 },
          text: "Hello",
          color: "blue"
        }
      ]
    }));

    expect(editedAgain.history.undo).toHaveLength(1);
    expect(editedAgain.history.redo).toHaveLength(0);
  });

  it("undo restores the previous document snapshot", () => {
    const result = applyDocumentEdit(makeSession(), emptyDocumentHistory(), (session) => ({
      ...session,
      dirty: true,
      pages: rotatePage(session.pages, 0),
      selectedPage: 1
    }));
    const undone = undoDocumentEdit(result.session, result.history);

    expect(undone.session.pages[0].rotation).toBe(0);
    expect(undone.session.selectedPage).toBe(0);
    expect(undone.session.dirty).toBe(false);
    expect(undone.history.undo).toHaveLength(0);
    expect(undone.history.redo).toHaveLength(1);
  });

  it("redo reapplies an undone document snapshot", () => {
    const result = applyDocumentEdit(makeSession(), emptyDocumentHistory(), (session) => ({
      ...session,
      dirty: true,
      formEdits: {
        name: { name: "name", type: "text", value: "Ada" }
      }
    }));
    const undone = undoDocumentEdit(result.session, result.history);
    const redone = redoDocumentEdit(undone.session, undone.history);

    expect(redone.session.formEdits.name.value).toBe("Ada");
    expect(redone.session.dirty).toBe(true);
    expect(redone.history.undo).toHaveLength(1);
    expect(redone.history.redo).toHaveLength(0);
  });

  it("undo and redo include added text fields", () => {
    const result = applyDocumentEdit(makeSession(), emptyDocumentHistory(), (session) => ({
      ...session,
      dirty: true,
      addedTextFields: [
        {
          id: "field-1",
          name: "openfolio.input.1",
          pageIndex: 0,
          rect: { x: 10, y: 20, width: 120, height: 30 },
          value: "Customer name"
        }
      ]
    }));
    const undone = undoDocumentEdit(result.session, result.history);
    const redone = redoDocumentEdit(undone.session, undone.history);

    expect(undone.session.addedTextFields).toHaveLength(0);
    expect(redone.session.addedTextFields[0].value).toBe("Customer name");
  });

  it("undo and redo are no-ops with empty stacks", () => {
    const session = makeSession();
    const history = emptyDocumentHistory();

    expect(undoDocumentEdit(session, history)).toEqual({ session, history });
    expect(redoDocumentEdit(session, history)).toEqual({ session, history });
  });

  it("does not push no-op edits", () => {
    const session = makeSession();
    const result = applyDocumentEdit(session, emptyDocumentHistory(), (current) => ({ ...current }));

    expect(result.session).toBe(session);
    expect(result.history.undo).toHaveLength(0);
    expect(result.history.redo).toHaveLength(0);
  });
});
