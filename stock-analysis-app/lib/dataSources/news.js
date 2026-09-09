// Fetches recent headlines about a company from Google News RSS.
// Free, no API key required. Good enough to bootstrap the MVP - can be
// swapped for a structured news API later if quality needs improve.

import { XMLParser } from "fast-xml-parser";

export async function getRecentHeadlines(companyName, limit = 8) {
  const query = encodeURIComponent(`${companyName} stock`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

  const res = await fetch(url);
  const xml = await res.text();

  const parser = new XMLParser();
  const parsed = parser.parse(xml);

  const items = parsed?.rss?.channel?.item ?? [];
  const list = Array.isArray(items) ? items : [items];

  return list.slice(0, limit).map((item) => ({
    headline: item.title,
    url: item.link,
    source: item.source?.["#text"] ?? "Google News",
    publishedDate: item.pubDate,
  }));
}
