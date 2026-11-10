// Sections and missions configuration for the Bomb Boomed sidebar
// Each mission maps to a sequence of modules.
// Missing/placeholder modules are flagged with isImplemented: false.

export const KNOWN_MODULE_NAMES = {
  // Implemented modules in bomb_boomed:
  'Maze': { id: 'maze', isImplemented: true },
  'Password': { id: 'password', isImplemented: true },
  'Switches': { id: 'switches', isImplemented: true },
  'Search': { id: 'search', isImplemented: true },
  'Knobs': { id: 'knob', isImplemented: true },
  'Piano': { id: 'piano', isImplemented: true },
  'Who\'s On First': { id: 'wof', isImplemented: true },
  'Wire Sequences': { id: 'wireseq', isImplemented: true },
  'Complex Wires': { id: 'complexwires', isImplemented: true },
  'Logic': { id: 'logic', isImplemented: true },
  'Chess': { id: 'chess', isImplemented: true },
  'Mines': { id: 'mines', isImplemented: true },
  'Symbols': { id: 'symbols', isImplemented: true },
  'Simon Says': { id: 'simons', isImplemented: true },
  'Rubik\'s Cube': { id: 'cube', isImplemented: true },
  'Diagram': { id: 'diagram', isImplemented: true },
  'Morse Code': { id: 'morse', isImplemented: true },
  'Queens': { id: 'queens', isImplemented: true },
  'The Button': { id: 'button', isImplemented: true },
  'Balance': { id: 'balance', isImplemented: true },

  // Modules not yet implemented or KTANE/GTA variants:
  // "Wires" is standard regular wires (or complex wires as fallback if desired, but as a distinct module it's missing)
  'Wires': { id: 'wires', isImplemented: false },
  'Memory': { id: 'memory', isImplemented: false },
  'Circuit': { id: 'circuit', isImplemented: false },
  'Pressure': { id: 'pressure', isImplemented: false },
  'Breaker': { id: 'breaker', isImplemented: false }
};

// Raw level list as it appears in the game (includes modules with no solver yet)
export const SECTIONS_RAW = [
  {
    title: 'Section 1',
    missions: [
      { id: '1.1', label: '1.1', modules: ['The Button', 'Wires', 'Switches'] },
      { id: '1.2', label: '1.2', modules: ['Wires', 'Memory', 'The Button'] },
      { id: '1.3', label: '1.3', modules: ['Maze', 'Password', 'Wires'] },
      { id: '1.4', label: '1.4', modules: ['Symbols', 'Search', 'The Button'] }
    ]
  },
  {
    title: 'Section 2',
    missions: [
      { id: '2.1', label: '2.1', modules: ['The Button', 'Memory', 'Password'] },
      { id: '2.2', label: '2.2', modules: ['Logic', 'Balance', 'Diagram'] },
      { id: '2.3', label: '2.3', modules: ['Password', 'Memory', 'Switches', 'Diagram'] },
      { id: '2.4', label: '2.4', modules: ['Wires', 'The Button', 'Switches'] },
      { id: '2.5', label: '2.5', modules: ['Wires', 'The Button', 'Memory', 'Logic', 'Password', 'Switches'] }
    ]
  },
  {
    title: 'Section 3',
    missions: [
      { id: '3.1', label: '3.1', modules: ['Wire Sequences', 'Wires', 'The Button'] },
      { id: '3.2', label: '3.2', modules: ['Wire Sequences', 'Memory', 'Simon Says', 'Search'] },
      { id: '3.3', label: '3.3', modules: ['Simon Says', 'The Button', 'Wires', 'Switches'] },
      { id: '3.4', label: '3.4', modules: ['Wire Sequences', 'Search', 'Memory', 'Circuit', 'Symbols'] },
      { id: '3.5', label: '3.5', modules: ['Simon Says', 'Simon Says', 'Wire Sequences', 'Memory'] },
      { id: '3.6', label: '3.6', modules: ['Memory', 'Simon Says', 'Wire Sequences', 'The Button', 'Maze', 'Switches', 'Search', 'Balance'] }
    ]
  },
  {
    title: 'Section 4',
    missions: [
      { id: '4.1', label: '4.1', modules: ['The Button', 'The Button', 'Wires', 'Wires', 'Switches', 'Switches'] },
      { id: '4.2', label: '4.2', modules: ['Maze', 'Maze', 'Memory', 'Search'] },
      { id: '4.3', label: '4.3', modules: ['Memory', 'Memory', 'Memory', 'The Button', 'Switches', 'Diagram', 'Maze', 'Search', 'Wires'] },
      { id: '4.4', label: '4.4', modules: ['Password', 'Password', 'Memory', 'Memory', 'The Button', 'The Button'] },
      { id: '4.5', label: '4.5', modules: ['Diagram', 'Diagram', 'Logic', 'Logic', 'Balance', 'Balance'] },
      { id: '4.6', label: '4.6', modules: ['Simon Says', 'Simon Says', 'Simon Says', 'Simon Says', 'Simon Says', 'Simon Says'] }
    ]
  },
  {
    title: 'Section 5',
    missions: [
      { id: '5.1', label: '5.1', modules: ['Pressure', 'Wires', 'The Button', 'Switches', 'Memory', 'Password'] },
      { id: '5.2', label: '5.2', modules: ['Breaker', 'Wires', 'The Button', 'Switches', 'Memory', 'Maze'] },
      { id: '5.3', label: '5.3', modules: ['Knobs', 'Wires', 'The Button', 'Switches', 'Password', 'Search'] },
      { id: '5.4', label: '5.4', modules: ['Pressure', 'Breaker', 'Knobs', 'Memory', 'Search', 'Maze', 'Switches', 'The Button', 'Wire Sequences'] },
      { id: '5.5', label: '5.5', modules: ['Pressure', 'Breaker', 'Wire Sequences', 'Simon Says', 'Logic', 'Balance', 'Symbols'] },
      { id: '5.6', label: '5.6', modules: ['Pressure', 'Memory', 'Password', 'Wire Sequences'] }
    ]
  },
  {
    title: 'Section 6',
    missions: [
      { id: '6.1', label: '6.1', modules: ['Piano', 'Piano', 'Pressure', 'Symbols', 'Memory', 'Wires'] },
      { id: '6.2', label: '6.2', modules: ['Morse Code', 'Morse Code', 'Breaker', 'Search', 'Password', 'The Button'] },
      { id: '6.3', label: '6.3', modules: ['Who\'s On First', 'Simon Says', 'Memory', 'Wire Sequences', 'Maze', 'Search'] },
      { id: '6.4', label: '6.4', modules: ['Chess', 'Chess', 'Chess', 'Chess', 'Chess', 'Knobs'] },
      { id: '6.5', label: '6.5', modules: ['Rubik\'s Cube', 'Password', 'Piano', 'Morse Code', 'Wire Sequences', 'Logic'] },
      { id: '6.6', label: '6.6', modules: ['Rubik\'s Cube', 'Piano', 'Morse Code', 'Symbols', 'Wire Sequences', 'Simon Says'] },
      { id: '6.7', label: '6.7', modules: ['Piano', 'Piano', 'Morse Code', 'Morse Code', 'Rubik\'s Cube', 'Symbols', 'Logic', 'Diagram', 'Wire Sequences'] },
      { id: '6.8', label: '6.8', modules: ['Memory', 'Memory', 'Memory', 'Logic', 'Logic', 'Wire Sequences', 'Wire Sequences', 'Breaker'] }
    ]
  },
  {
    title: 'Section 7',
    missions: [
      { id: '7.1', label: '7.1', modules: ['Maze', 'Maze', 'Maze', 'Maze', 'Maze', 'Maze', 'Maze', 'Maze'] },
      { id: '7.2', label: '7.2', modules: ['Wire Sequences', 'Wire Sequences', 'Wire Sequences', 'Wire Sequences', 'Wire Sequences', 'Wire Sequences'] },
      { id: '7.3', label: '7.3', modules: ['Password', 'Password', 'Password', 'Password', 'Password', 'Password', 'Password', 'Password', 'Password'] },
      { id: '7.4', label: '7.4', modules: ['Pressure', 'Memory', 'Wire Sequences', 'Password', 'Morse Code', 'Search', 'Diagram', 'Maze', 'Piano', 'Logic', 'Circuit', 'Knobs', 'Symbols', 'Simon Says', 'Rubik\'s Cube', 'Chess'] }
    ]
  }
];

// Levels only list modules that have a solver in this app; unimplemented ones are left out.
export const SECTIONS_DATA = SECTIONS_RAW.map(sec => ({
  ...sec,
  missions: sec.missions.map(m => ({
    ...m,
    modules: m.modules.filter(name => KNOWN_MODULE_NAMES[name] && KNOWN_MODULE_NAMES[name].isImplemented)
  }))
}));
