/**
 * Notion Connector Service
 * Provides direct connection to Notion via:
 * 1. Official Notion API (token-based direct sync of pages & blocks)
 * 2. Active Tab In-Page Clipper (DOM-based extraction with no token needed)
 */

import { notionBlocks, notionMarkdown } from '../engine/dist/source-imports.mjs';
import { notionPageExport } from '../shared/notion-page-export.mjs';

const NOTION_API_VERSION = '2022-06-28';

export class NotionConnector {
  /**
   * Extracts clean Notion page ID from URL or raw ID
   */
  static extractPageId(input) {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim();
    // Match 32 hex chars with optional hyphens at end of URL or standalone
    const match = clean.match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}|[0-9a-f]{32})(?:[?#]|$)/i);
    if (!match) return null;
    return match[1].replace(/-/g, '').toLowerCase();
  }

  static async getToken() {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(['notionIntegrationToken'], res => {
          resolve(res.notionIntegrationToken || '');
        });
      } else {
        resolve(localStorage.getItem('lesson_studio_notion_token') || '');
      }
    });
  }

  static async setToken(token) {
    return new Promise(resolve => {
      const clean = (token || '').trim();
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ notionIntegrationToken: clean }, () => resolve(true));
      } else {
        localStorage.setItem('lesson_studio_notion_token', clean);
        resolve(true);
      }
    });
  }

  /**
   * Fetches page blocks directly from the official Notion API
   */
  static async fetchFromApi(pageUrlOrId, overrideToken = null) {
    const pageId = this.extractPageId(pageUrlOrId);
    if (!pageId) throw new Error('Invalid Notion page URL or ID. Check the link.');

    const token = overrideToken || await this.getToken();
    if (!token) {
      throw new Error('Notion Integration Token not configured. Enter your token in settings or clip from an active Notion tab.');
    }

    // 1. Fetch Page Details (Title)
    let pageTitle = 'Notion Brief';
    try {
      const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': NOTION_API_VERSION,
          'Content-Type': 'application/json'
        }
      });
      if (pageRes.ok) {
        const pageData = await pageRes.json();
        const titleProp = Object.values(pageData.properties || {}).find(p => p.type === 'title');
        if (titleProp?.title?.[0]?.plain_text) {
          pageTitle = titleProp.title[0].plain_text;
        }
      }
    } catch {
      // Continue to blocks if page details fail
    }

    // 2. Fetch Page Blocks (paginated)
    let allBlocks = [];
    let cursor = null;

    do {
      const query = cursor ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100` : '?page_size=100';
      const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children${query}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': NOTION_API_VERSION,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Notion API returned HTTP ${res.status}. Verify token permissions.`);
      }

      const data = await res.json();
      allBlocks.push(...(data.results || []));
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);

    // 3. Convert blocks using verified notionBlocks parser
    const parsedBrief = notionBlocks({ results: allBlocks });
    if (pageTitle) parsedBrief.title = pageTitle;
    parsedBrief.sourceUrl = `https://www.notion.so/${pageId}`;
    parsedBrief.kind = 'brief';

    return parsedBrief;
  }

  /**
   * Clips from active open Notion tab directly (zero token needed)
   */
  static async clipActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || (!tab.url.includes('notion.so') && !tab.url.includes('notion.site') && !tab.url.includes('app.notion.com'))) {
      throw new Error('Please open or switch to a Notion page first.');
    }

    const [response] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: notionPageExport
    });

    const result = response?.result;
    if (result?.kind !== 'notion-web-clip') {
      throw new Error('Could not clip Notion page. Ensure the brief has headings.');
    }

    const parsedBrief = notionMarkdown(result.markdown);
    if (result.title) parsedBrief.title = result.title;
    parsedBrief.sourceUrl = tab.url;

    return parsedBrief;
  }
}
