/** A selectable question bank. `id` is the JSON file name under /public. */
export interface BankInfo {
  id: string;
  label: string;
}

/**
 * The question banks the user can choose from. Add new entries here as more
 * banks become available; the UI picks them up automatically.
 */
export const BANKS: BankInfo[] = [
  { id: "Written_Test_Question_Bank", label: "Written Test Question Bank" },
  { id: "Hazard_Perception_Multiple", label: "Hazard Perception" },
  { id: "Regulations_Multiple", label: "Regulations" },
  { id: "Signs_Multiple", label: "Signs" },
];

export const DEFAULT_BANK = BANKS[0].id;
