// Renders the Markdown that goes into Level Builder as DOM nodes (no innerHTML),
// so Check shows formatted text instead of raw ** and <i class="fa-..."> tags.
// Covers what convertNotes() and the Notion import produce: paragraphs, bullet and
// numbered lists, headings, **bold**, *italic*, `code`, https links, [r key]
// resource references and the speaker-note icons.
import {icons} from '../engine/dist/core.mjs';

// Level Builder class → the emoji the author typed in the speaker notes.
const ICON_FOR_CLASS = new Map(
  icons.map(([emoji, cls]) => [cls, emoji === '☑' ? '☑️' : emoji])
);

const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter(c => c != null && c !== false));
  return n;
};

function safeLink(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}

const INLINE =
  /<i class="(?<icon>[^"]+)" aria-hidden="true"><\/i>\s?|!\[(?<alt>[^\]\n]*)\]\((?<image>[^\s)]+)\)|\[r (?<resource>[-\w]+)\]|\[(?<label>[^\]\n]+)\]\((?<link>[^\s)]+)\)|\*\*(?<bold>[^*\n]+)\*\*|\*(?<em>[^*\n]+)\*|`(?<code>[^`\n]+)`/g;

function link(url, label) {
  const href = safeLink(url);
  if (!href) {
    return null;
  }
  const a = el('a', {href, target: '_blank', rel: 'noopener'});
  a.append(...label);
  return a;
}

export function inlineNodes(text, resources = []) {
  const input = String(text ?? '');
  const out = [];
  let index = 0;
  for (const m of input.matchAll(INLINE)) {
    if (m.index > index) {
      out.push(input.slice(index, m.index));
    }
    index = m.index + m[0].length;
    const g = m.groups;
    let node = null;
    if (g.icon != null) {
      const emoji = ICON_FOR_CLASS.get(g.icon);
      // fa-rectangle-list marks "show this slide" (engine/dist/insertions.mjs).
      node = emoji
        ? el('span', {
            className: 'note-icon',
            textContent: emoji,
            ariaHidden: 'true',
          })
        : g.icon.includes('fa-rectangle-list')
          ? el('span', {className: 'slide-chip', textContent: 'Slide'})
          : '';
    } else if (g.image != null) {
      // A link, not an <img>: Check makes no requests to image hosts.
      node = link(g.image, [`Image: ${g.alt || 'no description'}`]);
    } else if (g.resource != null) {
      const r = resources.find(x => x.key === g.resource);
      node = r && link(r.url, [`${r.name}${r.type ? ` (${r.type})` : ''}`]);
      if (node) {
        node.className = 'resource-reference';
      } else {
        node = el(
          'span',
          {className: 'missing-ref'},
          m[0],
          ' (no matching resource)'
        );
      }
    } else if (g.link != null) {
      node = link(g.link, inlineNodes(g.label, resources));
    } else if (g.bold != null) {
      node = el('strong', {}, ...inlineNodes(g.bold, resources));
    } else if (g.em != null) {
      node = el('em', {}, ...inlineNodes(g.em, resources));
    } else if (g.code != null) {
      node = el('code', {textContent: g.code});
    }
    out.push(node ?? m[0]);
  }
  if (index < input.length) {
    out.push(input.slice(index));
  }
  return out;
}

const BULLET = /^\s*[-*+]\s+(.*)$/,
  NUMBER = /^\s*\d+[.)]\s+(.*)$/,
  HEADING = /^\s*#{1,6}\s+(.*)$/;

// Block-level Markdown → a .md container of <p>, <ul>, <ol>.
export function markdownBlock(text, resources = []) {
  const root = el('div', {className: 'md'});
  let para = [],
    list = null;
  const flushPara = () => {
    if (para.length) {
      const p = el('p');
      para.forEach((line, i) => {
        if (i) {
          p.append(el('br'));
        }
        p.append(...inlineNodes(line, resources));
      });
      root.append(p);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      root.append(
        el(
          list.tag,
          {},
          ...list.items.map(t => el('li', {}, ...inlineNodes(t, resources)))
        )
      );
      list = null;
    }
  };
  for (const line of String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')) {
    const bullet = line.match(BULLET),
      number = line.match(NUMBER),
      heading = line.match(HEADING);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (bullet || number) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) {
        flushList();
      }
      list ??= {tag, items: []};
      list.items.push((bullet || number)[1]);
    } else if (heading) {
      flushPara();
      flushList();
      root.append(
        el(
          'p',
          {className: 'md-heading'},
          el('strong', {}, ...inlineNodes(heading[1], resources))
        )
      );
    } else if (list && /^\s+\S/.test(line)) {
      // An indented line continues the list item above it.
      list.items[list.items.length - 1] += ' ' + line.trim();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return root;
}
