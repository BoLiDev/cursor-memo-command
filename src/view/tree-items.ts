/** @format */

import * as vscode from "vscode";

/**
 * Represents a top-level group (e.g., "Local", "Cloud") in the TreeView.
 */
export class CategoryGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isCloud: boolean // Flag to distinguish Cloud group
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label} Commands`;
    this.description = this.isCloud ? "Synced from GitLab" : "Stored locally";
    // Set context value based on group type
    this.contextValue = this.isCloud ? "cloudGroup" : "localGroup";
    // Set icon based on group type
    this.iconPath = new vscode.ThemeIcon(this.isCloud ? "cloud" : "library");
  }
}

/**
 * Represents a category (folder) within a group in the TreeView.
 */
export class CategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isCloud: boolean // Flag to know if it's a cloud category
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label}`;
    // Set context value based on category type
    this.contextValue = this.isCloud ? "cloudCategory" : "category";
    this.iconPath = vscode.ThemeIcon.Folder;
  }
}
