/** @format */

import * as vscode from "vscode";
import { MemoItem } from "./extension";

/**
 * TreeView data provider for displaying command list in the sidebar
 */
export class MemoTreeDataProvider implements vscode.TreeDataProvider<MemoItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    MemoItem | undefined | null | void
  > = new vscode.EventEmitter<MemoItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    MemoItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private memoItems: MemoItem[] = [];
  private commandCallback: string | undefined;

  constructor(initialItems: MemoItem[]) {
    this.memoItems = initialItems;
  }

  /**
   * Set command to execute when item is clicked
   */
  setCommandCallback(commandId: string): void {
    this.commandCallback = commandId;
  }

  /**
   * Refresh TreeView data
   */
  refresh(newItems: MemoItem[]): void {
    this.memoItems = newItems;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item
   */
  getTreeItem(element: MemoItem): vscode.TreeItem {
    // Use alias if available, otherwise use label
    const displayName = element.alias || element.label;

    const treeItem = new vscode.TreeItem(
      displayName,
      vscode.TreeItemCollapsibleState.None
    );

    treeItem.description = new Date(element.timestamp).toLocaleString();
    treeItem.iconPath = new vscode.ThemeIcon("note");

    // Show command text in tooltip for better usability
    treeItem.tooltip = element.command;

    // Set context value for menu contributions
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
   * Get children
   */
  getChildren(element?: MemoItem): MemoItem[] {
    if (element) {
      return [];
    }

    return this.memoItems.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get parent
   */
  getParent(element: MemoItem): vscode.ProviderResult<MemoItem> {
    return null;
  }
}
