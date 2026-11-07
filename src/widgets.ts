export type WidgetKind = 'booking' | 'reservation' | 'ordering' | 'shop';

/** Third-party platforms whose content is loaded by JavaScript, so AI crawlers usually cannot read it. */
export const WIDGETS: { name: string; kind: WidgetKind; re: RegExp }[] = [
  // Appointments and class booking
  { name: 'Mindbody', kind: 'booking', re: /mindbodyonline\.com|healcode\.com/i },
  { name: 'Glofox', kind: 'booking', re: /glofox\.com/i },
  { name: 'Vibefam', kind: 'booking', re: /vibefam\.com/i },
  { name: 'Momence', kind: 'booking', re: /momence\.com/i },
  { name: 'Zen Planner', kind: 'booking', re: /zenplanner\.com/i },
  { name: 'TeamUp', kind: 'booking', re: /goteamup\.com/i },
  { name: 'Arketa', kind: 'booking', re: /arketa\.co/i },
  { name: 'Mariana Tek', kind: 'booking', re: /marianatek\.com|marianaiframes\.com/i },
  { name: 'WellnessLiving', kind: 'booking', re: /wellnessliving\.com/i },
  { name: 'bsport', kind: 'booking', re: /bsport\.io/i },
  { name: 'Fresha', kind: 'booking', re: /fresha\.com/i },
  { name: 'Vagaro', kind: 'booking', re: /vagaro\.com/i },
  { name: 'Booksy', kind: 'booking', re: /booksy\.com/i },
  { name: 'Setmore', kind: 'booking', re: /setmore\.com/i },
  { name: 'Square Appointments', kind: 'booking', re: /squareup\.com\/appointments|square\.site\/book/i },
  { name: 'Acuity Scheduling', kind: 'booking', re: /acuityscheduling\.com/i },
  { name: 'Calendly', kind: 'booking', re: /calendly\.com/i },
  { name: 'SimplyBook.me', kind: 'booking', re: /simplybook\.(me|it|asia)/i },
  { name: 'Cliniko', kind: 'booking', re: /cliniko\.com/i },
  { name: 'Jane App', kind: 'booking', re: /janeapp\.com/i },
  { name: 'Eversports', kind: 'booking', re: /eversports\.(com|de|sg)/i },
  // Restaurant reservations
  { name: 'Chope', kind: 'reservation', re: /chope\.co/i },
  { name: 'OpenTable', kind: 'reservation', re: /opentable\.(com|sg)/i },
  { name: 'SevenRooms', kind: 'reservation', re: /sevenrooms\.com/i },
  { name: 'TableCheck', kind: 'reservation', re: /tablecheck\.com/i },
  { name: 'Quandoo', kind: 'reservation', re: /quandoo\./i },
  { name: 'Resy', kind: 'reservation', re: /resy\.com/i },
  { name: 'Tock', kind: 'reservation', re: /exploretock\.com/i },
  // Online ordering
  { name: 'Oddle', kind: 'ordering', re: /oddle\.me/i },
  { name: 'ChowNow', kind: 'ordering', re: /chownow\.com/i },
  { name: 'Toast', kind: 'ordering', re: /toasttab\.com/i },
];

export const WIDGET_KIND_LABEL: Record<WidgetKind, string> = {
  booking: 'booking or scheduling',
  reservation: 'table reservations',
  ordering: 'online ordering',
  shop: 'online shop',
};

export function detectWidgets(urls: string[]): string[] {
  return WIDGETS.filter((w) => urls.some((u) => w.re.test(u))).map((w) => w.name);
}

export const widgetKind = (name: string) => WIDGETS.find((w) => w.name === name)?.kind ?? 'booking';
