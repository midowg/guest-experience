import { fireEvent, screen, within } from "@testing-library/react";

/** The editor's side menu, where an admin picks which block's form to show. */
export const editorMenu = () => screen.getByRole("navigation", { name: "Bagian acara" });
const exact = (title: string) => new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
/** A block's menu button, or null when the block is not offered. */
export const menuButton = (title: string) => within(editorMenu()).queryByRole("button", { name: exact(title) });
/** Open a block the way an admin does: from the menu. */
export function openBlock(title: string) {
  const button = menuButton(title);
  if (!button) throw new Error(`No menu entry for ${title}`);
  fireEvent.click(button);
}
/** The "Bagian lain" fold at the bottom of the menu. */
export const otherBlocks = () => within(editorMenu()).queryByText(/^Bagian lain/)?.closest("details") ?? null;
