import { useState } from 'react';
import { type Topic } from '../../../shared/game';
import { useStrings } from '../i18n/strings';
import { InfoDialog } from './InfoDialog';
import { TileIcon } from '../features/game/board/Board';
import { TopicArt } from '../features/game/board/TopicArt';

export function HowTo({ close, topic }: { close: () => void; topic: Topic }) {
  const s = useStrings();
  const [step, setStep] = useState(0);
  const total = s.howToCards.length;
  const last = step === total - 1;
  return (
    <InfoDialog title={s.howTo} close={close}>
      <div className="tutorial-polygon">
        <TopicArt
          topic={topic}
          sides={[3, 5, 6, 8, 10][step]}
          index={step}
          mark={step === 1 ? 'radius' : step === 2 ? 'apothem' : 'none'}
          label
        />
      </div>
      <p className="tutorial-copy">{s.howToCards[step]}</p>
      {step === 3 && (
        <ul className="tutorial-legend">
          {(['start', 'rest', 'chance', 'tax'] as const).map((kind) => (
            <li key={kind}>
              <TileIcon kind={kind} />
              <span>
                <strong>{s.tileNames[kind]}</strong>
                {s.tileDescriptions[kind]}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="tutorial-dots" role="img" aria-label={s.howToStep(step + 1, total)}>
        {s.howToCards.map((_, index) => (
          <span key={index} className={index === step ? 'active' : undefined} />
        ))}
      </div>
      <div className="tutorial-actions">
        <button
          className="action secondary"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          {s.howToBack}
        </button>
        <button className="action primary" onClick={() => (last ? close() : setStep(step + 1))}>
          {last ? s.howToDone : s.howToNext}
        </button>
      </div>
    </InfoDialog>
  );
}
