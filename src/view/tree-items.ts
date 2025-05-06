/** @format */

import * as vscode from "vscode";
import { Category } from "../models/category"; // Import Category

/**
 * Represents a top-level group (e.g., "Local", "Cloud") in the TreeView.
 */
export class CategoryGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isCloud: boolean
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label} Commands`;
    this.description = this.isCloud ? "Synced from GitLab" : "Stored locally";
    this.contextValue = this.isCloud ? "cloudGroup" : "localGroup";
    this.iconPath = new vscode.ThemeIcon(this.isCloud ? "cloud" : "library");
  }
}

/**
 * Represents a category (folder) within a group in the TreeView.
 */
export class CategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly category: Category,
    public collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isCloud: boolean
  ) {
    super(category.name, collapsibleState);
    this.tooltip = isCloud ? `${category.name} (Cloud)` : `${category.name}`;
    this.id = this.isCloud ? `cloud:${category.id}` : `local:${category.id}`;
    this.contextValue = this.isCloud ? "cloudCategory" : "category";
    this.iconPath = vscode.ThemeIcon.Folder;
  }
}
