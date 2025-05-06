/** @format */

import * as vscode from "vscode";
import { MemoItem } from "../models/memo-item";
import { LocalService } from "../services/local-service";
import { CloudService } from "../services/cloud-service";
import { CategoryTreeItem, CategoryGroupTreeItem } from "./tree-items";
import { MemoTreeViewModel } from "./view-model";

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
  private viewModelListener: vscode.Disposable | undefined;

  /**
   * Constructor
   * @param localDataService Service instance for local data
   * @param cloudStoreService Service instance for cloud data (CloudStore)
   */
  constructor(
    private localDataService: LocalService,
    private cloudStoreService: CloudService
  ) {
    this.viewModel = new MemoTreeViewModel(
      this.localDataService,
      this.cloudStoreService
    );

    this.viewModelListener = this.viewModel.onDidViewModelUpdate(() => {
      console.log(
        "TreeProvider: Received view model update, firing tree data change."
      );
      this._onDidChangeTreeData.fire();
    });
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
    element?: CategoryGroupTreeItem | CategoryTreeItem | MemoItem
  ): (CategoryGroupTreeItem | CategoryTreeItem | MemoItem)[] {
    if (!element) {
      const groups: CategoryGroupTreeItem[] = [];
      groups.push(this.viewModel.getLocalGroupNode());
      groups.push(this.viewModel.getCloudGroupNode());
      return groups;
    }

    if (element instanceof CategoryGroupTreeItem) {
      return element.isCloud
        ? this.viewModel.getSortedCloudCategories()
        : this.viewModel.getSortedLocalCategories();
    }

    if (element instanceof CategoryTreeItem) {
      return element.isCloud
        ? this.viewModel.getCloudCategoryItems(element.category.id)
        : this.viewModel.getLocalCategoryItems(element.category.id);
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
    element: CategoryGroupTreeItem | CategoryTreeItem | MemoItem
  ): vscode.ProviderResult<
    CategoryGroupTreeItem | CategoryTreeItem | MemoItem
  > {
    if (element instanceof CategoryGroupTreeItem) {
      return null;
    }

    if (element instanceof CategoryTreeItem) {
      return element.isCloud
        ? this.viewModel.getCloudGroupNode()
        : this.viewModel.getLocalGroupNode();
    }

    return this.viewModel.getCategoryNodeForItem(element);
  }

  /**
   * Dispose resources when the provider is no longer needed.
   */
  public dispose(): void {
    this.viewModelListener?.dispose();
    this.viewModel.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
