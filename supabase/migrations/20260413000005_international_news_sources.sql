-- Add international and border-crossing news sources to the digest feed registry.

INSERT INTO news_sources (name, feed_url, source_type, priority, notes) VALUES
  (
    'Google News — US passport transgender policy',
    'https://news.google.com/rss/search?q=transgender+passport+%22gender+marker%22+OR+%22name+change%22+US+policy&hl=en-US&gl=US&ceid=US:en',
    'rss', 9,
    'Google News RSS: US passport and ID policy changes affecting trans travelers'
  ),
  (
    'Google News — Canada travel advisory LGBTQ US',
    'https://news.google.com/rss/search?q=Canada+%22travel+advisory%22+OR+%22travel+warning%22+LGBTQ+OR+transgender+United+States&hl=en-US&gl=US&ceid=US:en',
    'rss', 10,
    'Google News RSS: Canadian travel warnings about the US for LGBTQ travelers'
  ),
  (
    'Google News — border crossing transgender',
    'https://news.google.com/rss/search?q=transgender+%22border+crossing%22+OR+%22CBP%22+OR+%22customs%22+OR+%22TSA%22&hl=en-US&gl=US&ceid=US:en',
    'rss', 9,
    'Google News RSS: border crossing and TSA issues affecting trans travelers'
  ),
  (
    'Google News — Mexico Canada trans travel',
    'https://news.google.com/rss/search?q=transgender+travel+Mexico+OR+Canada+safety+OR+rights+OR+policy&hl=en-US&gl=US&ceid=US:en',
    'rss', 7,
    'Google News RSS: trans travel conditions in Mexico and Canada'
  )
ON CONFLICT (feed_url) DO NOTHING;
