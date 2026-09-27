export interface VerifiedSetlistTrack {
  title: string
  performer: string
  note?: string
  timecode?: string
  segment?: string
}

export interface VerifiedSetlist {
  sourceUrl: string
  tracks: VerifiedSetlistTrack[]
}

const esdeekidRebelToronto: VerifiedSetlist = {
  sourceUrl: 'https://www.setlist.fm/setlist/esdeekid/2026/rebel-toronto-on-canada-3b70cca8.html',
  tracks: [
    { title: 'Rottweiler', performer: 'EsDeeKid' },
    { title: '4 Raws', performer: 'EsDeeKid' },
    { title: 'Phantom', performer: 'EsDeeKid' },
    { title: 'Century', performer: 'EsDeeKid' },
    { title: 'Panic', performer: 'EsDeeKid' },
    { title: 'Century', performer: 'EsDeeKid' },
    { title: 'Omens', performer: 'EsDeeKid' },
    { title: 'Tartan', performer: 'EsDeeKid' },
    { title: 'RockWave', performer: 'EsDeeKid' },
    { title: 'Prague', performer: 'EsDeeKid' },
    { title: 'Apathy', performer: 'EsDeeKid' },
    { title: "Warmin' Up", performer: 'EsDeeKid' },
    { title: 'Ferragamo', performer: 'EsDeeKid' },
    { title: 'Cali Man', performer: 'EsDeeKid' },
    { title: 'Phantom', performer: 'EsDeeKid', note: 'Rico Ace joined on stage' },
    { title: 'Risk', performer: 'Rico Ace', note: 'Rico Ace cover' },
    { title: 'Malibu', performer: 'Rico Ace', note: 'Rico Ace cover' },
    { title: 'Treason', performer: 'Rico Ace', note: 'Rico Ace cover' },
    { title: 'Oh No', performer: 'Rico Ace', note: 'Rico Ace cover' },
    { title: 'SKATTI', performer: 'Rico Ace', note: 'Rico Ace cover' },
    { title: 'Bally', performer: 'Rico Ace', note: 'Rico Ace cover' },
    { title: 'LV Sandals', performer: 'EsDeeKid, Rico Ace', note: 'With Rico Ace' },
    { title: 'Dope Boyz', performer: 'Rico Ace, EsDeeKid', note: 'Rico Ace cover with EsDeeKid' },
    { title: 'Mist', performer: 'EsDeeKid, Rico Ace', note: 'With Rico Ace' },
    { title: 'Palaces', performer: 'EsDeeKid, Rico Ace', note: 'With Rico Ace' },
    { title: 'Century', performer: 'EsDeeKid' },
    { title: 'Phantom', performer: 'EsDeeKid, Rico Ace', note: 'With Rico Ace', segment: 'Encore' },
  ],
}

export const verifiedSetlistsByConcertId: Record<string, VerifiedSetlist> = {
  '2ce536c3-9cb4-4739-ac89-622465df5976': esdeekidRebelToronto,
}

export const spotifySearchUrl = (track: VerifiedSetlistTrack) =>
  `https://open.spotify.com/search/${encodeURIComponent(`${track.performer} ${track.title}`)}`
