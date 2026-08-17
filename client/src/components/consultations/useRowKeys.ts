import { useRef } from 'react';

interface RowKeys {
  /** One stable key per row, aligned by position. */
  keys: string[];
  /** Call alongside the `onChange` that appends a row. */
  inserted: () => void;
  /** Call alongside the `onChange` that removes the row at `index`. */
  removed: (index: number) => void;
}

/**
 * Stable React keys for editor rows whose data carries no id of its own.
 *
 * Keying these lists by array index means removing the middle row re-labels
 * every row after it: React reuses those inputs for different values, and the
 * caret jumps to a field the doctor was not typing in. A key that travels with
 * the row instead keeps the surviving fields mounted exactly as they were.
 *
 * The rows themselves cannot be the key — every keystroke replaces the object
 * through an immutable update, which would remount the input on each character.
 * So the keys live beside the array and are maintained by the same two
 * operations that change its length; anything else (a reload, or a save that
 * returns a different set) falls back to re-keying from the front.
 */
export default function useRowKeys(count: number): RowKeys {
  const nextId = useRef(0);
  const keys = useRef<string[]>([]);

  if (keys.current.length !== count) {
    const previous = keys.current;
    keys.current = Array.from(
      { length: count },
      (_, index) => previous[index] ?? `row-${nextId.current++}`
    );
  }

  return {
    keys: keys.current,
    inserted: () => {
      keys.current = [...keys.current, `row-${nextId.current++}`];
    },
    removed: (index: number) => {
      keys.current = keys.current.filter((_, i) => i !== index);
    },
  };
}
