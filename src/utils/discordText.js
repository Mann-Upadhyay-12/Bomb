// Text copied from a Discord message on a PHONE keeps its markdown ("**20**: Hydra", "> quote", "- item",
// "# heading", `code`, ||spoiler||); copied on a computer it is the text you see ("20: Hydra"). Pasted
// manuals are read from the second form, so this turns the first into it. Plain text comes back as it was.
//
// Handled the way Discord shows it: **bold**, __underline__, ~~strike~~, ||spoiler||, *italic* / _italic_
// around whole words, `code` and ``` blocks, > / >>> quotes, # / ## / ### headings, -# small text,
// "- " / "* " list bullets, [text](link), and \-escapes (\* stays a *).

const KEEP = '\u0000'; // escaped characters are parked as KEEP<code>KEEP while the markup is removed

export function discordPlain(text) {
  if (text == null) return '';
  const src = String(text);
  if (!/[*_~|`>#\-\[\\]/.test(src)) return src; // nothing Discord would format
  return src.split(/\r?\n/).flatMap((line) => {
    if (/^\s*```\w*\s*$/.test(line)) return []; // a code block fence on its own line
    let l = line.replace(/\\([\\*_~`|>#\-\[\]()])/g, (m, c) => `${KEEP}${c.charCodeAt(0)}${KEEP}`);
    l = l.replace(/^```\w*\s*|```\s*$/g, '');
    l = l.replace(/^\s*>>>\s?/, '').replace(/^\s*>\s/, '').replace(/^\s*>$/, '');
    l = l.replace(/^\s*-#\s+/, '').replace(/^\s*#{1,3}\s+/, '');
    l = l.replace(/^(\s*)[-*•]\s+/, '$1');
    let before;
    do { // nested markup (***x***, **__x__**) comes off layer by layer
      before = l;
      l = l.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/~~(.+?)~~/g, '$1').replace(/\|\|(.+?)\|\|/g, '$1');
      l = l.replace(/(^|[\s(\[{"'])\*(\S(?:[^*\n]*?\S)?)\*(?=$|[\s.,:;!?)\]}"'=–-])/g, '$1$2');
      l = l.replace(/(^|[^\w])_(\S(?:[^_\n]*?\S)?)_(?![\w])/g, '$1$2');
    } while (l !== before);
    l = l.replace(/`([^`]*)`/g, '$1');
    l = l.replace(/\[([^\]]+)\]\((?:https?:)?[^)\s]+\)/g, '$1');
    return [l.replace(new RegExp(`${KEEP}(\\d+)${KEEP}`, 'g'), (m, c) => String.fromCharCode(Number(c)))];
  }).join('\n');
}
