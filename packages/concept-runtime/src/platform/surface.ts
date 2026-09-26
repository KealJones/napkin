/** The browser host offers everything the Node host does: a compile-time check, no code. */
import type * as Browser from "./browser.js";
import type * as Node from "./node.js";

export type BrowserCoversNode = typeof Browser extends typeof Node ? true : never;
const covered: BrowserCoversNode = true;
void covered;
