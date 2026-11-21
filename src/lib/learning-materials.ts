export function filterMaterialsForLevel<T extends { level_ids: string[] | null }>(
  materials: T[],
  levelId: string | null,
): T[] {
  return materials.filter(
    (material) =>
      material.level_ids === null || (levelId !== null && material.level_ids.includes(levelId)),
  );
}
