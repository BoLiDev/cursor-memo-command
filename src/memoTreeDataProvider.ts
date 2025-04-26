/** @format */

import * as vscode from "vscode";
import { MemoItem, MemoDataService } from "./memoDataService";

/**
 * Category node type
 */
export class CategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.contextValue = "category";
    this.iconPath = new vscode.ThemeIcon("folder");
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
  private categoryNodes: Map<string, CategoryTreeItem> = new Map();

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

    const allCategories = this.dataService.getCategories();
    const allCommands = this.dataService.getCommands();

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

    for (const [category, items] of this.categories.entries()) {
      this.categories.set(
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
    treeItem.iconPath = new vscode.ThemeIcon("note");
    treeItem.tooltip = element.command;
    treeItem.contextValue = "memoItem";

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
      const defaultCategory = this.dataService.getDefaultCategory();
      const sortedCategories = Array.from(this.categories.keys()).sort(
        (a, b) => {
          if (a === defaultCategory) return 1;
          if (b === defaultCategory) return -1;
          return a.localeCompare(b);
        }
      );

      return sortedCategories.map(
        (category) => this.categoryNodes.get(category)!
      );
    }

    if (element instanceof CategoryTreeItem) {
      return this.categories.get(element.label) || [];
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
      return this.categoryNodes.get(categoryName);
    }

    return null;
  }
}
