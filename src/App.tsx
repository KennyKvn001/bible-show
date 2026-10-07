import { useEffect, useState } from 'react';
import { OutputView } from './components/OutputView.tsx';
import { Presenter } from './components/Presenter.tsx';

const route = () => (location.hash.startsWith('#/output') ? 'output' : 'presenter');

export default function App() {
  const [view, setView] = useState(route);
  useEffect(() => {
    const onHash = () => setView(route());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return view === 'output' ? <OutputView /> : <Presenter />;
}
