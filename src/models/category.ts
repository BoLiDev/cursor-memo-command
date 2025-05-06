/** @format */

/**
 * Represents a category for organizing memo items.
 */
export interface Category {
  /**
   * Unique identifier for the category (currently the category name).
   * @todo Consider using a more stable UUID in the future, especially if names become mutable independently of ID.
   */
  id: string;
  /**
   * Display name of the category.
   */
  name: string;
}
