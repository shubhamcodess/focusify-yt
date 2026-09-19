/**
 * Optional one-click topic presets shown in the popup. Pure data: add, remove or edit
 * entries freely. Nothing in the engine depends on any preset.
 */
const FOCUSIFY_PRESETS = [
  {
    id: 'cs', icon: '💻', label: 'Coding',
    genre: 'Computer Science & Software Engineering',
    positive: 'programming, coding, algorithm, system design, python, javascript, database, computer science',
    negative: 'vlog, gaming, prank, reaction, drama, music video'
  },
  {
    id: 'math', icon: '📐', label: 'Math',
    genre: 'Mathematics & Statistics',
    positive: 'mathematics, calculus, linear algebra, proof, probability, statistics, geometry, problem solving',
    negative: 'vlog, gaming, prank, reaction, drama, challenge'
  },
  {
    id: 'science', icon: '🔬', label: 'Science',
    genre: 'Physics, Chemistry & Engineering',
    positive: 'physics, chemistry, mechanics, thermodynamics, electromagnetism, experiment, engineering',
    negative: 'vlog, gaming, prank, reaction, drama, unboxing'
  },
  {
    id: 'finance', icon: '📊', label: 'Finance',
    genre: 'Finance, Economics & Entrepreneurship',
    positive: 'economics, financial modeling, investing, valuation, market analysis, business strategy, case study',
    negative: 'get rich quick, luxury lifestyle, vlog, gaming, prank, drama'
  },
  {
    id: 'languages', icon: '🗣️', label: 'Languages',
    genre: 'Language Learning & Linguistics',
    positive: 'grammar, vocabulary, pronunciation, listening practice, dialogue, immersion, language lesson',
    negative: 'vlog, gaming, prank, reaction, drama, challenge'
  }
];

globalThis.FOCUSIFY_PRESETS = FOCUSIFY_PRESETS;
