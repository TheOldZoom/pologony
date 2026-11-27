import { useEffect, useRef, useState } from 'react';
import { useStrings } from '../../i18n/strings';
import { InfoDialog } from '../../components/InfoDialog';

export function HomeFooter() {
  const { project } = useStrings();
  const [policy, setPolicy] = useState<'terms' | 'privacy'>();
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!policy) trigger.current?.focus({ preventScroll: true });
  }, [policy]);

  return (
    <footer className="home-footer">
      <p>
        <a href="https://github.com/theoldzoom/pologony" target="_blank" rel="noreferrer">
          {project.credit.link}
        </a>{' '}
        {project.credit.text}{' '}
        <a href="https://zoomhub.xyz/" target="_blank" rel="noreferrer">
          {project.authors.xavier}
        </a>{' '}
        &amp; {project.authors.goat}
      </p>
      <div className="home-policy-links">
        {(['terms', 'privacy'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className="text-button"
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setPolicy(kind);
            }}
          >
            {project[kind].title}
          </button>
        ))}
      </div>
      {policy && (
        <InfoDialog title={project[policy].title} close={() => setPolicy(undefined)}>
          <div className="policy-copy">
            {project[policy].paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {policy === 'terms' && (
              <a href="https://github.com/theoldzoom/pologony" target="_blank" rel="noreferrer">
                {project.source}
              </a>
            )}
          </div>
        </InfoDialog>
      )}
    </footer>
  );
}
