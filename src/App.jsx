import { useEffect, useState } from 'react';
import Icon from './components/Icon.jsx';
import Home from './pages/Home.jsx';
import Lesson from './pages/Lesson.jsx';
import Practice from './pages/Practice.jsx';
import Lab from './pages/Lab.jsx';
import Cheatsheets from './pages/Cheatsheets.jsx';
import { LESSONS } from './data/lessons.js';
import { CHALLENGES } from './data/challenges.js';
import { load, save } from './store.js';

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

const navigate = (h) => {
  window.location.hash = h;
};

export default function App() {
  const hash = useHash();
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [section, id] = parts;
  const [theme, setTheme] = useState(() => load('theme', null) || (matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save('theme', theme);
  }, [theme]);

  useEffect(() => {
    setMenuOpen(false);
    if (section !== 'lab' && section !== 'practice') window.scrollTo(0, 0);
  }, [hash, section]);

  let page;
  if (section === 'learn' && id) page = <Lesson key={id} id={id} navigate={navigate} />;
  else if (section === 'practice' && id) page = <Lab key={id} challengeId={id} navigate={navigate} />;
  else if (section === 'practice') page = <Practice />;
  else if (section === 'lab') page = <Lab key={id || 'sandbox'} scenarioId={id} navigate={navigate} />;
  else if (section === 'cheatsheets') page = <Cheatsheets />;
  else page = <Home />;

  const wide = section === 'lab' || (section === 'practice' && id);
  const done = load('done', {});
  const seen = load('lessons', {});

  return (
    <div className={`shell ${wide ? 'shell--wide' : ''}`}>
      <header className="topbar">
        <button type="button" className="icon-btn menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open the course menu" aria-expanded={menuOpen}>
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>
        <a href="#/" className="brand" aria-label="System Design Practice: home">
          <span className="brand-mark">
            <Icon name="lb" size={18} stroke={2.2} />
          </span>
          <span>system<b>/</b>design</span>
        </a>
        <nav className="tabs" aria-label="Sections">
          <a href={`#/learn/${LESSONS[0].id}`} className={section === 'learn' ? 'on' : ''}><Icon name="book" size={16} /> Learn</a>
          <a href="#/practice" className={section === 'practice' ? 'on' : ''}><Icon name="target" size={16} /> Practice</a>
          <a href="#/lab" className={section === 'lab' ? 'on' : ''}><Icon name="window" size={16} /> Design Lab</a>
          <a href="#/cheatsheets" className={section === 'cheatsheets' ? 'on' : ''}><Icon name="sheets" size={16} /> Cheatsheets</a>
        </nav>
        <button type="button" className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
      </header>

      <div className="body">
        {!wide && (
          <aside className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Course">
            <nav className="side-tabs">
              <a href="#/practice"><Icon name="target" size={16} /> Practice</a>
              <a href="#/lab"><Icon name="window" size={16} /> Design Lab</a>
              <a href="#/cheatsheets"><Icon name="sheets" size={16} /> Cheatsheets</a>
            </nav>
            <Progress label="Lessons" n={LESSONS.filter((l) => seen[l.id]).length} of={LESSONS.length} />
            <ol className="toc">
              {LESSONS.map((l, i) => (
                <li key={l.id}>
                  <a href={`#/learn/${l.id}`} className={`${section === 'learn' && id === l.id ? 'on' : ''} ${seen[l.id] ? 'is-done' : ''}`}>
                    <span className="toc-n">{seen[l.id] ? <Icon name="check" size={13} stroke={2.6} /> : String(i + 1).padStart(2, '0')}</span>
                    {l.title}
                  </a>
                </li>
              ))}
            </ol>
            <Progress label="Challenges" n={CHALLENGES.filter((c) => done[c.id]).length} of={CHALLENGES.length} />
            <ol className="toc">
              {CHALLENGES.map((c, i) => (
                <li key={c.id}>
                  <a href={`#/practice/${c.id}`} className={done[c.id] ? 'is-done' : ''}>
                    <span className="toc-n">{done[c.id] ? <Icon name="check" size={13} stroke={2.6} /> : String(i + 1).padStart(2, '0')}</span>
                    {c.title}
                  </a>
                </li>
              ))}
            </ol>
          </aside>
        )}
        <main className="main">{page}</main>
      </div>
    </div>
  );
}

function Progress({ label, n, of }) {
  return (
    <div className="side-progress">
      <p className="panel-label">
        {label} <span>{n}/{of}</span>
      </p>
      <i><em style={{ width: `${(n / of) * 100}%` }} /></i>
    </div>
  );
}
