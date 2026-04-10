import type { ReactNode } from "react";

// Splits a text segment into runs of plain text and inline markup
// (bold, italic, [text](url), bare URLs).
function renderInline(text: string): ReactNode[] {
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+))/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[2])      nodes.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[3]) nodes.push(<em key={key++}>{match[3]}</em>);
    else if (match[4]) nodes.push(<a key={key++} href={match[5]} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{match[4]}</a>);
    else if (match[6]) nodes.push(<a key={key++} href={match[6]} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{match[6]}</a>);
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

interface Props {
  children: string;
  className?: string;
}

export default function SimpleMarkdown({ children, className }: Props) {
  const blocks = children.split(/\n{2,}/);

  const rendered = blocks.map((block, i) => {
    // Heading
    const heading = block.match(/^(#{1,3})\s+(.+)/);
    if (heading) {
      const level = heading[1].length;
      const text = renderInline(heading[2]);
      if (level === 1) return <h2 key={i} className="text-base font-bold text-gray-900 mt-3">{text}</h2>;
      if (level === 2) return <h3 key={i} className="text-sm font-semibold text-gray-800 mt-2">{text}</h3>;
      return <h4 key={i} className="text-sm font-medium text-gray-700 mt-2">{text}</h4>;
    }

    // Unordered list
    const listLines = block.split("\n").filter((l) => l.match(/^[-*]\s/));
    if (listLines.length > 0 && listLines.length === block.split("\n").filter(Boolean).length) {
      return (
        <ul key={i} className="list-disc list-inside space-y-0.5">
          {listLines.map((l, j) => (
            <li key={j} className="text-sm">{renderInline(l.replace(/^[-*]\s/, ""))}</li>
          ))}
        </ul>
      );
    }

    // Paragraph (preserve single newlines as <br>)
    const lines = block.split("\n");
    return (
      <p key={i} className="text-sm leading-relaxed">
        {lines.flatMap((line, j) => [
          ...renderInline(line),
          j < lines.length - 1 ? <br key={`br-${j}`} /> : null,
        ])}
      </p>
    );
  });

  return <div className={className ?? "space-y-2 text-gray-700"}>{rendered}</div>;
}
