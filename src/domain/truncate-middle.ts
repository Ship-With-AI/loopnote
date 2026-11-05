export function truncateMiddle(text: string, max = 28): string {
  if (max < 1) return '';
  if (text.length <= max) return text;

  const chars = Array.from(text);
  if (chars.length <= max) return text;

  if (max === 1) return chars[0]!;

  const budget = max - 1;
  const headLen = Math.ceil(budget / 2);
  const tailLen = Math.floor(budget / 2);
  return `${chars.slice(0, headLen).join('')}…${chars.slice(chars.length - tailLen).join('')}`;
}
