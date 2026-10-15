import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { resolveSiteUrl } from '../urlConfig.js';
const SITE = resolveSiteUrl(import.meta.env.VITE_SITE_URL);
export const siteOrigin = () => SITE || window.location.origin;
const DEFAULT_TITLE = 'Nessence — Contemporary fashion for men and women';
const DEFAULT_DESC = 'Premium contemporary fashion for men and women. Considered cloth, clean cut, quiet detail.';

// Sets, updates or removes one tag so nothing from the previous page lingers.
function tag(selector, create, value, attr = 'content') {
  let el = document.head.querySelector(selector);
  if (!value) { el?.remove(); return; }
  if (!el) { el = create(); document.head.appendChild(el); }
  el.setAttribute(attr, value);
}
const meta = (key, value, by = 'name') => tag(`meta[${by}="${key}"]`, () => { const m = document.createElement('meta'); m.setAttribute(by, key); return m; }, value);
const abs = (u) => (u ? (/^https?:\/\//.test(u) ? u : siteOrigin() + (u.startsWith('/') ? u : `/${u}`)) : null);

// Per-page head: title, description, canonical, robots, Open Graph and Twitter card.
// Private/thin pages pass noindex and get no canonical. Filters and sort never change the canonical; only ?page=N does.
export function useSeo({ title, description, noindex, image, type = 'website' }) {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const fullTitle = title ? `${title} — Nessence` : DEFAULT_TITLE; const desc = description || DEFAULT_DESC;
    document.title = fullTitle;
    const page = Number(new URLSearchParams(search).get('page')) || 1;
    const canonical = noindex ? null : `${siteOrigin()}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}${page > 1 ? `?page=${page}` : ''}`;
    tag('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }, canonical, 'href');
    meta('description', desc); meta('robots', noindex ? 'noindex,nofollow' : 'index,follow');
    const img = abs(image);
    meta('og:site_name', 'Nessence', 'property'); meta('og:type', type, 'property'); meta('og:title', fullTitle, 'property'); meta('og:description', desc, 'property');
    meta('og:url', canonical, 'property'); meta('og:image', img, 'property');
    meta('twitter:card', img ? 'summary_large_image' : 'summary'); meta('twitter:title', fullTitle); meta('twitter:description', desc); meta('twitter:image', img);
  }, [title, description, noindex, image, type, pathname, search]);
}
