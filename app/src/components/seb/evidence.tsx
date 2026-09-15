import { safeUrl } from './helpers';

/** Render arbitrary recorded evidence as text, never as HTML or executable links. */
export function Evidence({ value, depth = 0 }: { value: unknown; depth?: number }) {
    if (value === null || value === undefined) return <span>Not recorded</span>;
    if (typeof value === 'string') {
        const url = safeUrl(value);
        return url ? <a href={url} target="_blank" rel="noopener noreferrer" className="seb-evidence-link">{value}</a> : <span>{value}</span>;
    }
    if (typeof value !== 'object') return <span>{String(value)}</span>;
    if (depth > 5) return <span>{JSON.stringify(value)}</span>;
    if (Array.isArray(value)) return value.length ? <ul className="seb-evidence-list">{value.map((entry, index) => <li key={index}><Evidence value={entry} depth={depth + 1} /></li>)}</ul> : <span>None recorded</span>;
    const entries = Object.entries(value);
    return entries.length ? <dl className="seb-evidence-list">{entries.map(([key, entry]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd><Evidence value={entry} depth={depth + 1} /></dd></div>)}</dl> : <span>None recorded</span>;
}
