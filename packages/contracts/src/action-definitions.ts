import { Action, ActionName } from './actions.js';

/**
 * Section 06. The arguments the agent sends for an Action are the Action's own schema minus
 * its discriminant, so the vocabulary and the prompt cannot disagree.
 */

/** Written for the model: what it does, and what it costs the shopper if it is wrong. */
export const ACTION_DESCRIPTIONS: Record<ActionName, string> = {
  navigate: 'Move the shopper to a URL on this store. The page will reload.',
  open_product:
    'Open a product page for a product you have already found. Prefer this over navigate ' +
    'when you have a product_id.',
  select_variant:
    'Choose a size or option on the product page the shopper is looking at. Returns the ' +
    'new price and availability.',
  add_to_cart:
    'Add a variant to the cart. Only call this after the shopper has agreed to this exact ' +
    'product in the turn before. Never call it to check a price.',
  update_cart_line:
    'Change the quantity of a line already in the cart; qty 0 removes it. Needs the same ' +
    'confirmation as adding.',
  apply_filter:
    'Narrow the collection the shopper is looking at by a facet. Use this rather than ' +
    'searching again when they are refining what is already on screen.',
  sort: 'Reorder the products on screen.',
  scroll_to: 'Bring something already on the page into view.',
  submit_form: 'Fill and submit a form on the page, such as a newsletter signup.',
  show_in_widget:
    'Show a small panel of products in the voice widget so the shopper can see what you ' +
    'are describing without leaving the page.',
};

/** The member schema still carries its `action` literal; the generator drops it. */
export function actionSchema(name: ActionName) {
  const member = Action.options.find((option) => option.shape.action.value === name);
  if (!member) throw new Error(`No schema for action ${name}`);
  return member;
}

/**
 * In the vocabulary but not yet offered to the agent: the Preview Panel does not exist, so
 * `show_in_widget` succeeds silently and the agent narrates a panel the shopper cannot see.
 * Delete the entry when the panel ships.
 */
export const UNOFFERED_ACTIONS: ReadonlySet<ActionName> = new Set(['show_in_widget']);
