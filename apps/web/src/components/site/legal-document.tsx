import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Renders the small Markdown subset used in docs/legal (headings, paragraphs, lists, tables,
 * links, bold, code) as React elements. Text is never injected as HTML.
 */
export function LegalDocument({ markdown, base }: { markdown: string; base: string }) {
  return <div className="flex flex-col gap-4 leading-relaxed">{blocks(markdown, base)}</div>;
}

function blocks(markdown: string, base: string): ReactNode[] {
  const lines = markdown.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  const key = () => `b${out.length}`;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      out.push(
        <h3 key={key()} className="pt-2 text-lg font-semibold">
          {inline(line.slice(4), base)}
        </h3>,
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      out.push(
        <h2 key={key()} className="pt-4 text-xl font-semibold">
          {inline(line.slice(3), base)}
        </h2>,
      );
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith('|')) {
        const cells = lines[i]!.slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={key()} className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                {head!.map((cell, c) => (
                  <th key={c} className="border-b py-2 pr-4 align-bottom font-medium">
                    {inline(cell, base)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="border-b align-top">
                  {row.map((cell, c) => (
                    <td key={c} className="py-2 pr-4">
                      {inline(cell, base)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^(- |\d+\. )/.exec(line);
    if (bullet) {
      const ordered = bullet[1] !== '- ';
      const items: string[] = [];
      while (i < lines.length && lines[i]!.trim()) {
        const current = lines[i]!;
        const start = /^(- |\d+\. )/.exec(current);
        if (start) items.push(current.slice(start[1]!.length));
        else items[items.length - 1] += ` ${current.trim()}`;
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List
          key={key()}
          className={`flex flex-col gap-1 pl-6 ${ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {items.map((item, n) => (
            <li key={n}>{inline(item, base)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{2,3} |\||- |\d+\. )/.test(lines[i]!)) {
      paragraph.push(lines[i]!.replace(/^> /, '').trim());
      i++;
    }
    out.push(<p key={key()}>{inline(paragraph.join(' '), base)}</p>);
  }
  return out;
}

/** Links (`[text](target)`), `**bold**`, `*italic*`/`_italic_` and `` `code` `` inside one line. */
function inline(text: string, base: string): ReactNode[] {
  const pattern =
    /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|(?<!\w)[*_]([^*_]+)[*_](?!\w)|`([^`]+)`/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [, label, target, bold, italic, code] = match;
    const n = nodes.length;
    if (label && target) {
      const external = /^(https?:|mailto:)/.test(target);
      nodes.push(
        external ? (
          <a key={n} href={target} className="underline underline-offset-4" rel="noreferrer">
            {label}
          </a>
        ) : (
          <Link
            key={n}
            href={target.startsWith('/') ? target : `${base}/${target}`}
            className="underline underline-offset-4"
          >
            {label}
          </Link>
        ),
      );
    } else if (bold) nodes.push(<strong key={n}>{bold}</strong>);
    else if (italic) nodes.push(<em key={n}>{italic}</em>);
    else if (code)
      nodes.push(
        <code key={n} className="rounded bg-muted px-1 text-sm">
          {code}
        </code>,
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
