import type { Concert, LibraryResponse } from '../types'

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

const fileDate = () => new Date().toISOString().slice(0, 10)
const escapeCalendarText = (value: string) => value
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\n/g, '\\n')

const calendarDate = (date: string, offsetDays = 0) => {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + offsetDays)
  return value.toISOString().slice(0, 10).replace(/-/g, '')
}

export function downloadJsonBackup(library: LibraryResponse) {
  const payload = {
    format: 'encore-concert-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    ...library,
  }
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `encore-backup-${fileDate()}.json`,
  )
}

export function upcomingConcertCalendar(concerts: Concert[], today = fileDate()) {
  const events = concerts
    .filter((concert) => concert.status === 'Want to Go' && concert.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((concert) => [
      'BEGIN:VEVENT',
      `UID:${concert.id}@encore-concert-tracker`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART;VALUE=DATE:${calendarDate(concert.date)}`,
      `DTEND;VALUE=DATE:${calendarDate(concert.date, 1)}`,
      `SUMMARY:${escapeCalendarText(concert.artist)}`,
      `LOCATION:${escapeCalendarText(concert.venue)}`,
      `DESCRIPTION:${escapeCalendarText([concert.tour, concert.notes].filter(Boolean).join('\n'))}`,
      'END:VEVENT',
    ].join('\r\n'))
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Encore Concert Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function downloadUpcomingCalendar(concerts: Concert[]) {
  const upcomingCount = concerts.filter((concert) => concert.status === 'Want to Go' && concert.date >= fileDate()).length
  if (!upcomingCount) throw new Error('There are no upcoming concerts to add to a calendar.')
  downloadBlob(
    new Blob([upcomingConcertCalendar(concerts)], { type: 'text/calendar;charset=utf-8' }),
    `encore-upcoming-${fileDate()}.ics`,
  )
}

export { downloadBlob }
