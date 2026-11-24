/**
 * Notion Page Exporter & Web Clipper
 * Serialized into an active Notion tab (notion.so, notion.site, app.notion.com)
 * Extracts structured headings, overviews, objectives, resources, and vocabulary into Markdown.
 */
export async function notionPageExport() {
  const url = location.href;
  const title =
    (
      document.querySelector('.notion-page-block [contenteditable="true"]')
        ?.textContent ||
      document.querySelector('h1')?.textContent ||
      document.title.replace(/ \| Notion$/, '').replace(/^Notion - /, '')
    ).trim() || 'Notion Lesson Brief';

  // Strategy 1: Look for Notion content blocks
  const root =
    document.querySelector('.notion-page-content') ||
    document.querySelector('main') ||
    document.body;
  if (!root) throw new Error('Could not find Notion page content.');

  const lines = [`# ${title}\n`];

  function extractBlock(el) {
    if (!el || el.nodeType !== 1) return;

    // Check headings
    const tagName = el.tagName.toLowerCase();
    const classList = el.className || '';
    const text = el.innerText?.trim() || '';
    if (!text) return;

    if (tagName === 'h1' || classList.includes('notion-header-block')) {
      lines.push(`\n## ${text}\n`);
      return;
    }
    if (tagName === 'h2' || classList.includes('notion-sub_header-block')) {
      lines.push(`\n### ${text}\n`);
      return;
    }
    if (tagName === 'h3' || classList.includes('notion-sub_sub_header-block')) {
      lines.push(`\n#### ${text}\n`);
      return;
    }

    // Check list items
    if (tagName === 'li' || classList.includes('notion-bulleted_list-block')) {
      // Find links inside list item
      const link = el.querySelector('a');
      if (link && link.href) {
        lines.push(`- [${link.textContent.trim() || 'Link'}](${link.href})`);
      } else {
        lines.push(`- ${text}`);
      }
      return;
    }

    // Check callouts / quotes
    if (
      classList.includes('notion-callout-block') ||
      tagName === 'blockquote'
    ) {
      lines.push(`> ${text}\n`);
      return;
    }

    // Regular paragraphs with links
    if (tagName === 'p' || classList.includes('notion-text-block')) {
      // Check if it has links
      const links = el.querySelectorAll('a');
      if (links.length > 0) {
        let pText = text;
        links.forEach(a => {
          if (a.href && a.textContent.trim()) {
            pText = pText.replace(
              a.textContent.trim(),
              `[${a.textContent.trim()}](${a.href})`
            );
          }
        });
        lines.push(pText);
      } else {
        lines.push(text);
      }
    }
  }

  const blocks = root.querySelectorAll(
    'h1, h2, h3, p, li, blockquote, .notion-header-block, .notion-sub_header-block, .notion-sub_sub_header-block, .notion-text-block, .notion-bulleted_list-block, .notion-callout-block'
  );

  if (blocks.length > 0) {
    blocks.forEach(b => extractBlock(b));
  } else {
    // Fallback: extract innerText
    lines.push(root.innerText);
  }

  const markdown = lines.join('\n');
  return {
    kind: 'notion-web-clip',
    title,
    url,
    markdown,
  };
}
