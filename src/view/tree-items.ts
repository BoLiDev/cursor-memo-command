/** @format */

import * as vscode from "vscode";

/**
 * Category group type (top level node: Local/Cloud)
 */
export class CategoryGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isCloud: boolean = false
  ) {
    super(label, collapsibleState);
    this.contextValue = "categoryGroup";
    this.iconPath = new vscode.ThemeIcon(isCloud ? "cloud" : "library");
  }
}

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
    this.iconPath = new vscode.ThemeIcon("folder");
  }
}
