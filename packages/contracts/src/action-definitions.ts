import { Action, ActionName } from './actions.js';

/**
 * Section 06. The arguments the agent sends for an Action are the Action's own schema minus
 * its discriminant, so the vocabulary and the prompt cannot disagree.
 */

/** Written for the model: what it does, and what it costs the shopper if it is wrong. */
export const ACTION_DESCRIPTIONS: Record<ActionName, string> = {
  navigate:
    'Move the shopper to a page on this store. destination_id must be an id from ' +
    'wayfinder_seed.destinations; never invent one. The page will reload.',
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
  fill_form:
    'Fill the visible Contact form with details the shopper provided. Use fields name, email, phone, and body. This does not submit the form. After it is ready, ask the shopper whether to send it.',
  submit_form:
    'Submit the prepared Contact form. Only call after the shopper explicitly said to send it in the immediately preceding turn. Do not claim success until the next page confirms it.',
  show_in_widget:
    'Show a small panel of products in the voice widget so the shopper can see what you ' +
    'are describing without leaving the page.',
  show_preview:
    'Show the products from your last search as tiles in the widget. Use when the shopper ' +
    'accepts your offer to see them now, or asks to see them.',
  show_on_page:
    'Take the shopper to the products from your last search: scrolls to them if they are on ' +
    'this page, otherwise opens a page listing them. Use when the shopper accepts your offer ' +
    'to be taken to them, or asks to be taken there.',
};

/** The member schema still carries its `action` literal; the generator drops it. */
export function actionSchema(name: ActionName) {
  const member = Action.options.find((option) => option.shape.action.value === name);
  if (!member) throw new Error(`No schema for action ${name}`);
  return member;
}

/**
 * Fields the backend fills in on the way to the browser. They are part of the Action but not
 * part of the agent's vocabulary, so the generated tool definition drops them.
 */
export const SERVER_FILLED: Partial<Record<ActionName, readonly string[]>> = {
  navigate: ['url'],
  open_product: ['url'],
  show_in_widget: ['tiles'],
};

/**
 * In the vocabulary but not offered to the agent. The backend shows search results in the
 * Preview Panel itself, so the panel never depends on the model remembering to (KF-001).
 */
export const UNOFFERED_ACTIONS: ReadonlySet<ActionName> = new Set(['show_in_widget']);
