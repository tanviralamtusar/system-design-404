import { useEffect, useState } from 'react';
import LessonDiagram from '../components/LessonDiagram.jsx';
import Icon from '../components/Icon.jsx';
import { LESSONS, findLesson } from '../data/lessons.js';
import { load, save } from '../store.js';

const NOTE = {
  warn: ['alert', 'Watch out'],
  tip: ['bulb', 'Good to know'],
  insight: ['sparkles', 'Key idea'],
  next: ['arrowRight', 'Coming up'],
};

// **bold** and `code` in lesson text
function rich(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export default function Lesson({ id, navigate }) {
  const lesson = findLesson(id);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => setI(0), [id]);

  const last = lesson ? lesson.steps.length - 1 : 0;
  useEffect(() => {
    if (!lesson) return;
    if (i === last) {
      const seen = load('lessons', {});
      if (!seen[lesson.id]) save('lessons', { ...seen, [lesson.id]: true });
    }
  }, [i, last, lesson]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') setI((v) => Math.min(last, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  if (!lesson) return <p className="page">That lesson doesn’t exist. <a href="#/">Back home</a></p>;

  const step = lesson.steps[i];
  const idx = LESSONS.indexOf(lesson);
  const next = LESSONS[idx + 1];
  const prev = LESSONS[idx - 1];

  return (
    <article className="lesson page">
      <header className="lesson-head">
        <p className="eyebrow">
          {String(idx + 1).padStart(2, '0')} · {lesson.level}
        </p>
        <h1>{lesson.title}</h1>
        <p className="lede">{lesson.summary}</p>
      </header>

      <div className="stepper" role="tablist" aria-label="Steps">
        {lesson.steps.map((s, k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === i}
            className={`step-dot ${k === i ? 'on' : ''} ${k < i ? 'past' : ''}`}
            onClick={() => setI(k)}
            title={s.title}
          >
            <span>{k + 1}</span>
          </button>
        ))}
        <button type="button" className="icon-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause animation' : 'Play animation'}>
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
      </div>

      <div className="lesson-body">
        <div className="card diagram-card">
          <LessonDiagram key={`${lesson.id}-${i}`} lesson={lesson} step={step} playing={playing} />
        </div>

        <div className="lesson-text">
          <h2>
            <span className="step-num">{i + 1}/{lesson.steps.length}</span> {step.title}
          </h2>
          <p>{rich(step.body)}</p>
          {step.note && (
            <div className={`note note--${step.note[0]}`}>
              <p className="note-title">
                <Icon name={NOTE[step.note[0]][0]} size={15} /> {NOTE[step.note[0]][1]}
              </p>
              <p>{rich(step.note[1])}</p>
            </div>
          )}
          {step.metrics && (
            <dl className="lesson-metrics">
              {step.metrics.map(([k, v, tone]) => (
                <div key={k} className={tone ? `m--${tone}` : ''}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="row lesson-nav">
            <button type="button" className="btn btn--ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
              <Icon name="left" size={16} /> Back
            </button>
            {i < last ? (
              <button type="button" className="btn" onClick={() => setI(i + 1)}>
                Next <Icon name="right" size={16} />
              </button>
            ) : next ? (
              <button type="button" className="btn" onClick={() => navigate(`#/learn/${next.id}`)}>
                Next lesson <Icon name="arrowRight" size={16} />
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => navigate('#/practice')}>
                Start practising <Icon name="arrowRight" size={16} />
              </button>
            )}
          </div>
          <p className="kbd-hint">Tip: use ← → keys to step.</p>
        </div>
      </div>

      <nav className="lesson-pager">
        {prev ? <a href={`#/learn/${prev.id}`}>← {prev.title}</a> : <span />}
        {next ? <a href={`#/learn/${next.id}`}>{next.title} →</a> : <a href="#/practice">Practice →</a>}
      </nav>
    </article>
  );
}
