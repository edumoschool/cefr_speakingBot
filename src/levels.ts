export const CRITERIA_NAMES: Record<string, string> = {
  fluency_coherence: 'Fluency & coherence',
  lexical_resource: 'Vocabulary',
  grammar: 'Grammar',
  pronunciation: 'Pronunciation',
  task_response: 'Task response',
};

export function levelColor(level: string): string {
  if (level.startsWith('C1')) return 'success';
  if (level.startsWith('B2')) return 'primary';
  if (level.startsWith('B1')) return 'warning';
  return 'danger';
}
