# Shopify storefront integration surfaces

Research output for ticket [002](../tickets/002-shopify-storefront-integration-surfaces.md).

Date gathered: 2026-10-06. Storefront API version current at time of writing: `2026-10`.

Conventions in this doc:

- **[FACT]** — stated explicitly in a cited Shopify primary source.
- **[INFERENCE]** — my reasoning from cited facts, not stated by Shopify.
- **[UNANSWERED]** — could not confirm from a primary source.

---

## 1. Widget injection

### App embed blocks render sitewide

- **[FACT]** Theme app extensions contain app blocks (inline, `target: section`) and app embed blocks (`target: head`, `compliance_head`, or `body`). Shopify renders and injects app embed blocks before the closing `</head>` and `</body>` tags. App embed blocks are the documented mechanism for "apps that provide a floating or overlaid component to a page, such as chat bubble apps". — <https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration>
- **[FACT]** App embed blocks are supported in **both** vintage and Online Store 2.0 themes "because they don't rely on sections or JSON templates". App *blocks* (inline) require JSON templates and sections that support `@app` blocks; app embeds do not. — same source
- **[FACT]** App embed blocks are **deactivated by default** after install. A merchant must enable them in the theme editor under **Theme settings → App embeds**, or follow an app-provided deep link of the form
  `https://<myshopifyDomain>/admin/themes/current/editor?context=apps&template=${template}&activateAppId={api_key}/{handle}`. — same source
- **[FACT]** Scope is controlled by the `enabled_on` / `disabled_on` schema attributes. For app embed blocks these limit the block to **templates** (the `groups` sub-attribute applies to app blocks). Accepted template values are the Liquid `request.page_type` values, or `["*"]` for all. You can use only one of `enabled_on` or `disabled_on`. — <https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration> and <https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema#enabled_on>
- **[FACT]** The `request.page_type` value set is: `404`, `article`, `blog`, `captcha`, `cart`, `collection`, `list-collections`, `customers/account`, `customers/activate_account`, `customers/addresses`, `customers/login`, `customers/order`, `customers/register`, `customers/reset_password`, `gift_card`, `index`, `metaobject`, `page`, `password`, `policy`, `product`, `search`. — <https://shopify.dev/docs/api/liquid/objects/request>
- **[INFERENCE]** Omitting `enabled_on`/`disabled_on` entirely gives the widest reach (every template the theme renders through `theme.liquid`). If we want to suppress the widget on, say, the password or 404 page, `disabled_on: { templates: ["password", "404"] }` is the lever. Worth confirming empirically on the target theme.

### Checkout is excluded by the platform, not by us

- **[FACT]** "Theme app extension app blocks and app embed blocks can't be rendered on checkout pages. This includes all pages that are rendered when a customer initiates a checkout, such as **Contact information**, **Shipping method**, **Payment method**, and **Order status**." — <https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#restrictions>
- **[INFERENCE]** We do not need to do anything to exclude checkout. It is a hard platform restriction. The planned architecture's "every page except checkout" is exactly what an app embed gives you by default.

### Alternatives and why app embed wins

- **[FACT]** Script tags are **deprecated**: you cannot create or update script tags after **2026-10-01**, and Shopify stops adding them to storefronts on **2027-03-01**. — <https://shopify.dev/docs/apps/build/online-store> (see also the linked script-tag deprecation page)
- **[FACT]** "If your app integrates with a Shopify theme and you plan to submit it to the Shopify App Store, you must use theme app extensions." — same source
- **[FACT]** Editing theme code directly (via the `Asset` REST Admin API) is listed as "not recommended" and takes the theme off its upgrade path. — same source
- **[FACT]** Shopify's own decision table maps "Your app loads JavaScript on storefront pages, has no UI component, or adds a floating or overlaid element to a theme" → **App embed blocks**. — same source
- **[FACT]** App embed blocks let you load scripts only on specific pages, "which isn't possible with the `ScriptTag` object". — <https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration>
- **[FACT]** Extension size limits that matter for a voice widget: all files ≤ **10 MB** (enforced); Liquid across all files ≤ **100 KB** (enforced); CSS referenced by schema ≤ 100 KB and **JS referenced by schema ≤ 10 KB compressed** — both *suggested*, not enforced. Assets are served from Shopify's CDN. — same source
- **[INFERENCE]** The 10 KB suggested JS budget is the main architectural constraint here. A voice widget bundle will exceed it. Since it's suggested rather than enforced, the practical pattern is a tiny loader in the schema-referenced asset that dynamically imports the real bundle (from the extension's `assets/` CDN path or our own origin). This is inference — Shopify does not document that workaround.

**Conclusion for Q1:** App embed block is the right and effectively the only supported choice. It renders on every template through `theme.liquid`, works on vintage and OS 2.0 themes, and is blocked from checkout by the platform.

---

## 2. Sandboxing

- **[FACT]** App embed blocks are rendered by Shopify as Liquid injected directly before `</head>` or `</body>` in the host document, and their `javascript` / `stylesheet` schema assets are injected into the page as `<script async>` / `<link rel="stylesheet">`. — <https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration>
- **[FACT]** The documented example app embed block is plain markup in the host document:
  `<div style={{position: 'fixed', bottom: '0', right: '0'}}>...</div>`. — same source
- **[FACT]** The sandboxed-by-design storefront extension surface is **web pixels**, which Shopify documents separately for analytics; theme app extensions are not described as sandboxed anywhere in the configuration or restrictions pages. — <https://shopify.dev/docs/apps/build/online-store> (web pixels row in the integration table); restrictions section of the configuration page lists only page restrictions, Liquid object restrictions, and JSON-comment restrictions.
- **[FACT]** The documented restrictions are **Liquid-level**, not DOM-level: theme app extensions cannot access `content_for_header`, `content_for_index`, `content_for_layout`, or any property of the parent `section` object other than `id`. — <https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#restrictions>
- **[FACT]** Shopify's standard-events docs describe the status quo as apps that "read the storefront's DOM or intercept `window.fetch`" — i.e. full same-document JS access is the existing (if discouraged) reality. — <https://shopify.dev/docs/apps/build/online-store/standard-events-and-actions>
- **[INFERENCE]** An app embed runs as first-party JavaScript in the storefront document with **full, unsandboxed DOM access**. There is no iframe, no worker, no sandbox attribute in the documented model. Direct DOM driving is therefore possible. Shopify nowhere states "app embeds have full DOM access" in those words, hence inference rather than fact — but the combination of (a) injection into the host document, (b) a restrictions list that mentions no DOM limits, and (c) Shopify's own description of apps reading the DOM, makes this near-certain.

### Strong caveat: Shopify now provides a sanctioned alternative to DOM driving

- **[FACT]** **Standard storefront events and actions** exist specifically so that "an app or an **AI agent** calls an action to request a change, such as opening the cart", replacing DOM parsing and `window.fetch` interception. — <https://shopify.dev/docs/api/storefront-events-and-actions>
- **[FACT]** Actions live on `window.Shopify.actions`, return promises, and "work out of the box on every Liquid storefront" with nothing to install. The three actions are `getCart`, `updateCart`, and `openCart`. The storefront decides how each one happens, "so an app can add an item to the cart without knowing whether that cart is a drawer or a page". — <https://shopify.dev/docs/api/storefront-events-and-actions/actions/call>
- **[FACT]** Actions are only ready after `DOMContentLoaded`; calling earlier throws a `TypeError` because the runtime loads as a module script. — same source
- **[FACT]** `Shopify.actions.updateCart.isDefault()` returns `true` when the storefront has not overridden the action. The default refreshes the cart where it recognises the theme's rendering, and **falls back to a full page reload where it doesn't**, discarding scroll position and typed input. — same source
- **[FACT]** Events are DOM events with a `shopify:` prefix that bubble to `document`: `shopify:page:view`, `shopify:product:view`, `shopify:product:select`, `shopify:collection:view`, `shopify:collection:update`, `shopify:search:update`, `shopify:cart:view`, `shopify:cart:lines-update`, `shopify:cart:note-update`, `shopify:cart:attributes-update`, `shopify:cart:discount-update`, `shopify:cart:error`. — <https://shopify.dev/docs/api/storefront-events-and-actions/events>
- **[FACT]** Most events come from the theme's own dispatch calls, so "the theme decides which ones exist. Don't assume an event you depend on fires on a given store." The **cart** events are the exception: calling `updateCart` emits them on any storefront. — <https://shopify.dev/docs/api/storefront-events-and-actions/events/listen>
- **[FACT]** Event payloads follow Storefront API shapes in `camelCase`, with GID strings for product/variant IDs and `MoneyV2` for prices. Cart line IDs are inconsistent — "a GID on some storefronts and a raw key on others, depending on which cart API the storefront uses". — same source
- **[FACT]** Shopify explicitly says **not** to use standard events for analytics (they fire regardless of buyer tracking consent); use web pixels for that. — <https://shopify.dev/docs/apps/build/online-store/standard-events-and-actions>
- **[INFERENCE]** For the Wayfinder architecture this is the single most important finding after the UCP migration. Driving the UI should prefer `Shopify.actions` + `shopify:` events, with raw DOM manipulation as a fallback for anything the standard vocabulary doesn't cover (e.g. scrolling to a section, highlighting an element, filling a non-cart form).

---

## 3. Catalogue reads

### 3a. Storefront MCP is dead — this invalidates part of the ticket's framing

- **[FACT]** "The catalog and cart tools on `https://{shop}/api/mcp` were **removed**. Use the Universal Commerce Protocol (UCP) instead." The `shop-chat-agent` sample app and its tutorial are deprecated. — <https://shopify.dev/docs/apps/build/storefront-mcp>
- **[FACT]** Replacement mapping: `search_catalog` / `get_product_details` → **Storefront Catalog MCP** (`search_catalog`, `lookup_catalog`, `get_product`) at `/api/ucp/mcp`; `get_cart` / `update_cart` → **Cart MCP**; checkout URL → **Checkout MCP**. `search_shop_policies_and_faqs` is unchanged and still on `/api/mcp`. — same source

### 3b. Storefront Catalog MCP (UCP)

- **[FACT]** Endpoint: `https://{storedomain}/api/ucp/mcp`, JSON-RPC 2.0 over POST. Every request must include `meta.ucp-agent.profile` — a URL to an agent profile hosted at a well-known URL. The tools returned depend on the capabilities the agent advertises. — <https://shopify.dev/docs/agents/catalog/storefront-catalog>
- **[FACT]** `search_catalog` takes `catalog.query` as **free-text** ("organic coffee beans", "winter jacket"), plus `catalog.context` (`address_country`, `language`, `currency`, and a free-text `intent` field, e.g. "Customer prefers fair trade products") and cursor pagination (`limit` default 10, max 250). — same source
- **[FACT]** Responses return products with handle, title, description (html/plain), URL, categories, `price_range` in minor units, media, options, variants with `sku`/`price`/`availability`, ratings, and arbitrary `metadata`. — same source
- **[FACT]** `lookup_catalog` resolves up to **10** product or variant IDs per call. `get_product` returns one product with `selected` option state and per-option-value `available` / `exists` signals. — same source
- **[FACT]** Shopify-specific extra filters and variant fields are documented separately at <https://shopify.dev/docs/agents/catalog/storefront-catalog-extension>.
- **[FACT]** Shopify's own guidance: "Use Storefront Catalog MCP whenever buyer intent and query are scoped to a single merchant. For example, use Storefront Catalog MCP when building a **storefront AI agent**." — same source
- **[FACT]** Rate limiting is tiered by how the agent identifies itself: **token** (Bearer) > **signed** > **anonymous**. Rate-limited responses carry `Retry-After`; clients should back off exponentially with jitter. Full matrix at <https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting>. — <https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp> (rate limits section)
- **[UNANSWERED]** Whether `search_catalog` is semantic/embedding-based or lexical. The docs describe it only as "free-text search query" and accept a natural-language `intent` hint, which is suggestive but not stated. I could not find a primary source that says what the retrieval method is. The presence of a free-text `intent` field alongside `query` is **[INFERENCE]** evidence of something more than keyword matching.
- **[UNANSWERED]** Production-readiness for a single store. The docs read as GA (no preview/beta banner on the Storefront Catalog MCP page), but the capability version is dated `2026-08-25` and the whole surface replaced Storefront MCP very recently. No stability/SLA statement found.

### 3c. Storefront GraphQL API

- **[FACT]** Single GraphQL endpoint, POST only: `https://{store_name}.myshopify.com/api/{version}/graphql.json`. No REST equivalent. — <https://shopify.dev/docs/api/storefront>
- **[FACT]** Three auth modes:
  - **Tokenless** — no token at all. Covers products, collections, selling plans, **search**, pages/blogs/articles, and **cart (read/write)**. Query complexity capped at **1,000**; exceeding it returns `MAX_COMPLEXITY_EXCEEDED`.
  - **Public access token** — `X-Shopify-Storefront-Access-Token` header, safe to expose in a browser. Created via the Admin GraphQL `storefrontAccessTokenCreate` mutation. Max **100 active storefront access tokens per shop per app**.
  - **Private access token** — `Shopify-Storefront-Private-Token` header, server-side only, must be treated as a secret. Should be accompanied by `Shopify-Storefront-Buyer-IP` when the request originates from buyer traffic; without it Shopify "can't differentiate requests from different buyers, which can result in throttled API requests, limited bot protection, and unauthenticated flows at checkout". — all from <https://shopify.dev/docs/api/storefront>
- **[FACT]** Token-based auth is **required** for: product tags, metaobjects and metafields, Online Store navigation menus, and customers. Tokenless cannot reach these. — same source
- **[FACT]** Rate limits: "requests from real buyers aren't subject to a fixed request-per-minute limit." Bots and crawlers are limited (most strictly when unsigned; sign with Web Bot Auth for higher limits). Checkout creation is throttled per minute, returning `200 Throttled`. Suspected-malicious requests get `430 Shopify Security Rejection`. — same source
- **[FACT]** Error codes come back as HTTP 200 with an `errors` array: `THROTTLED`, `ACCESS_DENIED`, `SHOP_INACTIVE`, `INTERNAL_SERVER_ERROR`. — same source
- **[INFERENCE]** Our agent backend calling the Storefront API server-side is "automated traffic" from Shopify's perspective unless we forward `Shopify-Storefront-Buyer-IP`. If we query the catalogue from our server on behalf of a live shopper, we should use a private token *and* forward the buyer IP, or we risk the bot limits and `430`s.

### 3d. Predictive Search (Ajax) — a third, in-page option

- **[FACT]** `GET /{locale}/search/suggest.json?q={query}` returns up to **10** results per resource type across `product`, `collection`, `page`, `article`, `query`. Products always search title, body, product_type, tag, vendor, variant title/sku/barcode, and product category. — <https://shopify.dev/docs/api/ajax/reference/predictive-search>
- **[FACT]** It has **typo tolerance** (edit distance 1, or 2 transposed letters, with the first 4 letters correct) and **partial word matches** (last term only, suffix only). It uses a different search engine than storefront search. — same source
- **[FACT]** Throttled with `429` + `Retry-After` in seconds. Only works for a list of ~45 supported buyer locales; otherwise `417 Expectation Failed`. Supported-ness is readable client-side from the `<script id="shopify-features">` tag's `predictiveSearch` boolean. — same source
- **[INFERENCE]** This is fuzzy-ish but not semantic. It's lexical with typo tolerance. Useful as a cheap, zero-auth, in-browser lookup; not a substitute for UCP `search_catalog` on natural-language queries.

**Conclusion for Q3:** Storefront MCP no longer exists. The choice is **UCP Storefront Catalog MCP** (purpose-built for storefront AI agents, free-text query + intent, requires a hosted agent profile) vs **Storefront GraphQL API** (stable, well-understood, structured filters, tokenless mode available but with a 1,000 complexity cap). Predictive Search is a third lightweight client-side option. Semantic search is plausible on UCP but unconfirmed.

---

## 4. Cart — which API shares the shopper's browser cart

This is the question where the answer most directly constrains the architecture.

### Ajax Cart API — shares the browser cart

- **[FACT]** "The Cart API is used to interact with a cart during a customer's session." Endpoints are same-origin storefront routes: `POST /{locale}/cart/add.js`, `GET /{locale}/cart.js`, `POST /{locale}/cart/update.js`, `POST /{locale}/cart/change.js`, `POST /{locale}/cart/clear.js`. — <https://shopify.dev/docs/api/ajax/reference/cart>
- **[FACT]** `add.js` merges: "If an item is already in the cart, then `quantity` is equal to the new quantity for that cart line item." Items split into separate lines only when price, properties, or selling plan differ. — same source
- **[FACT]** Responses include the cart `token`. All monetary values are in the customer's presentment currency. — same source
- **[FACT]** Requests should use locale-aware URLs built from the global `window.Shopify.routes.root`. — same source
- **[FACT]** **Bundled section rendering**: `add`, `change`, `clear`, and `update` accept a `sections` parameter (up to 5 section IDs, optionally with `sections_url`) and return the re-rendered HTML for those sections under a `sections` key. Sections that fail render as `null`. — same source
- **[INFERENCE]** Because these are same-origin requests from the storefront page, they carry the shopper's existing cart cookie. This is the API that writes to *the* cart the shopper already has. Shopify does not spell out the cookie mechanism in this page, hence inference — but the framing ("during a customer's session"), the relative URLs, and the merge-on-add semantics leave little doubt.

### Storefront API cart — a separate cart by default

- **[FACT]** The Storefront API cart is addressed by a cart ID returned from `cartCreate`; tokenless access includes "Cart (read/write)". — <https://shopify.dev/docs/api/storefront>
- **[FACT]** Shopify flags the two as behaviourally different: UCP `update_cart` "uses PUT semantics... This differs from Storefront API and AJAX cart mutations, which patch individual fields." — <https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp>
- **[INFERENCE]** Nothing in the primary docs says a Storefront API cart created out-of-band becomes the shopper's browser cart. Shopify's own theme-facing guidance is uniformly the Ajax Cart API. Treat Storefront API cart mutations as creating a *second*, unattached cart unless we explicitly adopt its ID into the session.
- **[UNANSWERED]** Whether there is a documented, supported way to bind a Storefront API cart ID to the browser session so it becomes the active storefront cart. I found no primary source describing one.

### UCP Cart MCP — definitively a separate cart

- **[FACT]** `create_cart` returns a merchant-assigned `id` plus a `continue_url` "that the buyer can use to pick up the cart on the merchant's storefront". `update_cart` has PUT semantics — omit a field and it's removed; "There is no server-side merge of partial updates." Carts expire (`expires_at`). — <https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp>
- **[INFERENCE]** This is an agent-side cart handed to the buyer via a link, i.e. the opposite of what Wayfinder needs. It is designed for off-storefront agents (ChatGPT-style), not for a widget living inside the shopper's own storefront session. **Do not use Cart MCP for Wayfinder's cart writes.**

### The preferred option: `Shopify.actions.updateCart`

- **[FACT]** `Shopify.actions.updateCart({ lines: [{ merchandiseId: 'gid://shopify/ProductVariant/123', quantity: 1 }] })` resolves with `{ cart, userErrors, warnings }`. The storefront decides how the change is applied and how its UI refreshes. — <https://shopify.dev/docs/api/storefront-events-and-actions/actions/call>
- **[FACT]** A `userError` means the change did **not** apply; a `warning` means it applied with an adjustment (e.g. capped at available stock). The promise rejects only when the action couldn't run at all. Codes come from `CartErrorCode` / `CartWarningCode`. — same source
- **[FACT]** You can label the cart events your call emits: `{ event: { context: 'product' | 'cart' | 'dialog' | 'standard-action', detail: {...} } }`, so theme listeners can distinguish your change from a buyer's. Default context is `standard-action`. — same source
- **[FACT]** Calls accept an `AbortSignal`. — same source
- **[FACT]** On a storefront that hasn't configured the action, the default falls back to a **full page reload** if it can't recognise how the theme renders the cart. — same source

**Conclusion for Q4:** The shopper's existing browser cart is the **Ajax Cart API** cart. Write to it either directly (`/cart/add.js`, which merges quantities) or — preferably — through `Shopify.actions.updateCart`, which writes the same cart and additionally lets the theme refresh its own UI. Storefront API cart mutations and UCP Cart MCP both produce separate carts and must not be used for in-session writes.

### Cart gotchas worth recording

- **[FACT]** `update.js` "doesn't validate the quantity on variants that are already in the cart. This means that it's possible to add more inventory than is available." — <https://shopify.dev/docs/api/ajax/reference/cart>
- **[FACT]** Line item `key`s are not stable: "The line item key is not persistent for the lifetime of a line item, it changes as characteristics of the line item change." Shopify still recommends keys over variant IDs for targeting a specific line, because one variant can occupy multiple lines. — same source
- **[FACT]** `change.js` will not add an item that isn't already in the cart; it returns `400`. Use `add.js` to add, `change.js` to modify. — same source
- **[FACT]** Line item properties prefixed `_` are private (hidden at checkout, but still in Liquid and the Ajax API — the theme must filter them). Cart attributes prefixed `__` are private and are **not** exposed in Liquid `cart.attributes` or the Ajax API at all. — same source
- **[INFERENCE]** A `__`-prefixed private cart attribute is a plausible place to stamp "added by Wayfinder" attribution without it leaking to the storefront or checkout UI. Unverified that it survives to the order record in a useful form — the docs say private properties/attributes are "visible on the **Order details** page in the Shopify admin", which suggests it does.
- **[FACT]** **Remote products** (products from other stores on a merchant's storefront) appear in Ajax Cart responses with `remote: true`, and should be excluded from discount/free-shipping calculations and abandoned-cart recovery. They are **not** currently identifiable in Storefront API cart responses. — <https://shopify.dev/docs/apps/build/online-store>

---

## 5. Page metadata available client-side

### Documented and reliable

- **[FACT]** `window.Shopify.routes.root` is a documented global, used as the base for building locale-aware URLs. Cited in both the Cart API and Section Rendering API docs. — <https://shopify.dev/docs/api/ajax/reference/cart>, <https://shopify.dev/docs/api/ajax/section-rendering>
- **[FACT]** `window.Shopify.actions` (`getCart`, `updateCart`, `openCart`) exists on **every Liquid storefront**, with nothing to install. Available after `DOMContentLoaded`. — <https://shopify.dev/docs/api/storefront-events-and-actions/actions/call>
- **[FACT]** `shopify:page:view` fires once per page load "on every page of the storefront" and carries `page.template` (the Liquid template that rendered the page, e.g. `product`, `collection`), `page.title`, and `page.url`. It fires once the document is ready, so a listener must be registered **synchronously at script load** or it is missed. — <https://shopify.dev/docs/api/storefront-events-and-actions/events/page-view>
- **[FACT]** `shopify:product:view` carries `product` (GID `id`, `title`, `handle`, `selectedVariant` or `null`), `selectedOptions`, and `context` (`page` | `search` | `collection` | `recommendation` | `dialog`). `selectedVariant` is `null` for e.g. a card in a grid. — <https://shopify.dev/docs/api/storefront-events-and-actions/events/product-view>
- **[FACT]** Caveat, repeated here because it governs reliability: these view events are dispatched by the *theme*. "Don't assume an event you depend on fires on a given store." Only the cart events are guaranteed, and only because `updateCart` emits them itself. — <https://shopify.dev/docs/api/storefront-events-and-actions/events/listen>
- **[FACT]** Section IDs are discoverable from the DOM: sections are wrapped as `<div id="shopify-section-[section-id]" class="shopify-section">`, with dynamic IDs like `sections--1234__header` or `template--5678__image_banner` for sections in section groups and JSON templates. — <https://shopify.dev/docs/api/ajax/section-rendering>
- **[FACT]** Section Rendering API: append `?sections=a,b,c` (max 5) to any page URL for a JSON map of rendered HTML, or `?section_id=x` for raw HTML. The section inherits the Liquid context of the requested page — so `/products/{handle}?sections=...` renders with that product's data. Failed sections come back as `null` with an HTTP 200. — same source
- **[FACT]** `<script id="shopify-features">` in `<head>` carries a JSON-encoded `predictiveSearch` boolean. — <https://shopify.dev/docs/api/ajax/reference/predictive-search>
- **[FACT]** Shopify's recommended theme convention is `<body class="template-{{ template.name }}">`, which is how template-specific CSS selectors are built. — <https://shopify.dev/docs/storefronts/themes/architecture/layouts>
- **[INFERENCE]** `document.body.className` is therefore a decent, convention-backed (but not guaranteed) fallback for page type when `shopify:page:view` isn't dispatched.

### Not documented / do not rely on

- **[FACT]** `content_for_header` is the Liquid object that "dynamically loads all scripts required by Shopify into the document head", and Shopify says explicitly: "You **shouldn't try to modify or parse** the `content_for_header` object because the contents are subject to change, which can change the behaviour of your code." — <https://shopify.dev/docs/api/liquid/objects/content_for_header>
- **[FACT]** Theme app extensions are denied access to `content_for_header` from Liquid entirely. — <https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#restrictions>
- **[UNANSWERED] / [INFERENCE]** The `window.meta` and `window.ShopifyAnalytics.meta` objects (carrying `page.pageType`, `product.id`, `product.variants`, etc.) are emitted by `content_for_header`. I could **not** find any Shopify primary source that documents them. Combined with the explicit "don't parse `content_for_header`" warning, I'd treat them as **undocumented implementation detail**: usable as an opportunistic fallback, never as a contract.
- **[UNANSWERED]** Which `<script type="application/json">` product/variant payloads a Dawn-derived theme renders, and under what IDs. I was unable to read the `Shopify/dawn` repository — the code-search tooling returned an unavailable index and then empty results on retry. This is a genuine gap: Q5's "what is reliably present on a standard Dawn-derived theme vs theme-dependent" is only half-answered. Recommend a follow-up pass directly against <https://github.com/Shopify/dawn> (specifically `layout/theme.liquid`, `sections/main-product.liquid`, `snippets/product-variant-picker.liquid`) or, better, against the actual target store's rendered HTML.

### The robust read strategy

- **[INFERENCE]** Rather than scraping `meta`, the sanctioned way to get authoritative page content is: take the handle/template from `shopify:page:view` / the URL, then fetch the real data from UCP `get_product` / `lookup_catalog` or the Storefront API. The DOM gives us *what the shopper is looking at*; the API gives us *what it is*. Using the DOM only for locator/affordance discovery and the API for facts avoids the whole class of theme-dependency problems.

---

## 6. Navigation

- **[FACT]** "Storefronts on the Online Store are **multi-page**, so every navigation is a fresh document with fresh listeners, and this event marks the start of each one." — <https://shopify.dev/docs/api/storefront-events-and-actions/events/page-view>
- **[FACT]** There is no built-in client-side router. The in-page update mechanisms Shopify provides are the **Section Rendering API** (fetch and swap section HTML without a full reload) and **bundled section rendering** on cart calls. — <https://shopify.dev/docs/api/ajax/section-rendering>, <https://shopify.dev/docs/api/ajax/reference/cart>
- **[FACT]** Shopify "automatically injects speculation rules in supporting browsers" to prefetch/prerender. Themes can add their own. — <https://shopify.dev/docs/storefronts/themes/best-practices/performance/platform>
- **[FACT]** Shopify also streams HTML responses in two parts (everything up to `{{ content_for_header }}`, then the rest) for pages rendered from JSON templates. Preview themes and the theme editor are not streamed. — same source
- **[FACT]** Sections can re-render in place, and Shopify warns listeners about it: "Storefronts re-render sections in place, so you can't count on a page navigation to clean up for you." The recommended cleanup pattern is one `AbortController` whose signal is passed to every `addEventListener`. — <https://shopify.dev/docs/api/storefront-events-and-actions/events/listen>
- **[INFERENCE]** Implications for a per-page-reconnecting widget:
  1. Full document reload on every navigation is the baseline. The widget's JS re-executes from scratch each time, so session continuity must live in `sessionStorage` / cookies / server state, not in memory.
  2. **Speculation-rule prerendering means the widget's script may execute in a prerendered document the shopper never visits.** This is a real hazard for a voice widget — microphone acquisition, session creation, or analytics firing in a prerender would be wrong. Guard with `document.prerendering` / the `prerenderingchange` event. Shopify does not call this out; this is inference.
  3. Section-level re-renders can destroy DOM the widget was holding references to, without any navigation event. Re-query lazily, and prefer `shopify:` events over cached element handles.
  4. Register `shopify:page:view` listeners synchronously at script load, before any `await`.
- **[UNANSWERED]** Whether Shopify's newer first-party theme (Horizon) or any Dawn version implements soft/SPA navigation or View Transitions. I did not find a primary source either way, and could not read the Dawn repo. The `shopify:page:view` documentation's blanket statement that Online Store storefronts are multi-page is the strongest available evidence that soft navigation is not a thing to plan around, but it does not rule out a theme doing it.

---

## Findings that bear on the planned architecture

The planned architecture — an app-embed theme app extension rendering a voice widget on every storefront page except checkout, with full DOM access to read the page and drive the UI, querying the catalogue, and writing to the shopper's existing browser cart — is **sound**. Nothing found invalidates it. Four findings change the detail:

1. **Storefront MCP is removed.** Any plan referencing `/api/mcp` catalog or cart tools must be rewritten against UCP at `/api/ucp/mcp`, which requires hosting an agent profile at a well-known URL. — <https://shopify.dev/docs/apps/build/storefront-mcp>
2. **UCP Cart MCP is the wrong cart.** It creates a detached, expiring, agent-owned cart surfaced via `continue_url`, with destructive PUT semantics. Cart writes must go through the Ajax Cart API or `Shopify.actions.updateCart`. — <https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp>
3. **Standard storefront events and actions supersede DOM driving for the cart**, and are explicitly aimed at AI agents. DOM access remains available and unsandboxed, but should be the fallback, not the primary mechanism. Note that `updateCart`'s default behaviour on an unconfigured theme can trigger a full page reload — check `isDefault()`. — <https://shopify.dev/docs/api/storefront-events-and-actions/actions/call>
4. **Theme-dispatched events are not guaranteed.** Only cart events are reliable across stores. Page/product/collection/search view events depend on the theme dispatching them, so page-context extraction needs a documented fallback path. — <https://shopify.dev/docs/api/storefront-events-and-actions/events/listen>

Smaller constraints worth carrying forward: the 10 KB suggested JS budget for schema-referenced assets; app embeds are off by default and need a deep link to activate; speculation-rule prerendering can execute the widget in a document the shopper never sees.

## Open items

- Is UCP `search_catalog` semantic or lexical? (Q3)
- Is UCP Storefront Catalog MCP production-stable for a single store, and what are its concrete per-tier rate limits? (Q3 — see <https://shopify.dev/docs/agents/profiles/auth-and-rate-limiting>, not yet read)
- Is there any supported way to adopt a Storefront API cart ID as the browser session cart? (Q4)
- Dawn's actual client-side data surface: which JSON script tags, which IDs, and what `window.meta` / `ShopifyAnalytics` contain in practice. Blocked on repo access; resolve against <https://github.com/Shopify/dawn> or the live target store. (Q5)
- Does any current Shopify theme implement soft navigation or View Transitions? (Q6)
