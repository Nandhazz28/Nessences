import { Link } from 'react-router-dom';
import { useSeo } from '../hooks/useSeo.js';

export default function NotFound() {
  useSeo({ title: 'Page not found', noindex: true });
  return (
    <div className="wrap py-32 text-center">
      <p className="eyebrow">404</p>
      <h1 className="text-[length:var(--text-h1)] mt-3">Nothing at this address.</h1>
      <p className="mt-4 text-muted">The page may have moved, or the link may be mistyped.</p>
      <div className="mt-10 flex justify-center gap-3"><Link to="/" className="btn btn-solid">Home</Link><Link to="/new-arrivals" className="btn btn-line">New arrivals</Link></div>
    </div>
  );
}
