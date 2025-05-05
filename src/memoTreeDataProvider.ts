/** @format */

import * as vscode from "vscode";
import { MemoItem, MemoDataService } from "./memoDataService";

/**
 * Category node type
 */
export class CategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isCloud: boolean = false
  ) {
    super(label, collapsibleState);
    this.contextValue = isCloud ? "cloudCategory" : "category";
    this.iconPath = new vscode.ThemeIcon(isCloud ? "cloud" : "folder");
  }
}

/**
 * TreeView data provider - responsible for rendering the view
 */
export class MemoTreeDataProvider
  implements vscode.TreeDataProvider<CategoryTreeItem | MemoItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    CategoryTreeItem | MemoItem | undefined | null | void
  > = new vscode.EventEmitter<
    CategoryTreeItem | MemoItem | undefined | null | void
  >();

  readonly onDidChangeTreeData: vscode.Event<
    CategoryTreeItem | MemoItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private commandCallback: string | undefined;
  private categories: Map<string, MemoItem[]> = new Map();
  private cloudCategories: Map<string, MemoItem[]> = new Map();
  private categoryNodes: Map<string, CategoryTreeItem> = new Map();
  private cloudCategoryNodes: Map<string, CategoryTreeItem> = new Map();

  /**
   * Constructor
   * @param dataService Data service instance that provides categories and commands data
   */
  constructor(private dataService: MemoDataService) {
    this.updateView();
  }

  /**
   * Update view data, refresh the display of categories and commands
   * Call this method when data changes
   */
  public updateView(): void {
    this.updateCategoriesMap();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Update categories map
   * Clears and rebuilds the categories and categoryNodes maps
   * Organizes commands by category and sorts them by timestamp
   */
  private updateCategoriesMap(): void {
    this.categories.clear();
    this.categoryNodes.clear();
    this.cloudCategories.clear();
    this.cloudCategoryNodes.clear();

    const allCategories = this.dataService.getCategories();
    const allCommands = this.dataService.getCommands();
    const allCloudCommands = this.dataService.getCloudCommands();

    // Setup local categories
    allCategories.forEach((category) => {
      if (!this.categories.has(category)) {
        this.categories.set(category, []);

        this.categoryNodes.set(
          category,
          new CategoryTreeItem(
            category,
            vscode.TreeItemCollapsibleState.Expanded
          )
        );
      }
    });

    // Organize local commands by category
    allCommands.forEach((item) => {
      const category = item.category || this.dataService.getDefaultCategory();
      if (!this.categories.has(category)) {
        this.categories.set(category, []);

        this.categoryNodes.set(
          category,
          new CategoryTreeItem(
            category,
            vscode.TreeItemCollapsibleState.Expanded
          )
        );
      }
      this.categories.get(category)?.push(item);
    });

    // Setup cloud categories and organize cloud commands
    const cloudCategoriesSet = new Set<string>();

    allCloudCommands.forEach((item) => {
      const category = item.category || this.dataService.getDefaultCategory();
      cloudCategoriesSet.add(category);

      if (!this.cloudCategories.has(category)) {
        this.cloudCategories.set(category, []);

        this.cloudCategoryNodes.set(
          category,
          new CategoryTreeItem(
            category,
            vscode.TreeItemCollapsibleState.Expanded,
            true // isCloud
          )
        );
      }

      this.cloudCategories.get(category)?.push(item);
    });

    // Sort commands by timestamp in each category
    for (const [category, items] of this.categories.entries()) {
      this.categories.set(
        category,
        items.sort((a, b) => b.timestamp - a.timestamp)
      );
    }

    for (const [category, items] of this.cloudCategories.entries()) {
      this.cloudCategories.set(
        category,
        items.sort((a, b) => b.timestamp - a.timestamp)
      );
    }
  }

  /**
   * Set command callback function ID
   * @param commandId Command ID to execute when an item is clicked
   */
  setCommandCallback(commandId: string): void {
    this.commandCallback = commandId;
  }

  /**
   * Get display information for tree item
   * Required method for implementing TreeDataProvider interface
   * @param element Element (category or command item) to get display information for
   * @returns Configured TreeItem instance
   */
  getTreeItem(element: CategoryTreeItem | MemoItem): vscode.TreeItem {
    if (element instanceof CategoryTreeItem) {
      return element;
    }

    const displayName = element.alias || element.label;

    const treeItem = new vscode.TreeItem(
      displayName,
      vscode.TreeItemCollapsibleState.None
    );

    treeItem.description = new Date(element.timestamp).toLocaleString();
    treeItem.iconPath = new vscode.ThemeIcon(
      element.isCloud ? "cloud" : "note"
    );
    treeItem.tooltip = element.command;
    treeItem.contextValue = element.isCloud ? "cloudMemoItem" : "memoItem";

    if (this.commandCallback) {
      treeItem.command = {
        command: this.commandCallback,
        title: "Execute Command",
        arguments: [element],
      };
    }

    return treeItem;
  }

  /**
   * Get child elements of the specified element
   * Required method for implementing TreeDataProvider interface
   * @param element Parent element (if undefined, returns children of the root element)
   * @returns Array of child elements
   */
  getChildren(
    element?: CategoryTreeItem | MemoItem
  ): (CategoryTreeItem | MemoItem)[] {
    if (!element) {
      // Return both local and cloud categories at the root level
      const defaultCategory = this.dataService.getDefaultCategory();

      // Get all local categories and sort them
      const sortedLocalCategories = Array.from(this.categories.keys()).sort(
        (a, b) => {
          if (a === defaultCategory) return 1;
          if (b === defaultCategory) return -1;
          return a.localeCompare(b);
        }
      );

      // Get all cloud categories and sort them
      const sortedCloudCategories = Array.from(
        this.cloudCategories.keys()
      ).sort((a, b) => a.localeCompare(b));

      // Combine local and cloud categories, with cloud categories first
      const localCategoryNodes = sortedLocalCategories.map(
        (category) => this.categoryNodes.get(category)!
      );

      const cloudCategoryNodes = sortedCloudCategories.map(
        (category) => this.cloudCategoryNodes.get(category)!
      );

      return [...cloudCategoryNodes, ...localCategoryNodes];
    }

    if (element instanceof CategoryTreeItem) {
      // Return items from the appropriate category (local or cloud)
      if (element.isCloud) {
        return this.cloudCategories.get(element.label) || [];
      } else {
        return this.categories.get(element.label) || [];
      }
    }

    return [];
  }

  /**
   * Get the parent element of the specified element
   * Required method for implementing TreeDataProvider interface
   * @param element Element to get the parent for
   * @returns Parent element, or null if there is none
   */
  getParent(
    element: CategoryTreeItem | MemoItem
  ): vscode.ProviderResult<CategoryTreeItem | MemoItem> {
    if (!(element instanceof CategoryTreeItem)) {
      const categoryName =
        element.category || this.dataService.getDefaultCategory();

      if (element.isCloud) {
        return this.cloudCategoryNodes.get(categoryName);
      } else {
        return this.categoryNodes.get(categoryName);
      }
    }

    return null;
  }
}
