/** Only a GopherAtlas page path; never a curated article's external source URL. */
export function shareLinks(path: string, title: string) {
  if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+$/.test(path))
    throw Error('invalid_share_path');
  const url = `https://gopheratlas.com${path}`;
  const intent = (base: string, values: Record<string, string>) =>
    `${base}?${new URLSearchParams(values)}`;
  return {
    url,
    links: [
      {
        name: 'X',
        icon: 'xLogo' as const,
        href: intent('https://twitter.com/intent/tweet', { text: title, url }),
      },
      {
        name: 'Reddit',
        icon: 'reddit' as const,
        href: intent('https://www.reddit.com/submit', { url, title }),
      },
      {
        name: 'Bluesky',
        icon: 'bluesky' as const,
        href: intent('https://bsky.app/intent/compose', {
          text: `${title}\n${url}`,
        }),
      },
      {
        name: 'Hacker News',
        icon: 'hackerNews' as const,
        href: intent('https://news.ycombinator.com/submitlink', {
          u: url,
          t: title,
        }),
      },
    ],
  };
}
