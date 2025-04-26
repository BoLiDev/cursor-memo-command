/** @format */

import * as vscode from "vscode";
import { MemoItem } from "./extension";

/**
 * TreeView 数据提供者，负责将指令列表显示在侧边栏
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
   * 刷新 TreeView 数据
   */
  refresh(newItems: MemoItem[]): void {
    this.memoItems = newItems;
    this._onDidChangeTreeData.fire();
  }

  /**
   * 获取树节点
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
   * 获取子节点
   */
  getChildren(element?: MemoItem): MemoItem[] {
    if (element) {
      return [];
    }

    return this.memoItems.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 获取父节点
   */
  getParent(element: MemoItem): vscode.ProviderResult<MemoItem> {
    return null;
  }
}
