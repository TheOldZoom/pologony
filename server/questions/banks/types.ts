type Entry = [
  prompt: string,
  hint: string,
  explanation: string,
  answer: string,
  ...wrong: [string, string, string],
];

export type BilingualEntry = [spanish: Entry, english: Entry];
