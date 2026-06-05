import { NextResponse } from 'next/server';
import type { WorldCupNewsItem } from '@/lib/world-cup/types';

export const runtime = 'nodejs';
export const revalidate = 300;

// ── RSS sources ───────────────────────────────────────────────────────────────
const RSS_SOURCES = [
  // Sport5 — World Cup 2026 dedicated folders
  { name: 'Sport5', url: 'https://www.sport5.co.il/rss.aspx?FolderID=5165', sourceUrl: 'https://www.sport5.co.il/Mondial/' },
  { name: 'Sport5', url: 'https://www.sport5.co.il/rss.aspx?FolderID=5166', sourceUrl: 'https://www.sport5.co.il/Mondial/' },
  // Sport5 — general football
  { name: 'Sport5', url: 'https://www.sport5.co.il/rss.aspx?FolderID=64', sourceUrl: 'https://www.sport5.co.il' },
  // Ynet sport (confirmed RSS)
  { name: 'Ynet ספורט', url: 'https://www.ynet.co.il/Integration/StoryRss3.xml', sourceUrl: 'https://www.ynet.co.il/sport' },
  // Ynet general (for economy/WC articles)
  { name: 'Ynet', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml', sourceUrl: 'https://www.ynet.co.il' },
  // Walla sport
  { name: 'וואלה ספורט', url: 'https://rss.walla.co.il/feed/25', sourceUrl: 'https://sports.walla.co.il' },
  // Walla world news (economy/WC)
  { name: 'וואלה', url: 'https://rss.walla.co.il/feed/2', sourceUrl: 'https://www.walla.co.il' },
  // Israel Hayom
  { name: 'ישראל היום', url: 'https://www.israelhayom.co.il/rss.xml', sourceUrl: 'https://www.israelhayom.co.il/sport' },
  // TheMarker (economy angle)
  { name: 'TheMarker', url: 'https://www.themarker.com/srv/tm-all-articles', sourceUrl: 'https://www.themarker.com' },
  // ONE — general sport feed
  { name: 'ONE', url: 'https://www.one.co.il/cat/coop/xml/rss/newsfeed.aspx?id=1', sourceUrl: 'https://www.one.co.il' },
  // Mako / N12
  { name: 'N12 ספורט', url: 'https://www.mako.co.il/rss/31750e52b3b2c110', sourceUrl: 'https://www.mako.co.il/sport' },
];

// Keywords that mark an article as relevant to World Cup 2026
const WC_KEYWORDS = [
  'מונדיאל', 'world cup', 'worldcup', 'גביע העולם', 'FIFA', 'fifa',
  '2026', 'נבחרת', 'ארגנטינה', 'ברזיל', 'צרפת', 'אנגליה', 'ספרד', 'פורטוגל',
  'אמבאפה', 'מסי', 'רונאלדו', 'הולאנד', 'גרמניה', 'ניימאר',
];

function isWorldCupArticle(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  return WC_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

// ── Hardcoded fallback (real articles from Israeli news sites, June 2026) ──────
const FALLBACK_ITEMS: WorldCupNewsItem[] = [
  {
    title: 'חודש לשריקת הפתיחה: כל מה שצריך לדעת לקראת מונדיאל 2026',
    link: 'https://www.ynet.co.il/sport/article/bjgb3srrzl',
    pubDate: '2026-05-11T08:00:00Z',
    source: 'Ynet ספורט',
    description: '48 נבחרות, 12 בתים ו-104 משחקים. מונדיאל 2026 מסתמן כגביע העולם הגדול מאי פעם — כל מה שצריך לדעת לפני הפתיחה.',
    isSourceLogoFallback: true,
  },
  {
    title: 'מתי אמבאפה מול הולאנד? המשחקים המסקרנים של מונדיאל 2026',
    link: 'https://www.ynet.co.il/sport/worldsoccer/article/bkzoqtlzzx',
    pubDate: '2026-05-20T10:00:00Z',
    source: 'Ynet ספורט',
    description: 'צרפת, ארגנטינה, אנגליה וברזיל — המשחקים הגדולים של שלב הבתים שכולם מחכים להם.',
    isSourceLogoFallback: true,
  },
  {
    title: 'קרב התחזיות: מי תזכה במונדיאל 2026?',
    link: 'https://www.sport5.co.il/articles.aspx?FolderID=5166&docID=546714',
    pubDate: '2026-05-28T12:00:00Z',
    source: 'Sport5',
    description: 'ארגנטינה, ברזיל, צרפת וספרד על הפרק — מי הפיבוריטית הגדולה לפי מומחי ספורט 5?',
    isSourceLogoFallback: true,
  },
  {
    title: 'מונדיאל 2026 יהיה האופרציה הכלכלית הגדולה בתולדות הכדורגל',
    link: 'https://www.calcalist.co.il/sport_news/article/r1zg2n47zl',
    pubDate: '2026-05-15T09:00:00Z',
    source: 'כלכליסט',
    description: 'פיפ"א מטרגטת הכנסות שיא של מעל 11 מיליארד דולר — עלייה של 50% לעומת קטאר. אבל מה עם רמת המשחק?',
    isSourceLogoFallback: true,
  },
  {
    title: '95 דולר לכיסא בשאטל לאצטדיון: הכלכלה הצינית של מונדיאל 2026',
    link: 'https://www.calcalist.co.il/world_news/article/h1rongt3wl',
    pubDate: '2026-05-18T11:00:00Z',
    source: 'כלכליסט',
    description: 'בוסטון גובה 95 דולר על נסיעה באוטובוס לאצטדיון. הכרטיסים הזולים לנבחרת ארה"ב מתחילים ב-1,640 דולר.',
    isSourceLogoFallback: true,
  },
  {
    title: 'מונדיאל 2026: האם חום קיצוני ימיס את רווחי העתק של פיפ"א?',
    link: 'https://www.calcalist.co.il/world_news/article/hjw0fb51ze',
    pubDate: '2026-05-22T08:30:00Z',
    source: 'כלכליסט',
    description: 'חוקי הפיזיקה ומשבר האקלים מאיימים לפגוע במוצר ובשחקנים. פיפ"א לא מוכנה לוותר על תאריכי הקיץ.',
    isSourceLogoFallback: true,
  },
  {
    title: 'נקמה, יריבות וגמר מהחלומות: המשחקים שכל העולם רוצה לראות',
    link: 'https://sport1.maariv.co.il/%D7%9E%D7%95%D7%A0%D7%93%D7%99%D7%90%D7%9C-2026/article/1862897/',
    pubDate: '2026-05-25T14:00:00Z',
    source: 'ספורט 1',
    description: 'ברזיל מול ארגנטינה, אנגליה מול גרמניה, פורטוגל מול ספרד — המשחקים שיכולים לקרות בנוקאאוט.',
    isSourceLogoFallback: true,
  },
  {
    title: 'מונדיאל 2026: לוח המשחקים המלא, בתים ושידורים',
    link: 'https://www.ynet.co.il/sport/worldsoccer/article/r1rbe6ezbl',
    pubDate: '2026-04-10T10:00:00Z',
    source: 'Ynet ספורט',
    description: 'לוח המשחקים המלא של מונדיאל 2026 — 104 משחקים ב-16 ערים בארה"ב, קנדה ומקסיקו, לפי שעון ישראל.',
    isSourceLogoFallback: true,
  },
  {
    title: 'מונדיאל 2026: לוח המשחקים ושידורים | N12',
    link: 'https://www.mako.co.il/news-sport/world_soccer-2026_q2/Article-e119e0229411e91027.htm',
    pubDate: '2026-05-30T09:00:00Z',
    source: 'N12 ספורט',
    description: 'לוח המשחקים המעודכן של מונדיאל 2026, עם שעות השידורים בכאן 11 ופרטי כל הנבחרות.',
    isSourceLogoFallback: true,
  },
  {
    title: 'מונדיאל 2026: תקצירים, שידורים וחדשות שוטפות | כאן',
    link: 'https://www.kan.org.il/lobby/worldcup2026/',
    pubDate: '2026-06-01T08:00:00Z',
    source: 'כאן ספורט',
    description: 'כל התקצירים, השידורים החיים וחדשות אחרונות מגביע העולם 2026 — ישודר בכאן 11 ובכאן BOX.',
    isSourceLogoFallback: true,
  },
  {
    title: '"הפתעה עולמית. שילוב ניימאר מעורר ספק" — ניתוח הסגל הברזילאי',
    link: 'https://www.sport5.co.il/articles.aspx?FolderID=5166&docID=545020',
    pubDate: '2026-05-17T15:00:00Z',
    source: 'Sport5',
    description: 'ברזיל הכריזה על הסגל הסופי למונדיאל 2026, כולל ניימאר בקאמבק מפתיע. המומחים חלוקים.',
    isSourceLogoFallback: true,
  },
  {
    title: 'מונדיאל 2026: הסגלים המלאים של כל 48 הנבחרות',
    link: 'https://www.israelhayom.co.il/sport/world-soccer/article/20559902',
    pubDate: '2026-05-29T11:00:00Z',
    source: 'ישראל היום',
    description: 'כל 48 הנבחרות קבעו את הרכביהן הסופיים למונדיאל 2026 — מי הכוכבים שפוספסו ומי ההפתעות?',
    isSourceLogoFallback: true,
  },
  {
    title: 'אירוע הספורט הגדול בתבל: מונדיאל 2026 — מנוע צמיחה של 41 מיליארד דולר',
    link: 'https://www.ynet.co.il/economy/article/yokra14772675',
    pubDate: '2026-04-22T09:00:00Z',
    source: 'Ynet כלכלה',
    description: 'מונדיאל 2026 צפוי להוסיף 41 מיליארד דולר לתמ"ג העולמי וליצור כ-824,000 משרות חדשות.',
    isSourceLogoFallback: true,
  },
  {
    title: 'מסי, ימאל או אמבאפה — מי יזכה במונדיאל 2026?',
    link: 'https://www.ynet.co.il/sport/worldsoccer/article/hyw2jern11x',
    pubDate: '2026-06-03T09:00:00Z',
    source: 'Ynet ספורט',
    description: 'ספרד (16%), צרפת (13%), אנגליה (11%), ארגנטינה (10%) — הפייבוריטיות לזכייה לפי Opta.',
    isSourceLogoFallback: true,
  },
  {
    title: 'הכדורגל הישן מת: 10 הטכנולוגיות שיכריעו את מונדיאל 2026',
    link: 'https://www.israelhayom.co.il/tech/tech-news/article/20664362',
    pubDate: '2026-05-25T10:00:00Z',
    source: 'ישראל היום',
    description: 'VAR משופר, AI לזיהוי עמידות ופריצות, כדור חכם — הטכנולוגיות שישנו את מונדיאל 2026.',
    isSourceLogoFallback: true,
  },
  {
    title: 'תפתחו שעונים: החוקים החדשים במונדיאל 2026',
    link: 'https://www.israelhayom.co.il/sport/world-soccer/article/20659470',
    pubDate: '2026-05-28T12:00:00Z',
    source: 'ישראל היום',
    description: 'מלחמה בבזבוזי זמן, שינויי VAR, כרטיסי צהוב-אדום — FIFA משנה את פני המשחק במונדיאל.',
    isSourceLogoFallback: true,
  },
  {
    title: 'האצטדיונים, הנבחרות ומיליארדי הדולרים: כל המספרים של מונדיאל 2026',
    link: 'https://www.mako.co.il/news-sport/world_soccer-2026_q2/Article-0579730f24c8e91027.htm',
    pubDate: '2026-05-31T08:00:00Z',
    source: 'N12 ספורט',
    description: '1,248 שחקנים, 104 משחקים, 16 ערים, 6 שבועות — כל הנתונים של הטורניר הגדול בהיסטוריה.',
    isSourceLogoFallback: true,
  },
  {
    title: 'זה הסיפור הגדול של מונדיאל 2026 — עוד לפני שנבעט כדור',
    link: 'https://www.kan.org.il/content/kan-news/sport/1032967/',
    pubDate: '2026-05-30T11:00:00Z',
    source: 'כאן ספורט',
    description: 'הטורניר הראשון עם 48 נבחרות — המשמעות ההיסטורית, הגיאופוליטית והספורטיבית.',
    isSourceLogoFallback: true,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();
}

function tag(block: string, name: string): string {
  const cdata = block.match(new RegExp(`<${name}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${name}>`, 'i'));
  if (cdata?.[1]) return cdata[1];
  return block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '';
}

function sourceLogo(source: string) {
  const color = source === 'Sport5' ? '#1d4ed8'
    : source === 'ONE' ? '#2563eb'
    : source === 'כלכליסט' ? '#d97706'
    : source === 'ישראל היום' ? '#7c3aed'
    : source === 'כאן ספורט' ? '#059669'
    : '#6b7280';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="${color}"/><text x="480" y="285" text-anchor="middle" font-family="Arial,sans-serif" font-size="72" font-weight="800" fill="white">${source}</text><text x="480" y="350" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="600" fill="rgba(255,255,255,.75)">World Cup 2026</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function parseItems(xml: string, source: (typeof RSS_SOURCES)[number]): WorldCupNewsItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocks.slice(0, 15).map((block) => {
    const enclosure = block.match(/<enclosure[^>]*url=["']([^"']+)["']/i)?.[1];
    const media = block.match(/<media:content[^>]*url=["']([^"']+)["']/i)?.[1]
      || block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i)?.[1];
    const link = decodeHtml(tag(block, 'link')) || source.sourceUrl;
    const title = decodeHtml(tag(block, 'title'));
    const description = decodeHtml(tag(block, 'description')).slice(0, 220);
    const imageUrl = enclosure || media;
    return {
      title,
      link,
      pubDate: decodeHtml(tag(block, 'pubDate')) || new Date().toISOString(),
      source: source.name,
      description,
      imageUrl: imageUrl || sourceLogo(source.name),
      isSourceLogoFallback: !imageUrl,
    };
  }).filter((item) => item.title && isWorldCupArticle(item.title, item.description));
}

async function fetchSource(source: (typeof RSS_SOURCES)[number]) {
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; TVIndustryIL/2.8; +https://tv-industry-il.vercel.app)',
      },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return [];
    return parseItems(await response.text(), source);
  } catch {
    return [];
  }
}

export async function GET() {
  const results = await Promise.allSettled(RSS_SOURCES.map(fetchSource));
  const liveItems = results
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 30);

  // Supplement with hardcoded fallback if live feed is sparse
  const items: WorldCupNewsItem[] = liveItems.length >= 6
    ? liveItems
    : [
        ...liveItems,
        ...FALLBACK_ITEMS.filter((fb) => !liveItems.some((li) => li.link === fb.link)),
      ].slice(0, 30);

  return NextResponse.json({ success: true, items }, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
  });
}
