# Prototype: page context emitter (ticket 005)

Throwaway. Exists to make the shape concrete enough to argue with.

## The problem it answers

v1's agent hallucinated products when asked about what was on screen, because it had no
grounded representation of the page — only a fuzzy `get_collection_products(collection_name)`
that guessed, and a language model that filled the silence when the guess missed.

## Principle

**The page supplies identity. The catalogue supplies facts.**

The emitters below carry ids, handles, titles, and positions — never descriptions, never
anything the agent should quote as product truth beyond a name and a price. Every real fact
comes from a catalogue lookup keyed by the id the page supplied. If the page says nothing,
the agent has nothing, which is the point: there is no gap for invention to fill.

## Two layers, because one is not enough

| Layer | File | Sees | Blind to |
| --- | --- | --- | --- |
| Template | `agent-page-context.liquid` | `product`, `collection`, `search`, `cart` globals — what page *is* this | sections composed onto the page |
| Section | `agent-section-context.liquid` | exactly the products a section rendered, post-limit | nothing, within its section |

The template layer is rendered once from `theme.liquid`, next to the existing
`{% section 'shopify-mcp-agent' %}` hook. It handles product, collection, and search pages —
most of the store.

The section layer is one `{% render %}` line added inside each merchandise section. This is
the part an **app embed block cannot do**: an embed runs in the layout and cannot enumerate
the sections a template composed, so on a homepage with three `featured-collection` sections
it is blind. Editing the theme is what buys this.

On the dev store's `index.json`, that means `featured-collection` ×3. The collection page
needs the same line inside `main-collection-product-grid.liquid`, inside the `paginate`
block so it reflects the current page.

## Wiring

```liquid
{%- comment -%} layout/theme.liquid, beside the existing agent section {%- endcomment -%}
{% render 'agent-page-context' %}
{% section 'shopify-mcp-agent' %}
```

```liquid
{%- comment -%} sections/featured-collection.liquid, before the product grid {%- endcomment -%}
{% render 'agent-section-context',
   section: section,
   kind: 'featured-collection',
   label: section.settings.title,
   collection: section.settings.collection,
   products: section.settings.collection.products,
   limit: section.settings.products_to_show %}
```

```liquid
{%- comment -%} sections/main-collection-product-grid.liquid, inside {%- paginate -%} {%- endcomment -%}
{% render 'agent-section-context',
   section: section,
   kind: 'collection-grid',
   label: collection.title,
   collection: collection,
   products: collection.products %}
```

## How the widget uses it

On page load the widget reads `#agent-page-context` plus every
`.agent-section-context`, assembles one Page Context object, and sends it with the session
id to call creation. The backend folds it into the Session Seed
([ADR-0001](../../../adr/0001-reconnect-with-replay-voice-continuity.md)), so page awareness
rides the same path as transcript replay rather than inventing a second one.

Because a Call Leg starts on every navigation, page context refreshes for free on every
page. No polling, no staleness.

## Your candle case, traced

Shopper is on the homepage, asks "tell me about these candles".

1. Section emitter already published: `collection.handle = "jo-malone-candle-collection"`,
   `label = "Jo Malone Candle Collection"`, and the exact 4 products with ids and handles.
2. Seed contains those 4 ids. The agent knows the collection has 4 visible of
   `total_products`, and knows their names.
3. Agent answers from the seed, or calls the catalogue with **ids**, not a guessed name.

There is no step where a collection name is resolved by similarity, which is where v1 went
wrong.

## Known gaps

- **Furniture** (banners, forms, rich text) is not emitted. Those need affordances, not
  facts — ticket 007.
- **Size** on a 50-product collection page: roughly 4KB of JSON. Probably fine, worth
  measuring; truncation with a stated total is the obvious lever.
- **In-page mutation**: filters and "load more" change the grid without a page load, so the
  emitted JSON goes stale within the page. Needs a refresh path.
- **Section Rendering API** responses would need the emitter to survive the swap.
