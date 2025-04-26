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

  constructor(initialItems: MemoItem[]) {
    this.memoItems = initialItems;
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
    const treeItem = new vscode.TreeItem(
      element.label,
      vscode.TreeItemCollapsibleState.None
    );

    treeItem.description = new Date(element.timestamp).toLocaleString();
    treeItem.iconPath = new vscode.ThemeIcon("note");
    treeItem.tooltip = element.command;
    treeItem.contextValue = "memoItem";

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
