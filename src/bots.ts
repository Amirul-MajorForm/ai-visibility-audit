export interface Bot {
  token: string; // robots.txt user-agent token
  company: string;
  product: string;
  purpose: 'training' | 'search' | 'user';
  /** Full UA string for the live test. Some tokens are robots.txt-only and never fetch. */
  ua?: string;
}

/**
 * purpose:
 *  - search: builds the index an assistant searches when answering. Blocking = not cited.
 *  - user:   fetches a page live when a person asks the assistant about it.
 *  - training: collects data to train future models. Blocking is a legitimate business choice.
 */
export const BOTS: Bot[] = [
  { token: 'OAI-SearchBot', company: 'OpenAI', product: 'ChatGPT search', purpose: 'search', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot' },
  { token: 'ChatGPT-User', company: 'OpenAI', product: 'ChatGPT browsing', purpose: 'user', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot' },
  { token: 'GPTBot', company: 'OpenAI', product: 'Model training', purpose: 'training', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot' },
  { token: 'Claude-SearchBot', company: 'Anthropic', product: 'Claude search', purpose: 'search', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +searchbot@anthropic.com)' },
  { token: 'Claude-User', company: 'Anthropic', product: 'Claude browsing', purpose: 'user', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)' },
  { token: 'ClaudeBot', company: 'Anthropic', product: 'Model training', purpose: 'training', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)' },
  { token: 'Googlebot', company: 'Google', product: 'Google Search, AI Overviews, Gemini', purpose: 'search', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
  { token: 'Google-Extended', company: 'Google', product: 'Gemini training', purpose: 'training' },
  { token: 'Bingbot', company: 'Microsoft', product: 'Bing, Copilot (also feeds ChatGPT search)', purpose: 'search', ua: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)' },
  { token: 'PerplexityBot', company: 'Perplexity', product: 'Perplexity search', purpose: 'search', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)' },
  { token: 'Perplexity-User', company: 'Perplexity', product: 'Perplexity browsing', purpose: 'user', ua: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)' },
  { token: 'Applebot-Extended', company: 'Apple', product: 'Apple Intelligence training', purpose: 'training' },
  { token: 'CCBot', company: 'Common Crawl', product: 'Open dataset used by many AI models', purpose: 'training', ua: 'CCBot/2.0 (https://commoncrawl.org/faq/)' },
];
