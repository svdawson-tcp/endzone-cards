/**
 * Builds an .ics calendar file with EndZone's money reminders, so Colton gets
 * phone alerts even when the app is closed. Pure string building; no network.
 *
 * Times are "floating" local times (no time zone), so 9:00 means 9:00 wherever the phone is.
 * Dates are YYYY-MM-DD business dates (see dateUtils, ISS-003).
 */

export type CalendarSettings = {
  /** ISO weekday: 1 = Monday ... 7 = Sunday */
  transferWeekday: number;
  /** First date the weekly and monthly events start (YYYY-MM-DD) */
  startDate: string;
  /** Estimated tax due dates from tax_estimate_schedule */
  estimateDueDates: { due_date: string; tax_period: string }[];
  /** First year the PA annual report is due */
  annualReportFrom: number;
  /** Year-end reminder starts in this January */
  yearEndFrom: number;
};

const ICS_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const compactDate = (d: string) => d.replace(/-/g, "");

/** RFC 5545 text escaping */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** RFC 5545 line folding at 75 octets (ASCII content here) */
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  out.push(rest);
  return out.join("\r\n");
};

/** Next date on or after `from` that falls on the ISO weekday */
export const nextWeekday = (from: string, isoWeekday: number): string => {
  const [y, m, d] = from.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const current = ((date.getUTCDay() + 6) % 7) + 1; // 1..7, Monday = 1
  date.setUTCDate(date.getUTCDate() + ((isoWeekday - current + 7) % 7));
  return date.toISOString().slice(0, 10);
};

/** First Monday of a month that falls on or after `from` */
export const firstMondayOnOrAfter = (from: string): string => {
  const [y, m] = from.split("-").map(Number);
  const thisMonth = nextWeekday(`${y}-${String(m).padStart(2, "0")}-01`, 1);
  if (thisMonth >= from) return thisMonth;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return nextWeekday(`${ny}-${String(nm).padStart(2, "0")}-01`, 1);
};

/** Day after a YYYY-MM-DD date (all-day events end exclusively) */
const nextDay = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
};

type CalEvent = {
  uid: string;
  summary: string;
  description: string;
  /** All-day when time is omitted */
  date: string;
  time?: string; // HH:MM
  rrule?: string;
  alarm: string; // e.g. -PT0M, -P7D
};

const eventLines = (e: CalEvent, stamp: string): string[] => {
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}@endzone`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(e.summary)}`, `DESCRIPTION:${esc(e.description)}`];
  if (e.time) {
    const t = e.time.replace(":", "") + "00";
    lines.push(`DTSTART:${compactDate(e.date)}T${t}`, "DURATION:PT15M");
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date)}`, `DTEND;VALUE=DATE:${compactDate(nextDay(e.date))}`);
  }
  if (e.rrule) lines.push(`RRULE:${e.rrule}`);
  lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.summary)}`, `TRIGGER:${e.alarm}`, "END:VALARM", "END:VEVENT");
  return lines;
};

export function buildMoneyCalendar(s: CalendarSettings, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const startYear = Number(s.startDate.slice(0, 4));
  const events: CalEvent[] = [
    {
      uid: "weekly-tax-transfer",
      summary: "EndZone: move last week's tax money",
      description: "Open EndZone > Tax to see the amount, send it from Operating to Tax, then tap I SENT IT.",
      date: nextWeekday(s.startDate, s.transferWeekday),
      time: "09:00",
      rrule: `FREQ=WEEKLY;BYDAY=${ICS_DAYS[s.transferWeekday - 1]}`,
      alarm: "-PT0M",
    },
    {
      uid: "monthly-bank-check",
      summary: "EndZone: check accounts against the bank",
      description: "Open EndZone > Accounts, tap each account and use Check vs bank.",
      date: firstMondayOnOrAfter(s.startDate), // DTSTART must be a real occurrence
      time: "09:00",
      rrule: "FREQ=MONTHLY;BYDAY=1MO",
      alarm: "-PT0M",
    },
    {
      uid: "year-end-accountant",
      summary: "EndZone: send your books to the accountant",
      description: "Collect 1099-K forms from eBay, Whatnot and PayPal and send them with your EndZone export.",
      date: `${Math.max(s.yearEndFrom, startYear)}-01-31`,
      rrule: "FREQ=YEARLY",
      alarm: "-P14D",
    },
    {
      uid: "pa-annual-report",
      summary: "PA LLC annual report due",
      description: "File for CS Sports Cards & Collectibles LLC at file.dos.pa.gov.",
      date: `${Math.max(s.annualReportFrom, startYear)}-09-30`,
      rrule: "FREQ=YEARLY",
      alarm: "-P14D",
    },
    ...s.estimateDueDates.map((d) => ({
      uid: `estimated-tax-${d.tax_period}`,
      summary: `Estimated tax due (${d.tax_period.replace("-", " ")})`,
      description: "Pay the IRS and PA estimates, then record each payment in EndZone > Tax.",
      date: d.due_date,
      alarm: "-P7D",
    })),
  ];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EndZone//Money reminders//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:EndZone money",
    ...events.flatMap((e) => eventLines(e, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Triggers a browser download of the calendar file. */
export function downloadCalendarFile(ics: string, filename = "endzone-money-reminders.ics") {
  // iPhone/iPad Safari saves blob downloads to Files; opening the calendar data directly
  // shows the "Add All to Calendar" sheet instead. Needs a check on Colton's phone.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
    return;
  }
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
