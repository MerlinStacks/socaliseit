/**
 * Undo Store
 * Global undo/redo system for destructive actions with 5-second recovery window
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export type UndoActionType = 'delete_post' | 'reschedule_post' | 'remove_media';

export interface UndoableAction {
    /** Unique identifier for the action */
    id: string;
    /** Type of action for categorization */
    type: UndoActionType;
    /** Human-readable description shown in toast */
    description: string;
    /** Callback to execute undo - restores previous state */
    undo: () => Promise<void>;
    /** Callback to execute the actual deletion after timeout */
    execute?: () => Promise<void>;
    /** Timestamp when this action expires and cannot be undone */
    expiresAt: number;
    /** Whether the action has been undone */
    undone: boolean;
    /** Whether the action has been executed */
    executed: boolean;
}

interface UndoStore {
    /** Stack of undoable actions */
    actions: UndoableAction[];
    /** Push a new undoable action with 5-second expiry */
    push: (action: Omit<UndoableAction, 'id' | 'expiresAt' | 'undone' | 'executed'>) => string;
    /** Undo a specific action by ID */
    undo: (id: string) => Promise<boolean>;
    /** Execute an action (after timeout) */
    execute: (id: string) => Promise<void>;
    /** Clear an action from the stack */
    clear: (id: string) => void;
    /** Get the most recent undoable action */
    getMostRecent: () => UndoableAction | undefined;
    /** Clear all expired or completed actions */
    cleanup: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

const UNDO_TIMEOUT_MS = 5000; // 5 seconds

export const useUndoStore = create<UndoStore>((set, get) => ({
    actions: [],

    push: (action) => {
        const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const undoableAction: UndoableAction = {
            ...action,
            id,
            expiresAt: Date.now() + UNDO_TIMEOUT_MS,
            undone: false,
            executed: false,
        };

        set((state) => ({
            actions: [...state.actions, undoableAction],
        }));

        // Schedule execution after timeout
        setTimeout(() => {
            const current = get().actions.find((a) => a.id === id);
            if (current && !current.undone && !current.executed) {
                get().execute(id);
            }
        }, UNDO_TIMEOUT_MS);

        return id;
    },

    undo: async (id) => {
        const action = get().actions.find((a) => a.id === id);
        if (!action || action.undone || action.executed) {
            return false;
        }

        try {
            await action.undo();
            set((state) => ({
                actions: state.actions.map((a) =>
                    a.id === id ? { ...a, undone: true } : a
                ),
            }));
            return true;
        } catch (error) {
            console.error('[UndoStore] Failed to undo action:', error);
            return false;
        }
    },

    execute: async (id) => {
        const action = get().actions.find((a) => a.id === id);
        if (!action || action.undone || action.executed) {
            return;
        }

        try {
            if (action.execute) {
                await action.execute();
            }
            set((state) => ({
                actions: state.actions.map((a) =>
                    a.id === id ? { ...a, executed: true } : a
                ),
            }));
        } catch (error) {
            console.error('[UndoStore] Failed to execute action:', error);
        }
    },

    clear: (id) => {
        set((state) => ({
            actions: state.actions.filter((a) => a.id !== id),
        }));
    },

    getMostRecent: () => {
        const { actions } = get();
        const active = actions.filter((a) => !a.undone && !a.executed);
        return active[active.length - 1];
    },

    cleanup: () => {
        const now = Date.now();
        set((state) => ({
            actions: state.actions.filter(
                (a) => !a.undone && !a.executed && a.expiresAt > now
            ),
        }));
    },
}));

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an undoable delete action
 * Why: Standardizes delete pattern with immediate visual feedback and delayed execution
 */
export function createUndoableDelete(params: {
    type: UndoActionType;
    description: string;
    onUndo: () => Promise<void>;
    onExecute: () => Promise<void>;
}): string {
    return useUndoStore.getState().push({
        type: params.type,
        description: params.description,
        undo: params.onUndo,
        execute: params.onExecute,
    });
}

/**
 * Check if an action can still be undone
 */
export function canUndo(id: string): boolean {
    const action = useUndoStore.getState().actions.find((a) => a.id === id);
    return !!action && !action.undone && !action.executed && action.expiresAt > Date.now();
}

/**
 * Get remaining time for an action in milliseconds
 */
export function getRemainingTime(id: string): number {
    const action = useUndoStore.getState().actions.find((a) => a.id === id);
    if (!action || action.undone || action.executed) {
        return 0;
    }
    return Math.max(0, action.expiresAt - Date.now());
}
