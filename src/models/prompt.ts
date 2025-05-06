/** @format */

/**
 * Data structure for memo items
 */
export interface Prompt {
  id: string;
  label: string;
  content: string;
  timestamp: number;
  alias?: string;
  categoryId: string;
  isCloud?: boolean;
}
