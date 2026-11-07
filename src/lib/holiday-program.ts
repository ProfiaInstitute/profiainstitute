export function hasValidHolidayModuleSelection(
  availableModuleCount: number,
  selectedModuleCount: number,
) {
  return availableModuleCount === 0 || selectedModuleCount > 0;
}
