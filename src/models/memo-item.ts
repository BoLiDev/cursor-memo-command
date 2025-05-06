/** @format */

/**
 * Data structure for memo items
 */
export interface MemoItem {
  id: string;
  label: string;
  command: string;
  timestamp: number;
  alias?: string;
  categoryId: string;
  isCloud?: boolean;
}
