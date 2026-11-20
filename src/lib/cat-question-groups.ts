export type SharedQuestionGroupInput = {
  sharedGroup?: string | null;
  sharedPrompt?: string | null;
  groupPosition?: string | number | null;
};

export function validateSharedQuestionGroups(questions: SharedQuestionGroupInput[]) {
  const groups = new Map<string, { prompt: string; positions: Set<number>; count: number }>();

  for (const [index, question] of questions.entries()) {
    const group = question.sharedGroup?.trim() ?? "";
    const prompt = question.sharedPrompt?.trim() ?? "";
    const position = Number(question.groupPosition);

    if (!group && !prompt) continue;
    if (!group || !prompt) {
      return `Question ${index + 1}: enter both the shared question group and its instructions.`;
    }
    if (group.length > 120 || prompt.length > 4000) {
      return `Question ${index + 1}: the group name or shared instructions are too long.`;
    }
    if (!Number.isInteger(position) || position < 1 || position > 100) {
      return `Question ${index + 1}: enter a group step number from 1 to 100.`;
    }

    const existing = groups.get(group);
    if (!existing) {
      groups.set(group, { prompt, positions: new Set([position]), count: 1 });
      continue;
    }
    if (existing.prompt !== prompt) {
      return `All questions in "${group}" must use the same shared instructions.`;
    }
    if (existing.positions.has(position)) {
      return `Questions in "${group}" must have different step numbers.`;
    }
    existing.positions.add(position);
    existing.count += 1;
  }

  for (const [group, details] of groups) {
    if (details.count < 2) {
      return `Add at least two questions to the shared group "${group}".`;
    }
  }

  return null;
}

export function orderCatPaperQuestions<T extends SharedQuestionGroupInput>(questions: T[]) {
  const groups = new Map<string, { firstIndex: number; questions: T[] }>();
  const individual: T[] = [];

  questions.forEach((question, index) => {
    const group = question.sharedGroup?.trim();
    if (!group) {
      individual.push(question);
      return;
    }
    const existing = groups.get(group);
    if (existing) existing.questions.push(question);
    else groups.set(group, { firstIndex: index, questions: [question] });
  });

  const grouped = [...groups.values()]
    .sort((left, right) => left.firstIndex - right.firstIndex)
    .flatMap(({ questions: groupQuestions }) =>
      groupQuestions.sort(
        (left, right) => Number(left.groupPosition) - Number(right.groupPosition),
      ),
    );

  return [...grouped, ...individual];
}
