import { useState } from 'react';
import { Bookmark, Download, FolderOpen, Trash2 } from 'lucide-react';
import type { CustomQuestionEntry } from '../../../../shared/game';
import { InfoDialog } from '../../components/InfoDialog';
import { useStrings } from '../../i18n/strings';

export type SavedQuestionSet = { name: string; questions: CustomQuestionEntry[] };
const storageKey = 'pologony-question-sets';

export function readSavedQuestionSets(): SavedQuestionSet[] {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (entry): entry is SavedQuestionSet =>
        entry &&
        typeof entry.name === 'string' &&
        Array.isArray(entry.questions) &&
        entry.questions.length > 0,
    );
  } catch {
    return [];
  }
}

export function storeQuestionSets(sets: SavedQuestionSet[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(sets));
    return true;
  } catch {
    return false;
  }
}

export function SavedQuestionSets({
  sets,
  disabled,
  load,
  remove,
}: {
  sets: SavedQuestionSet[];
  disabled: boolean;
  load: (set: SavedQuestionSet) => void;
  remove: (set: SavedQuestionSet) => void;
}) {
  const { classroom: s } = useStrings();
  const labels = s.editor;
  if (!sets.length) return null;

  return (
    <details className="question-library">
      <summary>
        <Bookmark size={18} aria-hidden="true" />
        <span>{labels.savedSets}</span>
        <strong>{sets.length}</strong>
      </summary>
      <ul>
        {sets.map((set) => (
          <li key={set.name}>
            <div>
              <strong>{set.name}</strong>
              <small>{labels.setCount(set.questions.length)}</small>
            </div>
            <button
              type="button"
              className="text-button question-icon-button"
              aria-label={labels.loadSet}
              disabled={disabled}
              onClick={() => load(set)}
            >
              <FolderOpen size={18} aria-hidden="true" />
            </button>
            <a
              className="question-icon-button"
              aria-label={labels.downloadSet}
              href={
                'data:application/json;charset=utf-8,' +
                encodeURIComponent(JSON.stringify(set.questions, null, 2))
              }
              download={
                (set.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'pologony-questions') +
                '.json'
              }
            >
              <Download size={18} aria-hidden="true" />
            </a>
            <button
              type="button"
              className="text-button question-icon-button"
              aria-label={labels.removeSet}
              disabled={disabled}
              onClick={() => remove(set)}
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SaveQuestionSetDialog({
  sets,
  questions,
  initialName,
  save,
  close,
}: {
  sets: SavedQuestionSet[];
  questions: CustomQuestionEntry[];
  initialName: string;
  save: (set: SavedQuestionSet) => boolean;
  close: () => void;
}) {
  const {
    classroom: { editor: labels },
  } = useStrings();
  const [name, setName] = useState(initialName);
  const [failed, setFailed] = useState(false);
  const normalized = name.trim();
  const existing = sets.some((set) => set.name === normalized);
  return (
    <InfoDialog title={labels.saveSet} close={close}>
      <form
        className="question-import question-save-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (normalized) setFailed(!save({ name: normalized, questions }));
        }}
      >
        <p>{labels.saveHelp}</p>
        <label>
          {labels.setName}
          <input
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        {failed && <p role="status">{labels.storageFailed}</p>}
        <button className="action primary" disabled={!normalized}>
          {existing ? labels.replaceSet : labels.saveSet}
        </button>
      </form>
    </InfoDialog>
  );
}
