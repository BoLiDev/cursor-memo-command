/** @format */

import * as vscode from "vscode";
import { MemoItem } from "../models/memo-item";
import { LocalMemoService } from "../services/local-data-service";
import { CloudStoreService } from "../services/cloud-store-service";
import { CategoryTreeItem, CategoryGroupTreeItem } from "./tree-items";

/**
 * Manages the data state for the TreeView
 */
export class MemoTreeViewModel {
  private localCommands: MemoItem[] = [];
  private cloudCommands: MemoItem[] = [];
  private localCategories: string[] = [];
  private cloudCategoriesSet: Set<string> = new Set();

  private localCategoryNodes: Map<string, CategoryTreeItem> = new Map();
  private cloudCategoryNodes: Map<string, CategoryTreeItem> = new Map();

  private localGroupNode: CategoryGroupTreeItem;
  private cloudGroupNode: CategoryGroupTreeItem;

  /**
   * Constructor
   * @param localDataService Service for local data
   * @param cloudStoreService Service for cloud data
   */
  constructor(
    private localDataService: LocalMemoService,
    private cloudStoreService: CloudStoreService
  ) {
    // Initialize group nodes
    this.localGroupNode = new CategoryGroupTreeItem(
      "Local",
      vscode.TreeItemCollapsibleState.Expanded,
      false // isCloud = false
    );
    this.cloudGroupNode = new CategoryGroupTreeItem(
      "Cloud",
      vscode.TreeItemCollapsibleState.Expanded,
      true // isCloud = true
    );
    this.update(); // Initial data load
  }

  /**
   * Update the view model state from the data services
   */
  public update(): void {
    // Fetch latest data
    this.localCommands = this.localDataService.getCommands();
    this.cloudCommands = this.cloudStoreService.getCloudCommands(); // Get cloud commands from new service
    this.localCategories = this.localDataService.getCategories();

    // Update cloud categories set
    this.cloudCategoriesSet.clear();
    this.cloudCommands.forEach((cmd) => {
      this.cloudCategoriesSet.add(
        cmd.category || this.localDataService.getDefaultCategory()
      );
    });

    // Rebuild category nodes
    this.rebuildCategoryNodes();
  }

  /**
   * Check if there are any local commands or categories (excluding default if empty).
   * @returns True if local data exists, false otherwise.
   */
  public hasLocalData(): boolean {
    return (
      this.localCommands.length > 0 ||
      this.localCategories.filter(
        (cat) => cat !== this.localDataService.getDefaultCategory()
      ).length > 0
    );
  }

  /**
   * Rebuilds the internal maps of category tree items.
   */
  private rebuildCategoryNodes(): void {
    this.localCategoryNodes.clear();
    this.cloudCategoryNodes.clear();

    // --- Create Local Category Nodes ---
    this.localCategories.forEach((cat) => {
      const items = this.getLocalCategoryItems(cat);
      const collapsibleState =
        items.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
      this.localCategoryNodes.set(
        cat,
        new CategoryTreeItem(
          cat,
          collapsibleState, // Set state during creation
          false // isCloud = false
        )
      );
    });

    // --- Create Cloud Category Nodes ---
    this.cloudCategoriesSet.forEach((cat) => {
      const items = this.getCloudCategoryItems(cat);
      // Avoid duplicating default category if it also exists locally and is empty in cloud
      if (
        cat === this.localDataService.getDefaultCategory() &&
        this.localCategoryNodes.has(cat) &&
        !items.length
      ) {
        return;
      }
      const collapsibleState =
        items.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
      this.cloudCategoryNodes.set(
        cat,
        new CategoryTreeItem(
          cat,
          collapsibleState, // Set state during creation
          true // isCloud = true
        )
      );
    });

    // --- Update Group Node States ---
    const localCollapsibleState = this.hasLocalData()
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;
    this.localGroupNode = new CategoryGroupTreeItem(
      this.localGroupNode.label!, // Reuse label
      localCollapsibleState, // Set state during creation
      false
    );

    const cloudCollapsibleState =
      this.cloudCommands.length > 0 || this.cloudCategoriesSet.size > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed; // Keep collapsed if empty
    this.cloudGroupNode = new CategoryGroupTreeItem(
      this.cloudGroupNode.label!, // Reuse label
      cloudCollapsibleState, // Set state during creation
      true
    );
  }

  // --- Getters for TreeDataProvider ---

  public getLocalGroupNode(): CategoryGroupTreeItem {
    return this.localGroupNode;
  }

  public getCloudGroupNode(): CategoryGroupTreeItem {
    return this.cloudGroupNode;
  }

  public getSortedLocalCategories(): CategoryTreeItem[] {
    return Array.from(this.localCategoryNodes.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }

  public getSortedCloudCategories(): CategoryTreeItem[] {
    // Filter out empty default category if it exists locally
    const cloudCats = Array.from(this.cloudCategoryNodes.values()).filter(
      (node) => {
        if (
          node.label === this.localDataService.getDefaultCategory() &&
          this.localCategoryNodes.has(node.label)
        ) {
          return this.getCloudCategoryItems(node.label).length > 0;
        }
        return true;
      }
    );
    return cloudCats.sort((a, b) => a.label.localeCompare(b.label));
  }

  public getLocalCategoryItems(category: string): MemoItem[] {
    return this.localCommands
      .filter((item) => item.category === category)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  public getCloudCategoryItems(category: string): MemoItem[] {
    return this.cloudCommands
      .filter((item) => item.category === category)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  public getCategoryNodeForItem(item: MemoItem): CategoryTreeItem | undefined {
    return item.isCloud
      ? this.cloudCategoryNodes.get(item.category)
      : this.localCategoryNodes.get(item.category);
  }
}
