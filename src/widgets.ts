/** Booking / timetable platforms common with fitness studios. Their content is loaded by JavaScript. */
export const WIDGETS: { name: string; re: RegExp }[] = [
  { name: 'Mindbody', re: /mindbodyonline\.com|healcode\.com|brandedweb\.mindbodyonline/i },
  { name: 'Glofox', re: /glofox\.com/i },
  { name: 'Vibefam', re: /vibefam\.com/i },
  { name: 'Momence', re: /momence\.com/i },
  { name: 'Zen Planner', re: /zenplanner\.com/i },
  { name: 'TeamUp', re: /goteamup\.com/i },
  { name: 'Arketa', re: /arketa\.co/i },
  { name: 'Mariana Tek', re: /marianatek\.com|marianaiframes\.com/i },
  { name: 'WellnessLiving', re: /wellnessliving\.com/i },
  { name: 'bsport', re: /bsport\.io/i },
  { name: 'Pike13', re: /pike13\.com/i },
  { name: 'PushPress', re: /pushpress\.com/i },
  { name: 'Virtuagym', re: /virtuagym\.com/i },
  { name: 'Hapana', re: /hapana\.com/i },
  { name: 'Eversports', re: /eversports\.(com|de|sg)/i },
  { name: 'ClassPass', re: /classpass\.com/i },
  { name: 'Acuity Scheduling', re: /acuityscheduling\.com/i },
  { name: 'Calendly', re: /calendly\.com/i },
  { name: 'SimplyBook.me', re: /simplybook\.(me|it|asia)/i },
  { name: 'Trainerize', re: /trainerize\.(com|me)/i },
];

export function detectWidgets(urls: string[]): string[] {
  return WIDGETS.filter((w) => urls.some((u) => w.re.test(u))).map((w) => w.name);
}
