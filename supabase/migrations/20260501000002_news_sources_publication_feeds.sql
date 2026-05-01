insert into news_sources (name, feed_url, source_type, is_active, priority, notes) values
  ('Erin In The Morning',        'https://www.erininthemorning.com/feed',                    'rss', true, 9, 'Journalist Erin Reed covers trans legislation and policy specifically'),
  ('GLAAD',                      'https://glaad.org/feed/',                                  'rss', true, 8, 'Major advocacy org - policy shifts and media representation'),
  ('Transgender Law Center Blog','https://transgenderlawcenter.org/feed/',                   'rss', true, 8, 'Legal org - case updates often appear before mainstream coverage'),
  ('Advocates for Trans Equality','https://transequality.org/blog/feed',                     'rss', true, 8, 'National policy org - legislative tracking and federal policy'),
  ('The Guardian - Transgender', 'https://www.theguardian.com/society/transgender/rss',      'rss', true, 8, 'Major newspaper - solid mainstream context'),
  ('Advocate - Transgender',     'https://www.advocate.com/feeds/transgender.rss',           'rss', true, 8, 'Leading US LGBTQ+ news outlet'),
  ('The TransAdvocate',          'https://www.transadvocate.com/feed',                       'rss', true, 7, 'Trans-specific journalism - on-the-ground reporting'),
  ('PinkNews - Transgender',     'https://www.pinknews.co.uk/topic/transgender/feed/',        'rss', true, 7, 'UK-based but covers US policy well')
on conflict (feed_url) do nothing;
