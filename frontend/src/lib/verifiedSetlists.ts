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
  isPartial?: boolean
}

type TrackEntry = string | [title: string, note?: string, performer?: string]

const setlist = (sourceUrl: string, performer: string, entries: TrackEntry[], isPartial = false): VerifiedSetlist => ({
  sourceUrl,
  isPartial,
  tracks: entries.map((entry) => typeof entry === 'string'
    ? { title: entry, performer }
    : { title: entry[0], performer: entry[2] || performer, ...(entry[1] ? { note: entry[1] } : {}) }),
})

export const verifiedSetlistsByConcertId: Record<string, VerifiedSetlist> = {
  // 2026
  '2ce536c3-9cb4-4739-ac89-622465df5976': {
    sourceUrl: 'https://www.setlist.fm/setlist/esdeekid/2026/rebel-toronto-on-canada-3b70cca8.html',
    tracks: [
      { title: 'Rottweiler', performer: 'EsDeeKid' }, { title: '4 Raws', performer: 'EsDeeKid' },
      { title: 'Phantom', performer: 'EsDeeKid' }, { title: 'Century', performer: 'EsDeeKid' },
      { title: 'Panic', performer: 'EsDeeKid' }, { title: 'Century', performer: 'EsDeeKid' },
      { title: 'Omens', performer: 'EsDeeKid' }, { title: 'Tartan', performer: 'EsDeeKid' },
      { title: 'RockWave', performer: 'EsDeeKid' }, { title: 'Prague', performer: 'EsDeeKid' },
      { title: 'Apathy', performer: 'EsDeeKid' }, { title: "Warmin' Up", performer: 'EsDeeKid' },
      { title: 'Ferragamo', performer: 'EsDeeKid' }, { title: 'Cali Man', performer: 'EsDeeKid' },
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
  },
  '3fcf2f9b-eaab-47ab-bab3-ca989b260762': setlist('https://www.setlist.fm/setlist/don-toliver/2026/scotiabank-arena-toronto-on-canada-23723ceb.html', 'Don Toliver', [
    'E85', 'OPPOSITE', 'Secondhand', 'Rendezvous', 'ATM', 'Call Back', 'Cardigan', 'No Idea', 'You', 'Body', 'NEW DROP', 'Gemstone',
    ['OK', 'Ye cover', 'Ye'], 'Excavator', 'TORE UP', 'K9', ['No Pole', 'Played from tape'],
    ['Too Much Money in Here', 'New song, played from tape'], ['Clap', 'New song, played from tape'], ['After Party', 'Played from tape'],
    ['3am', 'DJ played this Loe Shimmy song while Don was backstage', 'Loe Shimmy'], 'TMU', 'Tuition',
    ['Lemonade', 'Internet Money song, played from tape', 'Internet Money'], ['Shabang / Burning Bridges', 'Drake cover with Drake', 'Drake'],
    ['Janice STFU', 'Drake cover with Drake', 'Drake'], ["CAN'T SAY", 'Travis Scott cover', 'Travis Scott'],
    ['BANDIT', 'Played from tape'], ['E85', 'Repeated'], ['Sweet Home', 'Played from tape'],
  ]),
  'fcabff7d-0ef1-5870-9e14-64b3bc17cf65': setlist('https://www.setlist.fm/setlist/j-cole/2026/scotiabank-arena-toronto-on-canada-4b4b633a.html', 'J. Cole', [
    '39 Intro', 'Two Six', 'SAFETY', 'Run a Train', 'Poor Thang', ['Legacy', 'With PJ'], 'A Tale of 2 Citiez', 'Fire Squad', 'WHO TF IZ U', 'Old Dog', 'MIDDLE CHILD', ['a lot', '21 Savage cover', '21 Savage'], ["Johnny P's Caddy", 'Benny the Butcher cover', 'Benny the Butcher'], 'Lights Please', '2Face', 'In the Morning', "Nobody's Perfect", 'Work Out', "Can't Get Enough", ['The London', 'Young Thug cover', 'Young Thug'], 'She Knows', 'Drum n Bass', 'The Let Out', 'Bombs in the Ville/Hit the Gas', 'Wet Dreamz', 'G.O.M.D.', 'Life Sentence', 'Love Yourz', 'Power Trip', ['Planez', 'Jeremih cover', 'Jeremih'], ['Deja Vu', 'Snippet'], 'No Role Modelz', 'Quik Stop',
  ]),
  '04bec49d-14ed-5479-bedf-74de4132a556': setlist('https://www.setlist.fm/setlist/don-toliver/2026/scotiabank-arena-toronto-on-canada-3b4b90a8.html', 'Don Toliver', [
    'E85', 'OPPOSITE', 'Secondhand', 'Rendezvous', 'ATM', 'Call Back', 'Cardigan', 'No Idea', 'You', 'Body', 'Gemstone', 'Excavator', 'TORE UP', 'K9',
    ['Lemonade', 'Internet Money song, played from tape', 'Internet Money'], ['Private Landing', 'Played from tape'], ['FWU', 'Played from tape'],
    ['ATTITUDE', 'Played from tape'], ['Bus Stop', 'Played from tape'], ['NEW DROP', 'Played from tape'],
    ['3am', 'Loe Shimmy song played during the break', 'Loe Shimmy'], 'TMU', 'Tiramisu', 'Tuition',
  ]),
  'bd308481-3718-53d4-a746-6fc2d48beec6': setlist('https://www.setlist.fm/setlist/aap-rocky/2026/scotiabank-arena-toronto-on-canada-6b4a362e.html', 'A$AP Rocky', [
    'Grim Freestyle', 'Trunks', 'HIGHJACK', 'ORDER OF PROTECTION', 'HELICOPTER', 'STOLE YA FLOW', 'A$AP Forever', 'STOP SNITCHING', 'PLAYA', 'Tailor Swif',
    "RIOT (Rowdy Pipe'n)", 'STFU', 'PUNK ROCKY', 'Sundress', 'Praise the Lord (Da Shine)', 'GEMSTONEZ ITZ THA GR1M',
    ['Slob on My Knob / Plain Jane / No Limit', 'Medley'], ['DECEMBER 31ST', 'Ty Dolla $ign cover', 'Ty Dolla $ign'], 'Yamborghini High', 'Telephone Calls',
    ['Hella Hoes', 'A$AP Mob song', 'A$AP Mob'], 'Purple Swag', 'Peso', 'LVL', 'Wassup',
  ]),
  '296e0341-ef37-5b5e-a741-6ee00f13f189': setlist('https://www.setlist.fm/setlist/dave/2026/coca-cola-coliseum-toronto-on-canada-134c6d1d.html', 'Dave', [
    'History', 'No Weapons', 'Verdansk', 'Clash', 'System', 'Both Sides of a Smile', 'Screwface Capital', 'Location', 'Thiago Silva', 'No Words', 'Professor X',
    'Funky Friday', 'Victory Lap Freestyle', 'Titanium', 'Selfish', 'The Boy Who Played the Harp', ['Sprinter', 'Dave & Central Cee song', 'Dave, Central Cee'], 'Raindance', 'Starlight',
  ]),
  '2d804128-50e1-4498-bf2a-7028084a5d0a': setlist('https://www.jambase.com/show/train-rbc-amphitheatre-20260804', 'Train', [
    ['She’s on Fire', 'Train set; show source lists both artist sets'], ['50 Ways to Say Goodbye', 'Train set'], ['If It’s Love', 'Train set'], ['Play That Song', 'Train set'], ['Jack & Diane', 'Train set; John Mellencamp cover', 'John Mellencamp'],
    ['Calling All Angels', 'Train set'], ['Meet Virginia', 'Train set'], ['Take Me Home, Country Roads', 'Train set; John Denver cover', 'John Denver'], ['To Gloria', 'Train set'], ['Mississippi', 'Train set'],
    ['Marry Me', 'Train set'], ['Stone in Love', 'Train set; Journey cover', 'Journey'], ['Save Me, San Francisco', 'Train set'], ['Hey, Soul Sister', 'Train set'], ['Drive By', 'Train set'], ['Drops of Jupiter', 'Train set'],
    ["Lookin' Up", 'Barenaked Ladies set', 'Barenaked Ladies'], ['The Old Apartment', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Gonna Walk', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Just Wait', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Falling for the First Time', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Big Back Yard', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Pinch Me', 'Barenaked Ladies set', 'Barenaked Ladies'], ['One Night', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Raisins', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Blame It on Me', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Brian Wilson', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Almost Ready', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Big Bang Theory Theme', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Jim Creeggan Upright Bass Solo / The Muppet Show Theme', 'Barenaked Ladies set', 'Barenaked Ladies'], ['One Week', 'Barenaked Ladies set', 'Barenaked Ladies'], ['If I Had $1000000', 'Barenaked Ladies set', 'Barenaked Ladies'], ['Pink Pony Club / TEXAS HOLD ’EM / The Gambler / HOT TO GO! / Sometimes When We Touch / So Long, Farewell', 'Barenaked Ladies medley', 'Barenaked Ladies'], ['Highway to Hell', 'Barenaked Ladies set; AC/DC cover', 'AC/DC'], ['Lovin’ Life', 'Barenaked Ladies set', 'Barenaked Ladies'],
  ]),
  // 2025
  '6b11b080-c70d-5f25-ae00-ce02f301f28c': setlist('https://www.setlist.fm/setlist/sabrina-carpenter/2025/scotiabank-arena-toronto-on-canada-5b5b33a4.html', 'Sabrina Carpenter', [
    ['Morning', 'Opening section label'], 'Taste', 'Good Graces', 'Manchild', 'Slim Pickins', 'Tornado Warnings', 'Lie to Girls', ['decode', 'Snippet'], 'Bed Chem', 'Feather', 'Fast Times', 'Busy Woman',
    'Sharpest Tool', ['opposite', 'Snippet'], 'because i liked a boy', 'Coincidence', 'Bad Reviews', 'House Tour', 'Nonsense', 'Dumb & Poetic', 'Juno', 'Please Please Please', 'Tears', "Don't Smile", 'Espresso',
  ]),
  'ca99eddc-23fa-51c1-bf5e-cb7e8188d8a9': setlist('https://www.setlist.fm/setlist/jid/2025/rebel-toronto-on-canada-5b4e1b38.html', 'JID', [
    'YouUgly', 'Glory', 'Community', 'VCRs', 'Gz', 'Crack Sandwich', 'Workin Out', 'Kody Blu 31', 'Stars', 'And We Vibing', 'On McAfee', 'Sk8',
  ], true),
  'c1e6f502-3886-5efa-a318-14f7f62e1a0c': setlist('https://www.setlist.fm/setlist/kali-uchis/2025/scotiabank-arena-toronto-on-canada-2b479406.html', 'Kali Uchis', [
    'Heaven is a Home…', 'Sugar! Honey! Love!', 'Lose My Cool', "It's Just Us", 'For: You', 'Silk Lingerie', 'All I Can Say', 'Daggers!', 'Angels All Around Me…', 'Sunshine & Rain...',
    'Muñekita', 'Labios mordidos', '¿Cómo así?', 'Me pongo loca', 'Pensamientos intrusivos', ['Sad Girlz Luv Money', 'Amaarae cover', 'Amaarae'], 'Diosa', ['SI NO ES CONTIGO', 'Cris MJ cover', 'Cris MJ'],
    'Dame beso // Muévete', 'Igual que un ángel', 'Sycamore Tree', 'Speed', 'Rush', 'Loner', 'Melting', 'Your Teeth in My Neck', 'Dead to Me', 'After the Storm',
    ['See You Again', 'Tyler, The Creator cover', 'Tyler, The Creator'], 'Te mata', 'fue mejor', 'no eres tu(soy yo)', 'quiero sentirme bien', 'telepatía', 'I Wish You Roses', 'Moonlight', 'Cry About It',
  ]),
  '0d4e47cb-4305-5951-ab71-461cbaff7432': setlist('https://www.setlist.fm/setlist/hozier/2025/rogers-stadium-toronto-on-canada-1b5ac18c.html', 'Hozier', [
    'De Selby (Part 1)', 'De Selby (Part 2)', 'Jackie and Wilson', "Nobody's Soldier", 'Angel of Small Death and the Codeine Scene', 'Dinner & Diatribes', 'Eat Your Young', 'Would That I',
    'Like Real People Do', 'From Eden', 'NFWMB', 'Francesca', 'It Will Come Back', 'Too Sweet', 'Someone New', 'Almost (Sweet Music)', 'Movement', 'Take Me to Church', 'Cherry Wine', 'Unknown/Nth', 'Nina Cried Power',
    ['Work Song', 'With Gigi Perez', 'Hozier, Gigi Perez'],
  ]),
  'cc3f8636-effa-51f1-9681-5fc6add326cb': setlist('https://www.setlist.fm/setlist/dua-lipa/2025/scotiabank-arena-toronto-on-canada-3b53a420.html', 'Dua Lipa', [
    'Training Season', 'End of an Era', 'Break My Heart', 'One Kiss', 'Whatcha Doing', 'Levitating', 'These Walls', ['Name of God', 'With Mustafa', 'Mustafa'], 'Maria', 'Physical', 'Electricity', 'Hallucinate', 'Illusion', 'Falling Forever',
    'Happy for You', 'Love Again', 'Anything for Love', 'Be the One', 'New Rules', ['Dance the Night', 'Shortened chorus'], "Don't Start Now", 'Houdini',
  ]),
  '914497b6-4d36-5f86-af7d-c50ae7de959c': setlist('https://www.setlist.fm/setlist/the-weeknd/2025/rogers-centre-toronto-on-canada-7b5a8650.html', 'The Weeknd', [
    'The Abyss', 'Wake Me Up', 'After Hours', 'Starboy', 'Heartless', 'Faith', 'Take My Breath', 'Sacrifice', 'How Do I Make You Love Me?', "Can't Feel My Face", ['Lost in the Fire', 'Gesaffelstein cover', 'Gesaffelstein'], 'Kiss Land', 'Often', 'Given Up on Me', 'I Was Never There', 'The Hills', 'Baptized in Fear', 'Open Hearts', 'Cry for Me', ["I Can't Fucking Sing", 'Partial, played from tape'], 'São Paulo', "Until We're Skin & Bones", 'Timeless', ['Creepin’', 'Metro Boomin cover', 'Metro Boomin'], 'Niagara Falls', ['Moth to a Flame', 'Swedish House Mafia song', 'Swedish House Mafia'],
  ]),
  'ab3b30d4-2f2a-50ba-9cdd-34ed388923a2': setlist('https://www.setlist.fm/setlist/tyler-the-creator/2025/scotiabank-arena-toronto-on-canada-351a113.html', 'Tyler, The Creator', [
    'St. Chroma', 'Rah Tah Tah', 'Noid', 'Darling, I', ['I Killed You', 'Shortened'], 'Judge Judy', ['MOMMA TALK', 'Played from tape'], 'Catwalk', 'Sticky', 'Take Your Mask Off', 'Tomorrow', ['IGOR’S THEME', 'Shortened, played from tape'], 'EARFQUAKE', ['ARE WE STILL FRIENDS?', 'Shortened'], 'I THINK', 'Yonkers', 'She', 'Tamale', 'IFHY', 'LUMBERJACK', 'WUSYANAME', 'DOGTOOTH', 'SORRY NOT SORRY',
  ], true),
  'f8f1020a-1db2-51e7-a402-f665227d3af7': setlist('https://www.setlist.fm/setlist/kendrick-lamar-and-sza/2025/rogers-centre-toronto-on-canada-735fce79.html', 'Kendrick Lamar', [
    'wacced out murals', 'squabble up', 'King Kunta', 'ELEMENT.', 'tv off', ['30 for 30', 'With Kendrick Lamar', 'SZA, Kendrick Lamar'], 'Love Galore', 'Broken Clocks', 'The Weekend',
    'euphoria', 'hey now', 'reincarnated', 'HUMBLE.', 'Backseat Freestyle', ['family ties', 'Baby Keem cover', 'Baby Keem'], ['Swimming Pools (Drank)', 'A cappella snippet'], 'm.A.A.d city', 'Alright', 'man at the garden',
    'Scorsese Baby Daddy', 'F2F', 'Drew Barrymore', 'Kitchen', 'Blind', ['Consideration', 'Rihanna cover', 'Rihanna'], 'Low', 'Doves in the Wind', 'All the Stars', 'LOVE.', 'dodger blue', 'peekaboo',
    ['Like That', 'Future & Metro Boomin cover', 'Future, Metro Boomin'], 'DNA.', ['GOOD CREDIT', 'Playboi Carti cover', 'Playboi Carti'], ["Count Me Out / Bitch, Don't Kill My Vibe", 'Medley'], 'Money Trees', 'Poetic Justice', 'I Hate U', 'Go Gina', 'Kill Bill', 'Snooze', 'Crybaby', 'Nobody Gets Me', 'Good Days', 'Rich Baby Daddy', 'BMF', ['Kiss Me More', 'Doja Cat cover', 'Doja Cat'], 'N95', 'tv off', 'Not Like Us', 'luther', 'gloria', ['heart pt. 6', 'Played from tape'],
  ]),
  'fa12071d-7eba-5f4e-a535-98d8336f986b': setlist('https://www.setlist.fm/setlist/remi-wolf/2025/history-toronto-on-canada-2b46b07a.html', 'Remi Wolf', [
    'Cherries & Cream', 'Cinderella', 'Pitiful', 'Liz', 'Kangaroo', 'Alone in Miami', 'Sexy Villain', 'Michael', ['Glitter Pigeon (Funkylious Diaper)', 'Crowd improv'], 'Liquor Store', 'Toro', 'Guy', 'Disco Man', 'Soup', 'Photo ID',
  ]),
  'fc29a449-0c51-59a0-ad68-0fcc69dc2cd5': setlist('https://www.setlist.fm/setlist/denzel-curry/2025/history-toronto-on-canada-3b5f38dc.html', 'Denzel Curry', [
    'HIT THE FLOOR', 'RICKY', 'ACT A DAMN FOOL', 'Walkin', "G'Z UP", 'SKED', 'DIET_', 'GOT ME GEEKED', 'BLACK FLAG FREESTYLE', 'COLE PIMP', 'STILL IN THE PAINT', 'HOT ONE', 'ULT', 'Ultimate', 'CLOUT COBAIN | CLOUT CO13A1N', ['JPEGULTRA!', 'JPEGMAFIA cover', 'JPEGMAFIA'],
  ], true),
  '04556330-16fc-529a-a7fc-d84939bd3764': setlist('https://www.setlist.fm/setlist/don-toliver/2024/scotiabank-arena-toronto-on-canada-3b54c4d0.html', 'Don Toliver', [
    'KRYPTONITE', 'TORE UP', 'BROTHER STONE', '4X4', 'Cardigan', 'HAD ENOUGH', 'GANG GANG', 'WHAT TO DO?', 'No Pole', ['No Pole', 'Played again'], 'BACKSTREETS', 'NEW DROP', ["CAN'T SAY", 'Travis Scott cover', 'Travis Scott'], 'ATTITUDE', 'Best You Had', 'Embarrassed', 'Private Landing', ['FE!N', 'Played from tape', 'Travis Scott'], ['Crew Love', 'Played from tape', 'Drake'], 'Lemonade', 'Swangin’ On Westheimer', 'No Idea', 'GLOCK', 'BANDIT', 'Too Many Nights', ['No Pole', 'Played one last time'], 'After Party', 'TORE UP',
  ]),
  '80f91b29-64c0-563f-b359-63ef584ba36d': setlist('https://www.setlist.fm/setlist/offset/2024/history-toronto-on-canada-6baacace.html', 'Offset', [
    'SAY MY GRACE', 'FAN', 'BROAD DAY', 'BIG DAWG', 'ON THE RIVER', ['Danger (Spider)', 'Offset & JID song', 'Offset, JID'], ['Ghostface Killers', '21 Savage, Offset & Metro Boomin song', '21 Savage, Offset, Metro Boomin'], ['Rap Saved Me', '21 Savage, Offset & Metro Boomin song', '21 Savage, Offset, Metro Boomin'], 'Legacy', ['No Complaints', 'Metro Boomin cover', 'Metro Boomin'], ['Patek Water', 'Future & Young Thug cover', 'Future, Young Thug'], ['100 Racks', 'Quality Control cover', 'Quality Control'], 'Monday', 'HOP OUT THE VAN', ['SKYAMI', 'With Mango Foo', 'Offset, Mango Foo'], 'DON’T YOU LIE', ['ZEZE', 'Kodak Black cover', 'Kodak Black'], ['Taste', 'Tyga cover', 'Tyga'], 'WORTH IT', ['Fight Night', 'Migos song', 'Migos'], ['Call Casting', 'Migos song', 'Migos'], ['Last Memory', 'Takeoff cover', 'Takeoff'], ['MotorSport', 'Migos song', 'Migos'], ['Narcos', 'Migos song', 'Migos'], 'Clout', ['Ric Flair Drip', 'Offset & Metro Boomin song', 'Offset, Metro Boomin'], ['Bad and Boujee', 'Migos song', 'Migos'],
  ], true),
  'ff1d01d5-c786-59be-9447-86cf0c49740d': setlist('https://www.setlist.fm/setlist/billie-eilish/2024/scotiabank-arena-toronto-on-canada-73a8525d.html', 'Billie Eilish', [
    'CHIHIRO', 'LUNCH', 'NDA', 'Therefore I Am', 'WILDFLOWER', "when the party's over", 'THE DINER', 'ilomilo', 'bad guy', 'THE GREATEST', 'Male Fantasy', 'SKINNY', 'TV', 'BITTERSUITE', 'bury a friend', 'Oxytocin', 'you should see me in a crown', ['Guess', 'Charli xcx cover', 'Charli xcx'], 'everything i wanted',
    ['lovely / idontwannabeyouanymore / ocean eyes', 'Medley'], "L'AMOUR DE MA VIE", 'What Was I Made For?', 'Happier Than Ever', 'BIRDS OF A FEATHER',
  ], true),
  '8d77604b-8e85-55ac-8af6-f616e3184d0d': setlist('https://www.setlist.fm/setlist/conan-gray/2024/budweiser-stage-toronto-on-canada-2b56c48a.html', 'Conan Gray', [
    'Fainted Love', 'Never Ending Song', 'Wish You Were Sober', 'Eye of the Night', 'Killing Me', 'The Exit', ['Happy Birthday to You', 'Sung to a fan'], 'People Watching', 'The Cut That Always Bleeds', 'Jigsaw', 'Family Line', ['The Story', 'Acoustic'], 'Astronomy', 'Found Heaven', 'Boys & Girls', 'Lonely Dancers', 'Winner', 'Heather', 'Memories', 'Bourgeoisieses', 'Maniac', 'Alley Rose',
  ]),
  '12a3c914-7d62-5c44-8b2a-1bf3118c890f': setlist('https://www.setlist.fm/setlist/childish-gambino/2024/scotiabank-arena-toronto-on-canada-6ba912a2.html', 'Childish Gambino', [
    'H3@RT$ W3RE M3@NT T0 F7¥', 'Survive', 'I. The Worst Guys', 'Talk My Shit', 'Got to Be', 'In the Night', 'Yoshinoya', 'To Be Hunted', ['Witchy', 'KAYTRANADA cover', 'KAYTRANADA'], 'Steps Beach', 'I. Crawl', 'Cruisin’', 'Feels Like Summer', ['Human Sacrifice', 'Played from tape'], 'A Place Where Love Goes', 'No Excuses', 'Me and Your Mama', ['Do Ya Like', 'With Resonance Home mashup'], 'This Is America', 'IV. Sweatpants', 'Sober', 'L.E.S.', 'Heartbeat', 'Bonfire', 'Freaks and Geeks', 'III. Telegraph Ave.', 'V. 3005', 'Redbone', 'Lithonia',
  ]),
  'a43b325b-e73d-5227-b374-0588d6b5dd20': setlist('https://www.setlist.fm/setlist/ski-mask-the-slump-god/2024/history-toronto-on-canada-6b5732d2.html', 'Ski Mask the Slump God', [
    'R.I.P Roach', 'Headrush', 'Part The Sea', 'BabyWipe', ['WHATINXXXTARNATION!?', 'XXXTENTACION cover', 'XXXTENTACION'], 'Off the Wall!', 'Unbothered', 'H2O', ['How You Feel? (Freestyle)', 'DJ Scheme cover', 'DJ Scheme'], ['Killamonjaro', 'KILLY cover with KILLY', 'KILLY'], ['REAPER', 'KILLY cover with KILLY', 'KILLY'], 'So High', 'Jocelyn Flores', 'SAD!', 'Legends', 'Nuketown', 'WDYM', 'Shibuya', ['Shibuya', 'Repeated'], 'Catch Me Outside', 'Faucet Failure', 'Take a Step Back', 'Look at Me!',
  ]),
  'd4bf7f0a-9d61-58a6-92bc-db8005d7fbd7': setlist('https://www.setlist.fm/setlist/21-savage/2024/budweiser-stage-toronto-on-canada-3ba9489c.html', '21 Savage', [
    ['american dream', 'Played from tape'], 'No Heart', ['Jimmy Cooks', 'Drake cover', 'Drake'], ['On BS', 'Drake & 21 Savage song', 'Drake, 21 Savage'], ['Don’t Come Out the House', 'Metro Boomin cover', 'Metro Boomin'], ['Peaches & Eggplants', 'Young Nudy cover', 'Young Nudy'], 'dangerous', 'née-nah', ['TOPIA TWINS', 'Travis Scott cover', 'Travis Scott'], ['Who Want Smoke??', 'With Nardo Wick', 'Nardo Wick'], 'Red Opps', 'X', 'Bank Account', ['Video Interlude', 'Played from tape'], 'Runnin', 'Glock in My Lap', 'Many Men', ['10 Freaky Girls', 'Metro Boomin cover', 'Metro Boomin'], 'ball w/o You', "should've wore a bonnet", 'prove it', 'Rich Nigga Shit', 'Spin Bout U', ['rockstar', 'Post Malone cover', 'Post Malone'], ["Creepin'", 'Metro Boomin cover', 'Metro Boomin'], ['dark days', 'Played from tape'], 'dark days', 'all of me', 'a lot', ['Surround Sound', 'With JID', 'JID'], ['Knife Talk', 'Drake cover with Drake', 'Drake'], ['Rich Flex', 'With Drake', 'Drake, 21 Savage'], 'redrum',
  ]),
  '1cb5be8d-32b7-51d0-a4d9-b51ebc895098': setlist('https://www.setlist.fm/setlist/teezo-touchdown/2024/the-phoenix-concert-theatre-toronto-on-canada-1ba9e934.html', 'Teezo Touchdown', [
    'Careful', 'SUCKA!', '100 Drums', 'Strong Friend', 'Mid', 'Social Cues', 'Technically', "I'm Just A Fan", 'OK', 'You Thought', 'UUHH', 'Sweet', 'Impossible', 'Neighborhood', 'Too Easy', 'Familiarity', 'Nu Nay',
    ['RUNITUP', 'Tyler, The Creator cover', 'Tyler, The Creator'], ['MODERN JAM', 'Travis Scott cover', 'Travis Scott'], ['7969 Santa', 'Drake cover', 'Drake'], 'Up and Down', 'Third Coast', 'Rock Paper Strippers', "5 O'Clock",
  ]),
  '6abebab4-2c3b-511e-8579-b43e1da929c3': setlist('https://www.setlist.fm/setlist/noah-kahan/2024/scotiabank-arena-toronto-on-canada-13abb1b1.html', 'Noah Kahan', [
    'Dial Drunk', 'New Perspective', 'Everywhere, Everything', 'False Confidence', 'Forever', ['Come Over', 'Stripped'], ['Godlight', 'Stripped'], ['Pain Is Cold Water', 'Unreleased'], 'Maine', 'All My Love', 'Your Needs, My Needs', 'Paul Revere', "You're Gonna Go Far", 'Homesick', ['Growing Sideways', 'Solo B-stage'], ['The Great Divide', 'Unreleased, solo B-stage'], 'She Calls Me Back', 'Call Your Mom', 'Orange Juice', 'Northern Attitude', 'The View Between Villages', 'Stick Season',
  ]),
  '75b4f14e-0a8f-5454-b3fa-55a11c6ac93d': setlist('https://www.setlist.fm/setlist/olivia-rodrigo/2024/scotiabank-arena-toronto-on-canada-3abb54b.html', 'Olivia Rodrigo', [
    'bad idea right?', 'ballad of a homeschooled girl', 'vampire', 'traitor', 'drivers license', 'teenage dream', "pretty isn't pretty", 'love is embarrassing', 'making the bed', 'logical', 'enough for you', 'lacy', ['Happy Birthday to You', 'Mildred J. Hill cover', 'Mildred J. Hill'], 'jealousy, jealousy', "Can't Catch Me Now", 'happier', 'favorite crime', 'deja vu', 'the grudge', 'brutal', 'obsessed', 'all-american bitch', 'good 4 u', 'get him back!',
  ]),
  // 2023 and earlier
  '54de4ce5-9fb4-54d4-b222-b95f0c763412': setlist('https://www.setlist.fm/setlist/travis-scott/2023/scotiabank-arena-toronto-on-canada-6baf8e9a.html', 'Travis Scott', [
    ['Greetings From Utopia', 'Played from tape'], 'HYAENA', 'THANK GOD', ['MODERN JAM', 'With Teezo Touchdown', 'Travis Scott, Teezo Touchdown'], ['Aye', 'Lil Uzi Vert cover', 'Lil Uzi Vert'], 'sdp interlude', '3500', 'Nightcrawler', ['Nightcrawler', 'Tape intro repeated'], 'SIRENS', 'Upper Echelon', ["Praise God", 'Ye cover', 'Ye'], "GOD'S COUNTRY", 'MY EYES', 'BUTTERFLY EFFECT', 'HIGHEST IN THE ROOM', 'Mamacita', 'CIRCUS MAXIMUS', ['DELRESTO', 'Played from tape'], "Maria I'm Drunk", ['Company', 'Drake cover', 'Drake'], "CAN'T SAY", 'Drugs You Should Try It', 'MAFIA', 'I KNOW ?', '90210', 'MELTDOWN', 'TOPIA TWINS', 'NO BYSTANDERS', ['FE!N', 'Repeated six times'], 'SICKO MODE', 'Antidote', 'goosebumps', 'TELEKINESIS',
  ]),
  'c16f93fc-9b70-5bcd-b302-79c7ddc04e05': setlist('https://www.setlist.fm/setlist/jid/2023/history-toronto-on-canada-6bba524e.html', 'JID', [
    'Galaxy', 'NEVER', 'Off da Zoinkys', 'Raydar', 'Dance Now', 'Crack Sandwich', 'Bruddanem', 'Sistanem', 'Kody Blu 31', 'Workin Out', 'Stars', 'Just in Time', 'Off Deez', 'Down Bad', ['Ms Fat Booty', 'Mos Def cover', 'Mos Def'], 'Surround Sound', '151 Rum', 'Stick', ['Baguetti', 'Smino cover with Smino', 'JID, Smino'], '2007',
  ], true),
  '7fcbff7e-7f1c-5d7d-8dcb-2c1ccbdf93a7': setlist('https://www.setlist.fm/setlist/baby-gravy/2022/history-toronto-on-canada-2bbfe832.html', 'Yung Gravy & bbno$', [
    'Welcome to Chilis', 'touch grass', 'iunno', 'Rotisserie', ['Bad Boy', 'bbno$ song', 'bbno$'], ['yoga', 'bbno$ song', 'bbno$'], ['mathematics', 'bbno$ song', 'bbno$'], ['mememe', 'bbno$ song', 'bbno$'], ['on god', 'bbno$ song', 'bbno$'], ['Cheryl', 'Yung Gravy song', 'Yung Gravy'], ['1 Thot 2 Thot Red Thot Blue Thot', 'Yung Gravy song', 'Yung Gravy'], ['Charlene', 'Yung Gravy song', 'Yung Gravy'], ['Dancing In The Rain', 'Yung Gravy song', 'Yung Gravy'], ['Gravy Train', 'Yung Gravy song', 'Yung Gravy'], 'Gasoline', 'shining on my ex', 'Whip a Tesla', ['help herself', 'bbno$ song', 'bbno$'], ['bad girl', 'bbno$ song', 'bbno$'], ['sriracha', 'bbno$ song', 'bbno$'], ['who dat boi', 'bbno$ song', 'bbno$'], ['top gun', 'bbno$ song', 'bbno$'], ['nursery', 'bbno$ song', 'bbno$'], ['Mr Clean', 'Yung Gravy song', 'Yung Gravy'], ['Tampa Bay Bustdown', 'Yung Gravy song', 'Yung Gravy'], ['Boys Are Back in Town', 'Thin Lizzy cover', 'Thin Lizzy'], 'Magic', ['You’ll Never Find Another Love Like Mine', 'Lou Rawls cover', 'Lou Rawls'], 'edamame', 'oops!', 'Betty', 'lalala', 'C’est La Vie',
  ]),
  '6b8fa98d-02b6-5a27-b639-268eb93dca13': setlist('https://www.setlist.fm/setlist/the-weeknd/2022/rogers-centre-toronto-on-canada-5bb063a4.html', 'The Weeknd', [
    'Alone Again', 'Gasoline', 'Sacrifice', 'How Do I Make You Love Me?', "Can't Feel My Face", 'Take My Breath', ['Hurricane', 'Ye cover', 'Ye'], 'The Hills', 'Often', ['Crew Love', 'Drake song', 'Drake'], 'Starboy', 'Heartless', ['Low Life', 'Future song', 'Future'], ['Or Nah', 'Ty Dolla $ign song', 'Ty Dolla $ign'], 'Kiss Land', 'Party Monster', 'Faith', 'After Hours', 'Out of Time', 'I Feel It Coming', 'Die For You', 'Is There Someone Else?', 'I Was Never There', 'Wicked Games', 'Call Out My Name', 'The Morning', 'Save Your Tears', 'Less Than Zero', 'Blinding Lights',
  ]),
  '0e295275-1cb3-5c4a-81c4-2ef04c5a34c9': setlist('https://www.setlist.fm/setlist/kendrick-lamar/2022/scotiabank-arena-toronto-on-canada-13b389d5.html', 'Kendrick Lamar', [
    ['Savior Interlude', 'Played from tape'], 'United in Grief', 'N95', 'ELEMENT.', 'Worldwide Steppers', 'Backseat Freestyle', 'Rich Spirit', ['Rich Interlude', 'Snippet played from tape'], 'HUMBLE.', 'Father Time', 'm.A.A.d city', ['We Cry Together', 'Snippet played from tape'], 'Purple Hearts', 'King Kunta', 'Bitch, Don’t Kill My Vibe', 'Die Hard', ['LUST.', 'Snippet played from tape'], 'DNA.', 'Count Me Out', 'Money Trees', 'LOVE.', 'Alright', 'Mirror', 'Silent Hill', ['vent', 'Baby Keem cover with Baby Keem', 'Baby Keem'], ['range brothers', 'Baby Keem song', 'Baby Keem'], ['family ties', 'Baby Keem song', 'Baby Keem'], 'Crown', ['Mr. Morale', 'Tanna Leone song', 'Tanna Leone'], 'Savior',
  ]),
  '5f1ddde4-38b2-5d00-b669-98f6efeeff38': setlist('https://www.setlist.fm/setlist/denzel-curry/2022/rebel-toronto-on-canada-63b19e6f.html', 'Denzel Curry', [
    'Melt Session #1', 'Walkin', 'Worst Comes to Worst', 'The Last', 'Mental', 'Troubles', "Ain't No Way", 'This Life', 'Dog Food', ['BLACK BALLOONS | 13LACK 13ALLOONZ', 'IDK cover', 'IDK'], 'WISH', 'Threatz',
  ], true),
}

export const spotifySearchUrl = (track: VerifiedSetlistTrack) =>
  `https://open.spotify.com/search/${encodeURIComponent(`${track.performer} ${track.title}`)}`
