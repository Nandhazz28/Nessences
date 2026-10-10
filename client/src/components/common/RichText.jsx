import { Fragment, useMemo } from 'react';
import { parseRichText } from '../../utils/richText.js';

export function RichText({ text, className = '' }) {
  const blocks = useMemo(() => parseRichText(text), [text]);
  return (
    <div className={`prose-nx ${className}`}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h2': return <h2 key={i}>{b.text}</h2>;
          case 'h3': return <h3 key={i}>{b.text}</h3>;
          case 'ol': return <ol key={i}>{b.items.map((t, j) => <li key={j}>{t}</li>)}</ol>;
          case 'ul': return <ul key={i}>{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>;
          case 'table': return (
            <div key={i} className="prose-table" role="region" tabIndex={0} aria-label={`Table: ${b.head.join(', ')}`}>
              <table><thead><tr>{b.head.map((h, j) => <th key={j} scope="col">{h}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => (k === 0 ? <th key={k} scope="row">{c}</th> : <td key={k}>{c}</td>))}</tr>)}</tbody></table>
            </div>);
          default: return <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{l}</Fragment>)}</p>;
        }
      })}
    </div>
  );
}
