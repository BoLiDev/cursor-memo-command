/** @format */

import * as vscode from "vscode";
import { MemoItem } from "../models/memo-item";
import { LocalMemoService } from "../services/local-data-service";
import { CloudStoreService } from "../services/cloud-store-service";
import { CategoryTreeItem, CategoryGroupTreeItem } from "./tree-items";
import { MemoTreeViewModel } from "./view-model";

// 重新导出树项类型，以便其他模块可以访问
export { CategoryTreeItem, CategoryGroupTreeItem } from "./tree-items";

/**
 * TreeView data provider - responsible for rendering the view
 */
export class MemoTreeDataProvider
  implements
    vscode.TreeDataProvider<CategoryGroupTreeItem | CategoryTreeItem | MemoItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    | CategoryGroupTreeItem
    | CategoryTreeItem
    | MemoItem
    | undefined
    | null
    | void
  > = new vscode.EventEmitter<
    | CategoryGroupTreeItem
    | CategoryTreeItem
    | MemoItem
    | undefined
    | null
    | void
  >();

  readonly onDidChangeTreeData: vscode.Event<
    | CategoryGroupTreeItem
    | CategoryTreeItem
    | MemoItem
    | undefined
    | null
    | void
  > = this._onDidChangeTreeData.event;

  private commandCallback: string | undefined;
  private viewModel: MemoTreeViewModel;

  /**
   * Constructor
   * @param localDataService Service instance for local data
   * @param cloudStoreService Service instance for cloud data (CloudStore)
   */
  constructor(
    private localDataService: LocalMemoService,
    private cloudStoreService: CloudStoreService
  ) {
    this.viewModel = new MemoTreeViewModel(
      this.localDataService,
      this.cloudStoreService
    );
    this.updateView();
  }

  /**
   * Update view data, refresh the display of categories and commands
   * Call this method when data changes
   */
  public updateView(): void {
    this.viewModel.update();
    this._onDidChangeTreeData.fire();
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
   * @param element Element (group, category, or command item) to get display information for
   * @returns Configured TreeItem instance
   */
  getTreeItem(
    element: CategoryGroupTreeItem | CategoryTreeItem | MemoItem
  ): vscode.TreeItem {
    if (
      element instanceof CategoryGroupTreeItem ||
      element instanceof CategoryTreeItem
    ) {
      // CategoryGroupTreeItem and CategoryTreeItem already are TreeItems
      return element;
    }

    // Handle MemoItem
    const displayName = element.alias || element.label;
    const treeItem = new vscode.TreeItem(
      displayName,
      vscode.TreeItemCollapsibleState.None
    );

    treeItem.description = new Date(element.timestamp).toLocaleString();
    // Always use the 'note' icon for command items, regardless of local/cloud
    treeItem.iconPath = new vscode.ThemeIcon("note");
    treeItem.tooltip = element.command;
    // Context value still distinguishes between local and cloud items
    treeItem.contextValue = element.isCloud ? "cloudMemoItem" : "memoItem";

    if (this.commandCallback) {
      treeItem.command = {
        command: this.commandCallback,
        title: "Execute Command",
        arguments: [element], // Pass the MemoItem itself
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
    element?: CategoryGroupTreeItem | CategoryTreeItem | MemoItem
  ): (CategoryGroupTreeItem | CategoryTreeItem | MemoItem)[] {
    if (!element) {
      // --- Root Level: Return "Local" and "Cloud" group nodes ---
      const groups: CategoryGroupTreeItem[] = [];
      groups.push(this.viewModel.getLocalGroupNode());
      // Always show Cloud group, even if empty, to allow sync
      groups.push(this.viewModel.getCloudGroupNode());
      return groups;
    }

    if (element instanceof CategoryGroupTreeItem) {
      // --- Second Level: Return Categories under "Local" or "Cloud" ---
      return element.isCloud
        ? this.viewModel.getSortedCloudCategories()
        : this.viewModel.getSortedLocalCategories();
    }

    if (element instanceof CategoryTreeItem) {
      // --- Third Level: Return MemoItems under a specific category ---
      return element.isCloud
        ? this.viewModel.getCloudCategoryItems(element.category.id)
        : this.viewModel.getLocalCategoryItems(element.category.id);
    }

    // MemoItems have no children
    return [];
  }

  /**
   * Get the parent element of the specified element
   * Required method for implementing TreeDataProvider interface
   * @param element Element to get the parent for
   * @returns Parent element, or null if there is none
   */
  getParent(
    element: CategoryGroupTreeItem | CategoryTreeItem | MemoItem
  ): vscode.ProviderResult<
    CategoryGroupTreeItem | CategoryTreeItem | MemoItem
  > {
    if (element instanceof CategoryGroupTreeItem) {
      // Group nodes are root level
      return null;
    }

    if (element instanceof CategoryTreeItem) {
      // Category nodes' parent is the corresponding group node
      return element.isCloud
        ? this.viewModel.getCloudGroupNode()
        : this.viewModel.getLocalGroupNode();
    }

    // MemoItem's parent is its category node (local or cloud)
    return this.viewModel.getCategoryNodeForItem(element);
  }
}
