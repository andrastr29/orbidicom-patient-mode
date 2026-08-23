import { describe, it, expect, vi } from "vitest";

// annotation-history.ts imports the cornerstone barrels at module load; stub them
// so the pure history logic runs in node. The controller under test takes an
// injected state adapter, so the real annotation.state is never called here.
vi.mock("@cornerstonejs/tools", () => ({
  annotation: {
    state: {
      getAnnotation: vi.fn(),
      addAnnotation: vi.fn(),
      removeAnnotation: vi.fn(),
    },
  },
  Enums: {
    Events: { ANNOTATION_COMPLETED: "a", ANNOTATION_REMOVED: "c", ANNOTATION_MODIFIED: "b" },
  },
}));
vi.mock("@cornerstonejs/core", () => ({
  eventTarget: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
}));

import {
  createAnnotationHistory,
  type AnnotationStateAdapter,
  type HistoryAnnotation,
  type AnnotationHistory,
} from "../src/cornerstone/annotation-history";

const lengthAnn = (uid: string): HistoryAnnotation => ({
  annotationUID: uid,
  metadata: { toolName: "Length", FrameOfReferenceUID: "FOR1" },
  data: { handles: { points: [[0, 0, 0]] } },
});

/**
 * A fake Cornerstone annotation store that mimics the real one's behaviour: a
 * map of UID -> annotation, where `removeAnnotation` synchronously re-fires the
 * REMOVED notification (as Cornerstone's eventTarget does) by calling the
 * controller's recordDelete. `addAnnotation` fires ANNOTATION_ADDED, which the
 * history does NOT listen to, so it records nothing, matching reality.
 */
function makeFake() {
  const store = new Map<string, HistoryAnnotation>();
  let history!: AnnotationHistory;
  const adapter: AnnotationStateAdapter = {
    getAnnotation: (uid) => store.get(uid),
    addAnnotation: (ann, _group) => {
      store.set(ann.annotationUID ?? "", ann);
    },
    removeAnnotation: (uid) => {
      const removed = store.get(uid);
      store.delete(uid);
      if (removed) history.recordDelete(removed); // CS fires ANNOTATION_REMOVED here
    },
  };
  return {
    store,
    adapter,
    attach: (h: AnnotationHistory) => {
      history = h;
    },
  };
}

function setup() {
  const fake = makeFake();
  const history = createAnnotationHistory(fake.adapter);
  fake.attach(history);
  return { history, store: fake.store };
}

/** A manual single-slot scheduler: re-arming replaces the pending callback; flush() runs it. */
function makeManualScheduler() {
  let queued: (() => void) | null = null;
  return {
    schedule: (fn: () => void) => {
      queued = fn;
      return () => {
        if (queued === fn) queued = null;
      };
    },
    flush: () => {
      const f = queued;
      queued = null;
      f?.();
    },
  };
}

describe("createAnnotationHistory", () => {
  it("undoes a create by removing the annotation", () => {
    const { history, store } = setup();
    store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");

    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toBe(true);

    expect(store.has("u1")).toBe(false);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it("does not self-record a delete while undoing a create (isApplying guard)", () => {
    const { history, store } = setup();
    store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");

    history.undo(); // removeAnnotation re-fires recordDelete; guard must drop it

    // If the guard failed, the spurious delete would sit on the undo stack.
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it("redoes a create by re-adding the (latest) annotation", () => {
    const { history, store } = setup();
    store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");
    history.undo();
    expect(store.has("u1")).toBe(false);

    expect(history.redo()).toBe(true);
    expect(store.has("u1")).toBe(true);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it("preserves edits made after creation across an undo/redo round trip", () => {
    const { history, store } = setup();
    store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");
    // user drags a handle after drawing (edits aren't tracked as steps)
    store.get("u1")!.data = { handles: { points: [[9, 9, 9]] } };

    history.undo();
    history.redo();

    expect(store.get("u1")!.data).toEqual({ handles: { points: [[9, 9, 9]] } });
  });

  it("undoes a delete by re-adding it, and redo removes it again", () => {
    const { history, store } = setup();
    const ann = lengthAnn("u1");
    store.set("u1", ann);
    history.recordDelete(ann); // user deleted it
    store.delete("u1"); // (the user's delete already removed it from CS state)

    expect(history.undo()).toBe(true);
    expect(store.has("u1")).toBe(true);

    expect(history.redo()).toBe(true);
    expect(store.has("u1")).toBe(false);
  });

  it("clears the redo stack when a new action is recorded", () => {
    const { history, store } = setup();
    store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");
    history.undo();
    expect(history.canRedo()).toBe(true);

    store.set("u2", lengthAnn("u2"));
    history.recordCreate("u2", "FOR1"); // new action invalidates redo

    expect(history.canRedo()).toBe(false);
  });

  it("returns false from undo/redo when the stacks are empty", () => {
    const { history } = setup();
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it("reset() clears both stacks without mutating annotation state", () => {
    const { history, store } = setup();
    store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");
    history.undo();

    history.reset();

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(store.has("u1")).toBe(false); // reset doesn't touch CS state
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const { history, store } = setup();
    const cb = vi.fn();
    const off = history.subscribe(cb);

    store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");
    expect(cb).toHaveBeenCalledTimes(1);

    history.undo();
    expect(cb).toHaveBeenCalledTimes(2);

    off();
    history.redo();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("records one edit step from beginEdit→commitEdit and undoes/redoes it", () => {
    const { history, store } = setup();
    store.set("u1", lengthAnn("u1")); // points [[0,0,0]]
    history.recordCreate("u1", "FOR1"); // seeds the stable snapshot

    history.beginEdit("u1"); // capture "before" (= [[0,0,0]])
    store.get("u1")!.data = { handles: { points: [[5, 5, 5]] } }; // user drags
    history.commitEdit("u1");

    // edit is now the top undo step (create is beneath it)
    expect(history.undo()).toBe(true);
    expect(store.get("u1")!.data).toEqual({ handles: { points: [[0, 0, 0]] } });
    expect(history.canUndo()).toBe(true); // the create remains

    expect(history.redo()).toBe(true);
    expect(store.get("u1")!.data).toEqual({ handles: { points: [[5, 5, 5]] } });
  });

  it("records no edit step when geometry did not change", () => {
    const { history, store } = setup();
    store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");

    history.beginEdit("u1");
    history.commitEdit("u1"); // no change between before/after

    history.undo(); // undoes the create…
    expect(history.canUndo()).toBe(false); // …and there is no spurious edit beneath it
  });

  it("does not self-record while applying an edit undo (guard holds)", () => {
    const { history, store } = setup();
    store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");
    history.beginEdit("u1");
    store.get("u1")!.data = { handles: { points: [[5, 5, 5]] } };
    history.commitEdit("u1");

    history.undo(); // edit undo does removeAnnotation+addAnnotation; neither may record

    expect(history.canUndo()).toBe(true); // only the create is left
    expect(history.canRedo()).toBe(true); // the edit moved to redo, nothing spurious
  });

  it("beginEdit is idempotent within a gesture: it keeps the gesture-start snapshot", () => {
    const { history, store } = setup();
    store.set("u1", lengthAnn("u1")); // points [[0,0,0]]
    history.recordCreate("u1", "FOR1");

    history.beginEdit("u1"); // captures before = [[0,0,0]]
    store.get("u1")!.data = { handles: { points: [[3, 3, 3]] } }; // mid-drag
    history.beginEdit("u1"); // must NOT overwrite the original "before"
    store.get("u1")!.data = { handles: { points: [[9, 9, 9]] } };
    history.commitEdit("u1");

    history.undo(); // undo the edit -> must restore the gesture-START geometry
    expect(store.get("u1")!.data).toEqual({ handles: { points: [[0, 0, 0]] } });
  });

  it("clears the redo stack when an edit is recorded", () => {
    const { history, store } = setup();
    // Create u1 (has a committed stable baseline) and u2 (will be undone to redo stack).
    store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");
    store.set("u2", lengthAnn("u2"));
    history.recordCreate("u2", "FOR1");
    history.undo(); // u2 create -> redo stack
    expect(history.canRedo()).toBe(true);

    // Edit u1 (which has a stable baseline); this new action must invalidate redo.
    history.beginEdit("u1");
    store.get("u1")!.data = { handles: { points: [[7, 7, 7]] } };
    history.commitEdit("u1");

    expect(history.canRedo()).toBe(false);
  });

  it("coalesces a burst of modifications into a single edit step on idle", () => {
    const sched = makeManualScheduler();
    const fake = makeFake();
    const history = createAnnotationHistory(fake.adapter, { schedule: sched.schedule });
    fake.attach(history);
    fake.store.set("u1", lengthAnn("u1"));
    history.recordCreate("u1", "FOR1");

    // three drag frames; geometry ends at [[5,5,5]]
    history.noteModified(fake.store.get("u1")!);
    fake.store.get("u1")!.data = { handles: { points: [[2, 2, 2]] } };
    history.noteModified(fake.store.get("u1")!);
    fake.store.get("u1")!.data = { handles: { points: [[5, 5, 5]] } };
    history.noteModified(fake.store.get("u1")!);

    sched.flush(); // gesture idle -> commit ONE edit

    expect(history.undo()).toBe(true); // undo the single edit
    expect(fake.store.get("u1")!.data).toEqual({ handles: { points: [[0, 0, 0]] } });
    expect(history.canUndo()).toBe(true); // the create is still there
  });

  it("does not record an edit while applying (noteModified guarded)", () => {
    const sched = makeManualScheduler();
    const fake = makeFake();
    const history = createAnnotationHistory(fake.adapter, { schedule: sched.schedule });
    fake.attach(history);
    fake.store.set("u1", lengthAnn("u1"));
    history.recordDelete(fake.store.get("u1")!);
    fake.store.delete("u1");

    history.undo(); // re-adds u1 via addAnnotation; if that ever fired noteModified it must no-op
    sched.flush(); // nothing should be queued/recorded

    expect(history.canUndo()).toBe(false); // delete moved to redo, nothing spurious on undo stack
    expect(history.canRedo()).toBe(true); // just the delete is there
  });

  it("cancels a pending edit timer on undo/redo so no phantom edit is recorded", () => {
    const sched = makeManualScheduler();
    const fake = makeFake();
    const history = createAnnotationHistory(fake.adapter, { schedule: sched.schedule });
    fake.attach(history);
    fake.store.set("u1", lengthAnn("u1")); // [[0,0,0]]
    history.recordCreate("u1", "FOR1"); // undoStack=[create]; stable seeded

    history.noteModified(fake.store.get("u1")!); // arms idle timer, captures before=[[0,0,0]]
    fake.store.get("u1")!.data = { handles: { points: [[5, 5, 5]] } };

    history.undo(); // undo the create (removes u1); must cancel the armed timer
    history.redo(); // redo re-adds u1
    sched.flush(); // the cancelled timer must NOT fire commitEdit

    // No phantom edit: a single undo removes the create, nothing beneath it.
    expect(history.undo()).toBe(true);
    expect(fake.store.has("u1")).toBe(false);
    expect(history.canUndo()).toBe(false);
  });

  it("ignores ANNOTATION_MODIFIED before the annotation is created (no mid-draw orphan edit)", () => {
    const sched = makeManualScheduler();
    const fake = makeFake();
    const history = createAnnotationHistory(fake.adapter, { schedule: sched.schedule });
    fake.attach(history);
    // user is still DRAWING u1: MODIFIED fires before COMPLETED/recordCreate
    fake.store.set("u1", lengthAnn("u1"));
    history.noteModified(fake.store.get("u1")!); // no committed baseline -> ignored
    fake.store.get("u1")!.data = { handles: { points: [[5, 5, 5]] } };
    sched.flush(); // even if a timer armed, commitEdit must record nothing

    history.recordCreate("u1", "FOR1"); // draw completes

    // Stack is exactly [create], with no orphan edit beneath it.
    expect(history.undo()).toBe(true);
    expect(fake.store.has("u1")).toBe(false);
    expect(history.canUndo()).toBe(false);
  });
});
