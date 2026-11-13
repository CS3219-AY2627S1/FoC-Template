export function minutesSince(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

const dateFormat = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Singapore',
});

export function formatDateTime(iso: string) {
  return dateFormat.format(new Date(iso));
}
