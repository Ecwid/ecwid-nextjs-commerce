export type SortFilterItem = {
  title: string;
  slug: string | null;
  sortKey: 'relevance' | 'added_time' | 'price';
  reverse: boolean;
};

export const defaultSort: SortFilterItem = {
  title: 'Relevance',
  slug: null,
  sortKey: 'relevance',
  reverse: false
};

export const sorting: SortFilterItem[] = [
  defaultSort,
  { title: 'Latest arrivals', slug: 'latest-desc', sortKey: 'added_time', reverse: true },
  { title: 'Price: Low to high', slug: 'price-asc', sortKey: 'price', reverse: false }, // asc
  { title: 'Price: High to low', slug: 'price-desc', sortKey: 'price', reverse: true }
];

// Can't remove TAGS as used internally
export const TAGS = {
  collections: 'collections',
  products: 'products',
  pages: 'pages',
  cart: 'cart',
  profile: 'profile'
};

export const defaultImage = {
  url: '/images/default-image.svg',
  width: 100,
  height: 100
};

export const DEFAULT_OPTION = 'Default';
export const HIDDEN_PRODUCT_TAG = 'hidden'; // Required

export const DEFAULT_CURRENCY_CODE = 'USD';

export const ECWID_API_URL = 'https://app.ecwid.com/api/v3/';
export const ECWID_STOREFRONT_API_URL = 'https://app.ecwid.com/storefront/api/v1/';
