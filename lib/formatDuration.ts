export function formatDurationJa(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}時間${minutes}分`;
  }

  if (hours > 0) {
    return `${hours}時間0分`;
  }

  return `${minutes}分`;
}
