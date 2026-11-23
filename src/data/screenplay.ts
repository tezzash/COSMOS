import { ChapterId, TITLE_REVEAL_TIME } from './chapters';

export interface NarrationLine {
  id: string;
  chapterId: ChapterId;
  start: number;
  end: number;
  text: string;
  containsReveal?: boolean;
  tone?: 'monumental' | 'warm' | 'playful' | 'quiet' | 'climax';
}

export interface AstronomicalFact {
  id: string;
  label: string;
  value: string;
  detail: string;
  start: number;
  end: number;
}

export interface ConstellationTrait {
  word: string;
  start: number;
  end: number;
}

export const ASTRONOMICAL_FACTS: AstronomicalFact[] = [
  {
    id: 'rotation',
    label: 'Equatorial Rotation',
    value: '~1,670 km/h',
    detail: 'Earth sidereal spin at 0° latitude',
    start: 62,
    end: 74,
  },
  {
    id: 'orbit',
    label: 'Mean Orbital Velocity',
    value: '~107,000 km/h',
    detail: 'NASA solar orbit average',
    start: 65,
    end: 78,
  },
  {
    id: 'date-location',
    label: 'Monday · 25 November 2002',
    value: '17.3850° N, 78.4867° E',
    detail: 'Hyderabad, Andhra Pradesh, India (2002)',
    start: 78,
    end: 95,
  },
  {
    id: 'moon',
    label: 'Lunar Illumination',
    value: 'Waning Gibbous · ~72%',
    detail: 'Full Moon passed 20 Nov 2002 (~07:04 IST)',
    start: 82,
    end: 98,
  },
  {
    id: 'daylight',
    label: 'Hyderabad Daylight',
    value: '~06:30 — 17:36 IST',
    detail: 'Approx. 11 hours 6 minutes of sunlight',
    start: 86,
    end: 103,
  },
];

export const CONSTELLATION_TRAITS: ConstellationTrait[] = [
  { word: 'INTELLIGENCE', start: 158.5, end: 162.2 },
  { word: 'KINDNESS', start: 161.2, end: 164.8 },
  { word: 'AMBITION', start: 163.8, end: 167.4 },
  { word: 'HUMOUR', start: 166.3, end: 169.8 },
  { word: 'CURIOSITY', start: 168.8, end: 172.3 },
  { word: 'DETERMINATION', start: 171.2, end: 174.8 },
];

export const SCREENPLAY_LINES: NarrationLine[] = [
  // PROLOGUE — BEFORE ANYTHING HAD A NAME (00:00–00:55)
  {
    id: 'p-1',
    chapterId: 'prologue',
    start: 2.4,
    end: 10.0,
    text: 'Before there was a before... Before time learned to count. Before space had somewhere to stretch its endless arms.',
    tone: 'monumental',
  },
  {
    id: 'p-2',
    chapterId: 'prologue',
    start: 10.4,
    end: 17.0,
    text: 'There was a beginning. And from that beginning came everything. Matter. Energy. Time. Gravity.',
    tone: 'monumental',
  },
  {
    id: 'p-3',
    chapterId: 'prologue',
    start: 17.3,
    end: 24.7,
    text: 'Stars that would burn for billions of years. Galaxies separated by distances the human mind would struggle to comprehend.',
    tone: 'monumental',
  },
  {
    id: 'p-4',
    chapterId: 'prologue',
    start: 25.0,
    end: 32.4,
    text: 'Worlds would form. Worlds would disappear. And somewhere, among all those possibilities, a rather interesting thing happened.',
    tone: 'monumental',
  },
  {
    id: 'p-5',
    chapterId: 'prologue',
    start: 32.7,
    end: 35.4,
    text: 'The universe became capable of producing life.',
    tone: 'warm',
  },
  {
    id: 'p-6',
    chapterId: 'prologue',
    start: 35.8,
    end: 48.0,
    text: 'Now, I have witnessed quite a lot in my existence. Explosions powerful enough to create stars. Black holes capable of swallowing light itself. Galaxies performing their magnificent celestial dances.',
    tone: 'monumental',
  },
  {
    id: 'p-7',
    chapterId: 'prologue',
    start: 48.3,
    end: 54.6,
    text: 'But I must admit... some of my most interesting creations turned out to be considerably smaller.',
    tone: 'playful',
  },

  // CHAPTER I — A LITTLE PLANET, A BIG STORY (00:55–01:50)
  {
    id: 'c1-1',
    chapterId: 'chapter-1',
    start: 55.6,
    end: 60.9,
    text: 'Now, let us visit one of my favourite little arrangements. A planet called Earth.',
    tone: 'warm',
  },
  {
    id: 'c1-2',
    chapterId: 'chapter-1',
    start: 61.3,
    end: 76.5,
    text: 'An interesting place, really. A world that spins at roughly 1,670 kilometres per hour at its equator, travels around its star at approximately 107,000 kilometres per hour, and somehow manages to convince its inhabitants that everything is standing perfectly still.',
    tone: 'playful',
  },
  {
    id: 'c1-3',
    chapterId: 'chapter-1',
    start: 76.8,
    end: 78.2,
    text: 'Quite the illusion.',
    tone: 'playful',
  },
  {
    id: 'c1-4',
    chapterId: 'chapter-1',
    start: 78.5,
    end: 84.8,
    text: 'And on one particular day... Monday, the twenty-fifth of November, 2002... Earth continued its usual business.',
    tone: 'warm',
  },
  {
    id: 'c1-5',
    chapterId: 'chapter-1',
    start: 85.1,
    end: 93.8,
    text: 'The Moon stood in its waning gibbous phase, roughly seventy-two percent illuminated. The Sun rose over Hyderabad, bringing around eleven hours of daylight.',
    tone: 'warm',
  },
  {
    id: 'c1-6',
    chapterId: 'chapter-1',
    start: 94.2,
    end: 100.0,
    text: 'The day unfolded. Somewhere, people went about their ordinary lives. And a new human arrived.',
    tone: 'warm',
  },
  {
    id: 'c1-7',
    chapterId: 'chapter-1',
    start: 100.3,
    end: 105.1,
    text: 'Nothing exploded. No stars changed their orbits. No galaxies stopped to applaud.',
    tone: 'quiet',
  },
  {
    id: 'c1-8',
    chapterId: 'chapter-1',
    start: 105.4,
    end: 109.6,
    text: 'But something had changed. A new possibility had entered the story.',
    tone: 'warm',
  },

  // CHAPTER II — AN UNUSUAL FORM OF EXISTENCE (01:50–02:55)
  {
    id: 'c2-1',
    chapterId: 'chapter-2',
    start: 110.6,
    end: 114.5,
    text: 'Now, studying this particular human has presented me with a few interesting observations.',
    tone: 'playful',
  },
  {
    id: 'c2-2',
    chapterId: 'chapter-2',
    start: 114.9,
    end: 122.6,
    text: "First, her physical dimensions. Let's just say... she has discovered an impressive way of fitting an unreasonable amount of ambition into a rather compact arrangement.",
    tone: 'playful',
  },
  {
    id: 'c2-3',
    chapterId: 'chapter-2',
    start: 122.9,
    end: 124.5,
    text: 'A remarkable engineering achievement.',
    tone: 'playful',
  },
  {
    id: 'c2-4',
    chapterId: 'chapter-2',
    start: 124.8,
    end: 127.2,
    text: 'Secondly, her mind. Curious. Capable. Determined.',
    tone: 'warm',
  },
  {
    id: 'c2-5',
    chapterId: 'chapter-2',
    start: 127.5,
    end: 134.4,
    text: "She has this peculiar habit of looking at something perfectly acceptable and thinking... 'Could be better.' And then proceeding to make it better.",
    tone: 'playful',
  },
  {
    id: 'c2-6',
    chapterId: 'chapter-2',
    start: 134.7,
    end: 140.3,
    text: 'Which, frankly, is quite exhausting to observe from a universe that has already been expanding for billions of years.',
    tone: 'playful',
  },
  {
    id: 'c2-7',
    chapterId: 'chapter-2',
    start: 140.6,
    end: 145.5,
    text: 'She helps people understand themselves. She listens. She guides. She encourages them to move forward.',
    tone: 'warm',
  },
  {
    id: 'c2-8',
    chapterId: 'chapter-2',
    start: 145.9,
    end: 149.7,
    text: 'A therapist, among other things. And apparently, an excellent one at that.',
    tone: 'warm',
  },
  {
    id: 'c2-9',
    chapterId: 'chapter-2',
    start: 150.0,
    end: 156.2,
    text: "But don't let the professional description fool you. There are also games. Movies. Music. An impressive collection of sarcasm.",
    tone: 'playful',
  },
  {
    id: 'c2-10',
    chapterId: 'chapter-2',
    start: 156.5,
    end: 163.4,
    text: 'And occasional moments of childish behaviour that I shall respectfully decline to investigate further. Some mysteries, even I, prefer to leave unsolved.',
    tone: 'playful',
  },
  {
    id: 'c2-11',
    chapterId: 'chapter-2',
    start: 163.7,
    end: 168.2,
    text: "She doesn't do extraordinary things because she expects admiration. She does them because she can.",
    tone: 'monumental',
  },
  {
    id: 'c2-12',
    chapterId: 'chapter-2',
    start: 168.6,
    end: 174.6,
    text: 'No grand announcement. No requirement for applause. Just an instinct to see what can be done... and then do it.',
    tone: 'warm',
  },

  // CHAPTER III — THE INVISIBLE GRAVITY (02:55–03:45)
  {
    id: 'c3-1',
    chapterId: 'chapter-3',
    start: 175.6,
    end: 178.1,
    text: 'You see, not every force announces itself.',
    tone: 'warm',
  },
  {
    id: 'c3-2',
    chapterId: 'chapter-3',
    start: 178.5,
    end: 185.8,
    text: "Gravity doesn't need applause to hold galaxies together. Light doesn't ask whether anyone is watching before it illuminates a world.",
    tone: 'monumental',
  },
  {
    id: 'c3-3',
    chapterId: 'chapter-3',
    start: 186.2,
    end: 190.9,
    text: "And some people... they don't even realize how far their smallest actions travel.",
    tone: 'warm',
  },
  {
    id: 'c3-4',
    chapterId: 'chapter-3',
    start: 191.2,
    end: 198.3,
    text: 'A conversation. A little encouragement. A moment of patience. A few words spoken at precisely the right time.',
    tone: 'warm',
  },
  {
    id: 'c3-5',
    chapterId: 'chapter-3',
    start: 198.6,
    end: 208.3,
    text: 'They may seem insignificant to the person giving them. But somewhere, someone remembers. Someone stands a little taller. Someone finds the courage to try again.',
    tone: 'warm',
  },
  {
    id: 'c3-6',
    chapterId: 'chapter-3',
    start: 208.7,
    end: 215.7,
    text: 'And the person responsible? Probably already busy with something else. Possibly correcting an imperfection nobody else even noticed.',
    tone: 'playful',
  },
  {
    id: 'c3-7',
    chapterId: 'chapter-3',
    start: 216.1,
    end: 224.6,
    text: "Perhaps that's the strange beauty of existence. You never really know how many little universes you've changed just by being part of your own.",
    tone: 'monumental',
  },

  // CHAPTER IV — TWO HALVES OF A STRANGE EQUILIBRIUM (03:45–04:45)
  {
    id: 'c4-1',
    chapterId: 'chapter-4',
    start: 225.6,
    end: 229.2,
    text: 'Of course, balance is another rather fascinating subject.',
    tone: 'monumental',
  },
  {
    id: 'c4-2',
    chapterId: 'chapter-4',
    start: 229.5,
    end: 233.5,
    text: 'Consider two forces. One, precise. Structured. Deliberate.',
    tone: 'monumental',
  },
  {
    id: 'c4-3',
    chapterId: 'chapter-4',
    start: 233.9,
    end: 238.6,
    text: 'The other, imperfect. Unpredictable. Occasionally questionable in its decision-making.',
    tone: 'playful',
  },
  {
    id: 'c4-4',
    chapterId: 'chapter-4',
    start: 238.9,
    end: 246.9,
    text: 'One seems to have a plan for everything. The other appears to be making the plan up along the way.',
    tone: 'playful',
  },
  {
    id: 'c4-5',
    chapterId: 'chapter-4',
    start: 247.3,
    end: 250.3,
    text: 'And yet... neither is without its purpose.',
    tone: 'warm',
  },
  {
    id: 'c4-6',
    chapterId: 'chapter-4',
    start: 250.7,
    end: 257.2,
    text: 'Because perfection without spontaneity can become stillness. And chaos without direction can become confusion.',
    tone: 'monumental',
  },
  {
    id: 'c4-7',
    chapterId: 'chapter-4',
    start: 257.6,
    end: 267.6,
    text: "The universe has always understood something rather important. Opposites don't necessarily have to compete. Sometimes, they simply make room for one another.",
    tone: 'warm',
  },
  {
    id: 'c4-8',
    chapterId: 'chapter-4',
    start: 268.0,
    end: 274.7,
    text: 'Two different ways of existing. Two different rhythms. And somehow, a rather beautiful equilibrium.',
    tone: 'warm',
  },
  {
    id: 'c4-9',
    chapterId: 'chapter-4',
    start: 275.0,
    end: 284.6,
    text: 'And perhaps the most interesting part of all... is that neither side needs to become the other. They only need to be themselves.',
    tone: 'warm',
  },

  // CHAPTER V — EVEN STARS HAVE QUIET HOURS (04:45–05:35)
  {
    id: 'c5-1',
    chapterId: 'chapter-5',
    start: 285.6,
    end: 287.6,
    text: 'Now... there is something else worth remembering.',
    tone: 'quiet',
  },
  {
    id: 'c5-2',
    chapterId: 'chapter-5',
    start: 287.9,
    end: 293.3,
    text: "I have been expanding for approximately 13.8 billion years. And even I wouldn't recommend attempting that without a few pauses.",
    tone: 'quiet',
  },
  {
    id: 'c5-3',
    chapterId: 'chapter-5',
    start: 293.6,
    end: 302.2,
    text: 'Yet humans... humans have developed an extraordinary habit of expecting themselves to keep going. To improve. To achieve. To understand. To help. To become something more than they were yesterday.',
    tone: 'quiet',
  },
  {
    id: 'c5-4',
    chapterId: 'chapter-5',
    start: 302.5,
    end: 305.0,
    text: 'And some seem particularly determined to do all of it.',
    tone: 'quiet',
  },
  {
    id: 'c5-5',
    chapterId: 'chapter-5',
    start: 305.3,
    end: 312.8,
    text: "But listen. You don't have to turn every day into an achievement. You don't have to solve every problem. You don't have to be the person with all the answers.",
    tone: 'quiet',
  },
  {
    id: 'c5-6',
    chapterId: 'chapter-5',
    start: 313.2,
    end: 318.4,
    text: 'There are days meant for progress. And there are days meant for doing absolutely nothing. Both are part of being alive.',
    tone: 'quiet',
  },
  {
    id: 'c5-7',
    chapterId: 'chapter-5',
    start: 318.8,
    end: 324.8,
    text: 'Even the stars have their own lifetimes. Even galaxies change. And nobody has ever accused the universe of being lazy for taking its time.',
    tone: 'warm',
  },
  {
    id: 'c5-8',
    chapterId: 'chapter-5',
    start: 325.2,
    end: 334.7,
    text: 'So perhaps... a little rest is not such a terrible idea. I hope the people who spend their time helping others remember that they deserve kindness too. Not because of what they do. Simply because they exist.',
    tone: 'warm',
  },

  // FINAL CHAPTER — THE REVELATION (05:35–06:45)
  {
    id: 'f-1',
    chapterId: 'final-chapter',
    start: 335.6,
    end: 342.0,
    text: 'So... after all those galaxies. All those stars. All that time. All those extraordinary arrangements of matter and energy...',
    tone: 'monumental',
  },
  {
    id: 'f-2',
    chapterId: 'final-chapter',
    start: 342.3,
    end: 344.8,
    text: 'There is one little existence worth celebrating today.',
    tone: 'climax',
  },
  {
    id: 'f-3',
    chapterId: 'final-chapter',
    start: 345.1,
    end: 353.6,
    text: 'One human. A mind that refuses to settle. A heart that finds ways to make a difference. A spirit that keeps discovering new reasons to move forward.',
    tone: 'climax',
  },
  {
    id: 'f-4',
    chapterId: 'final-chapter',
    start: 353.9,
    end: 359.8,
    text: 'A little mischief. A little madness. And quite possibly, more sarcasm than the universe was prepared to accommodate.',
    tone: 'playful',
  },
  {
    id: 'f-5',
    chapterId: 'final-chapter',
    start: 360.1,
    end: 364.7,
    text: "I have seen countless wonders. But I think I'll make an exception for this one.",
    tone: 'climax',
  },
  // 365.0–370.5: Complete cosmic silence — one star remains.
  // 371.5: ISHA constellation reveal!
  {
    id: 'f-6',
    chapterId: 'final-chapter',
    start: 372.4,
    end: 381.5,
    text: "Twenty-four journeys around a star. Approximately 22.5 billion kilometres travelled along Earth's orbit. And somehow, the journey is only getting started.",
    tone: 'warm',
    containsReveal: true,
  },
  {
    id: 'f-7',
    chapterId: 'final-chapter',
    start: 381.8,
    end: 385.7,
    text: 'So, from this rather enormous universe... Happy Birthday, Isha.',
    tone: 'climax',
    containsReveal: true,
  },
  {
    id: 'f-8',
    chapterId: 'final-chapter',
    start: 386.1,
    end: 393.0,
    text: 'Keep being curious. Keep being wonderfully stubborn. Keep exploring. Keep laughing. Keep playing. Keep becoming.',
    tone: 'warm',
    containsReveal: true,
  },
  {
    id: 'f-9',
    chapterId: 'final-chapter',
    start: 393.4,
    end: 403.5,
    text: 'And whenever you need to... remember that you are allowed to simply be. The universe has plenty of time. And today... it is celebrating you.',
    tone: 'warm',
    containsReveal: true,
  },
];

export const FINAL_POSTSCRIPT =
  'P.S. The universe has reviewed your performance. Expectations remain unreasonably high. Please continue being you.';

export function getActiveNarrationLine(timeSec: number): NarrationLine | null {
  for (let i = 0; i < SCREENPLAY_LINES.length; i++) {
    const line = SCREENPLAY_LINES[i];
    if (timeSec >= line.start && timeSec <= line.end) {
      return line;
    }
  }
  return null;
}

export function getActiveFacts(timeSec: number): AstronomicalFact[] {
  return ASTRONOMICAL_FACTS.filter((f) => timeSec >= f.start && timeSec <= f.end);
}

export function getActiveTrait(timeSec: number): ConstellationTrait | null {
  for (let i = 0; i < CONSTELLATION_TRAITS.length; i++) {
    const trait = CONSTELLATION_TRAITS[i];
    if (timeSec >= trait.start && timeSec <= trait.end) {
      return trait;
    }
  }
  return null;
}

/**
 * Prevents transcript spoilers before the viewer reaches the Final Chapter reveal.
 */
export function getSpoilerSafeTranscript(
  currentTimeSec: number,
  hasUnlockedReveal: boolean,
): Array<NarrationLine & { locked: boolean }> {
  const unlocked = hasUnlockedReveal || currentTimeSec >= TITLE_REVEAL_TIME;
  return SCREENPLAY_LINES.map((line) => ({
    ...line,
    locked: Boolean(line.containsReveal && !unlocked),
  }));
}
