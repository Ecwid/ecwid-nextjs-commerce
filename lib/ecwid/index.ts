import { isEcwidError } from 'lib/type-guards';

import {
    Cart,
    CartItem,
    Collection,
    EcwidAdjustedPrice,
    EcwidCart,
    EcwidCartItem,
    EcwidCheckout,
    EcwidCurrencyNode,
    EcwidMedia,
    EcwidNode,
    EcwidOrder,
    EcwidPagedResult,
    EcwidPrice,
    EcwidProductOption,
    EcwidRelatedProducts,
    EcwidVariation,
    Image,
    Menu,
    Money,
    Product,
    ProductOption,
    ProductVariant
} from './types';

import {
    DEFAULT_CURRENCY_CODE,
    DEFAULT_OPTION,
    ECWID_API_URL,
    ECWID_STOREFRONT_API_URL,
    TAGS,
    defaultImage
} from 'lib/constants';

import { cartesianProduct } from 'lib/utils';
import { revalidateTag } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const store_id = process.env.ECWID_STORE_ID!;

const api_endpoint = `${ECWID_API_URL}${store_id}`;
const storefront_api_endpoint = `${ECWID_STOREFRONT_API_URL}${store_id}`;

var currencyCode: string = DEFAULT_CURRENCY_CODE;
getStoreCurrencyCode().then((res) => {
    currencyCode = res;
});

export async function ecwidFetch<T>({
    method,
    path,
    useStorefrontAPI,
    query,
    headers,
    cache,
    tags,
    payload,
    revalidate
}: {
    method: string;
    path: string;
    useStorefrontAPI?: boolean;
    query?: Record<string, string | string[]>;
    headers?: HeadersInit;
    cache?: RequestCache;
    tags?: string[];
    payload?: any | undefined;
    revalidate?: number;
}): Promise<{ status: number; body: T } | never> {
    try {
        var options: RequestInit = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + process.env.ECWID_API_KEY!,
                ...headers
            },
            cache: cache,
            ...(tags && { next: { tags: tags } })
        };

        if (revalidate) {
            options.next = { ...options.next, ...{ revalidate: revalidate } };
            console.log(options.next);
        }

        if (payload) {
            options.body = JSON.stringify(payload);
        }

        let url;

        if (useStorefrontAPI) {
            url = storefront_api_endpoint + path;
        } else {
            url = api_endpoint + path;
        }

        if (query) {
            const searchParams = new URLSearchParams();

            Object.entries(query).forEach(([key, values]) => {
                if (Array.isArray(values)) {
                    values.forEach((value) => {
                        searchParams.append(key, value);
                    });
                } else {
                    searchParams.append(key, values);
                }
            });

            url += url.indexOf('?') >= 0 ? '&' : '?';
            url += searchParams.toString();
        }

        const result = await fetch(url, options);

        let body;

        try {
            body = await result.json();
        } catch (e) {
            body = false;
        }

        if (body.errors) {
            console.log(body.errors);
            throw body.errors[0];
        }

        return {
            status: result.status,
            body
        };
    } catch (e) {
        if (isEcwidError(e)) {
            throw {
                status: e.status || 500,
                message: e.message
            };
        }

        throw {
            error: e
        };
    }
}

export async function getStoreCurrencyCode(): Promise<string> {
    let query = <Record<string, string | string[]>>{
        responseFields: 'formatsAndUnits(currency)'
    };

    const res = await ecwidFetch<EcwidCurrencyNode>({
        method: 'GET',
        path: `/profile`,
        query: query,
        tags: [TAGS.profile]
        // cache: 'no-store',
        // revalidate: 20
    });

    if (!res.body) {
        return DEFAULT_CURRENCY_CODE;
    }

    return res.body.formatsAndUnits.currency;
}

const reshapeImage = (img: EcwidMedia): Image => {
    return {
        url: img.url,
        altText: img.name || '',
        width: img.width,
        height: img.height
    };
};

const reshapeAdjustedPrice = (price: EcwidAdjustedPrice): Money => reshapePrice(price.value);

const reshapePrice = (price: EcwidPrice): Money => {
    return {
        amount: price.withTax.toString(),
        currencyCode: price.currency.code
    };
};

const reshapeAmountsPrice = (price: number): Money => {
    return {
        amount: price.toString(),
        currencyCode: currencyCode
    };
};

const reshapeOrder = (order: EcwidOrder): Cart => {
    var quantity = order?.cartItems?.reduce((n, { quantity }) => n + quantity, 0) || 0;

    var lines: CartItem[] = [];
    if (quantity > 0) {
        lines = order?.cartItems?.map((item) => reshapeOrderLine(item)) || [];
    }

    return {
        id: order.id,
        checkoutUrl: `/checkout?id=${order.id}`,
        totalQuantity: quantity,
        cost: {
            subtotalAmount: reshapeAmountsPrice(order.amounts.subtotal),
            totalAmount: reshapeAmountsPrice(order.amounts.total),
            totalTaxAmount: reshapeAmountsPrice(order.amounts.tax)
        },
        lines: lines
    };
};

const reshapeOrderLine = (orderLine: EcwidCartItem): CartItem => {
    var imgUrl = orderLine.productInfo?.mediaItem
        ? orderLine.productInfo?.mediaItem.image160pxUrl
        : '';

    var productId = orderLine.identifier.productId.toString();

    var selectedOptions = orderLine.identifier?.selectedOptions
        ? Object.entries(orderLine.identifier?.selectedOptions).map((opt: any) => ({
            name: opt[0],
            value: opt[1].choice
        }))
        : [];

    if (selectedOptions.length > 0) {
        productId += '|' + selectedOptions.map(({ name, value }) => `${name}:${value}`).join('|');
    }

    var subTitle =
        selectedOptions.length > 0
            ? selectedOptions?.map(({ name, value }) => `${name}:${value}`).join(', ')
            : DEFAULT_OPTION;

    return {
        id: productId, // [Required]
        merchandise: {
            id: productId, // [Required]
            title: subTitle,
            selectedOptions: selectedOptions,
            product: {
                id: productId,
                // handle: productId, // [Required]
                handle: `${orderLine.productInfo.slugs.forRouteWithId}-p${productId}`, // [Required]
                availableForSale: true,
                title: orderLine.productInfo.name, // [Required]
                description: '',
                descriptionHtml: '',
                options: [],
                priceRange: {
                    maxVariantPrice: {
                        amount: orderLine.price.toString(),
                        currencyCode: currencyCode
                    },
                    minVariantPrice: {
                        amount: orderLine.price.toString(),
                        currencyCode: currencyCode
                    }
                },
                featuredImage: {
                    // [Required]
                    url: imgUrl,
                    altText: orderLine.productInfo.name,
                    width: 0,
                    height: 0
                },
                seo: {
                    title: '',
                    description: ''
                },
                tags: [TAGS.cart],
                updatedAt: new Date().toISOString(),
                variants: [],
                images: []
            }
        },
        quantity: orderLine.quantity, // [Required]
        cost: {
            // [Required]
            totalAmount: reshapeAmountsPrice(orderLine.price)
        }
    };
};

const reshapeCollection = (node: EcwidNode): Collection | undefined => {
    if (!node) {
        return undefined;
    }

    let metaTitle = node.seoTitle?.toString() || node.name;
    let metaDescription = node.seoDescription?.toString() || node.description;

    return {
        handle: node.id.toString(),
        title: node.name,
        description: node.description?.toString(),
        seo: {
            title: metaTitle,
            description: metaDescription
        },
        path: `${node.url}`,
        updatedAt: ''
    };
};

const reshapeCollections = (nodes: EcwidNode[]): Collection[] => {
    return <Collection[]>(nodes || []).map((n) => reshapeCollection(n)).filter((n) => !!n);
};

const reshapeProduct = (
    node: EcwidNode,
    filterHiddenProducts: boolean = true
): Product | undefined => {
    if (!node || (filterHiddenProducts && !node.enabled)) {
        return undefined;
    }

    let nodeHandle = encodeURIComponent(node.url.replace(/^\/+|\/+$/g, ''));

    let minPrice = 0;
    let maxPrice = 0;

    let metaTitle = node.seoTitle?.toString() || node.name;
    let metaDescription = node.seoDescription?.toString() || node.description;

    let product = <Product>{
        id: `${node.id}`,
        handle: nodeHandle,
        title: node.name,
        description: node.description,
        descriptionHtml: node.description,
        availableForSale: node.inStock,
        seo: {
            title: metaTitle,
            description: metaDescription
        },
        options: <ProductOption[]>[],
        variants: <ProductVariant[]>[],
        tags: 'a' || [],
        updatedAt: node.updateDate || 0
    };

    var productPrice = node.price;
    if (productPrice) {
        minPrice = node.compareToPrice || node.price;
        maxPrice = node.price;

        product.variants = [
            {
                id: `${node.id}`,
                title: node.name,
                availableForSale: node.inStock,
                selectedOptions: [],
                price: productPrice
            }
        ];
    }

    let options = node.options as EcwidProductOption[];
    let variants = node.combinations as EcwidVariation[];

    let variantsCombinations = <ProductVariant[]>[];

    if (options.length > 0) {
        product.options = options.map((attr) => ({
            id: attr.name,
            name: attr.name,
            values: attr.choices.map((val) => val.text)
        }));

        // api doesn't return all options combinations, so we shuffle that handly
        let allOptions = options.map((attr) =>
            attr.choices.map((val) => ({ name: attr.name, value: val.text }))
        );
        let optionsCombinations = cartesianProduct(...allOptions);

        if (optionsCombinations.length > 0) {
            optionsCombinations.forEach((options) => {
                variantsCombinations.push(<ProductVariant>{
                    id: `${node.id}` + '|' + options.map(({ name, value }) => `${name}:${value}`).join('|'),
                    title:
                        node.name + '(' + options.map(({ name, value }) => `${name}:${value}`).join(', ') + ')',
                    availableForSale: node.inStock,
                    selectedOptions: options,
                    price: productPrice // to-do: If the variation exists, need to find out its price
                });
            });
        }
    }

    if (variants.length > 0 && variantsCombinations.length > 0) {
        variants.forEach((variant) => {
            let keys: string[] = variant.options.map(({ name, value }) => `${name}:${value}`); //.join('|');

            variantsCombinations.map((combination) => {
                if (!keys.find((x) => combination.id.indexOf(x) == -1)) {
                    combination.availableForSale = variant.inStock;
                    combination.price = variant.price ? variant.price : productPrice;

                    if (combination.availableForSale) {
                        if (variant.price > maxPrice) maxPrice = variant.price;
                        if (variant.price < minPrice) minPrice = variant.price;
                    }
                }
            });
        });
    }

    if (variantsCombinations.length > 0) {
        product.variants = variantsCombinations;
    }

    product.images = [] as EcwidMedia[];

    let media = node.galleryImages as EcwidMedia[];
    if (media.length > 0) {
        var images = media.map((m) => reshapeImage(m));
        product.images = images;
    }

    product.featuredImage = node.originalImage as EcwidMedia;

    if (product.featuredImage) product.images.unshift(product.featuredImage);

    if (!product.featuredImage) {
        product.featuredImage = defaultImage;
    }

    product.priceRange = {
        minVariantPrice: { amount: minPrice.toString(), currencyCode: currencyCode },
        maxVariantPrice: { amount: maxPrice.toString(), currencyCode: currencyCode }
    };

    return product;
};

const reshapeProducts = (nodes: EcwidNode[]): Product[] => {
    return <Product[]>(nodes || []).map((n) => reshapeProduct(n)).filter((n) => !!n);
};

export async function createCart(): Promise<Cart> {
    const res = await ecwidFetch<EcwidCart>({
        method: 'POST',
        path: `/checkout/create`,
        useStorefrontAPI: true,
        cache: 'no-store',
        tags: [TAGS.cart],
        payload: {
            lang: 'en'
        }
    });

    let cartId = res.body.checkoutId;

    cookies().set(`ec-${store_id}-session`, res.body.sessionToken);

    return {
        id: cartId,
        sessionToken: res.body.sessionToken,
        checkoutUrl: '',
        cost: {
            subtotalAmount: {
                amount: '',
                currencyCode: ''
            },
            totalAmount: {
                amount: '',
                currencyCode: ''
            },
            totalTaxAmount: {
                amount: '',
                currencyCode: ''
            }
        },
        lines: [],
        totalQuantity: 0
    };
}

export async function addToCart(
    cartId: string,
    lines: { merchandiseId: string; quantity: number }[]
): Promise<Cart | undefined> {
    // We assume there is only one item to be added at a time
    // which looking at the code is the case. May need to keep
    // track to see if it ever gets implemented that multiple
    // items can be added at once.
    var line = lines[0];
    var idParts = line!.merchandiseId.split('|');

    let productId = idParts[0];
    let sessionToken = cookies().get(`ec-${store_id}-session`)?.value;

    let selectedOptions = {} as any;

    if (idParts.length > 1) {
        idParts.shift();

        idParts.map((part) => {
            let option = part.split(':');
            selectedOptions[`${option[0]}`] = { type: 'DROPDOWN', choice: `${option[1]}` };
        });
    }

    const res = await ecwidFetch<EcwidCheckout>({
        method: 'POST',
        path: `/checkout/add-cart-item`,
        useStorefrontAPI: true,
        cache: 'no-store',
        tags: [TAGS.cart],
        payload: {
            lang: 'en',
            newCartItem: {
                identifier: {
                    productId: productId,
                    selectedOptions: selectedOptions
                },
                quantity: 1,
                categoryId: 0,
                isPreorder: false
            }
        },
        headers: {
            Authorization: 'Bearer ' + sessionToken
        }
    });

    return reshapeOrder(res.body.checkout);
}

export async function removeFromCart(cartId: string, lineIds: string[]): Promise<Cart> {
    // We assume there is only one item to be removed at a time
    // which looking at the code is the case. May need to keep
    // track to see if it ever gets implemented that multiple
    // items can be removed at once.
    let line = lineIds[0];
    let idParts = line!.split('|');
    let productId = idParts[0];

    let sessionToken = cookies().get(`ec-${store_id}-session`)?.value;

    let selectedOptions = {} as any | undefined;

    if (idParts.length > 1) {
        idParts.shift();

        idParts.map((part) => {
            let option = part.split(':');
            selectedOptions[`${option[0]}`] = { type: 'DROPDOWN', choice: `${option[1]}` };
        });
    } else {
        selectedOptions = {};
    }

    const res = await ecwidFetch<EcwidCheckout>({
        method: 'POST',
        path: `/checkout/remove-cart-items`,
        useStorefrontAPI: true,
        cache: 'no-store',
        tags: [TAGS.cart],
        payload: {
            lang: 'en',
            cartItemIdentifiers: [
                {
                    productId: productId,
                    selectedOptions: selectedOptions
                }
            ]
        },
        headers: {
            Authorization: 'Bearer ' + sessionToken
        }
    });

    return reshapeOrder(res.body.checkout);
}

export async function updateCart(
    cartId: string,
    lines: { id: string; merchandiseId: string; quantity: number }[]
): Promise<Cart> {
    let sessionToken = cookies().get(`ec-${store_id}-session`)?.value;

    var line = lines[0];
    var idParts = line!.merchandiseId.split('|');
    let productId = idParts[0];

    await removeFromCart(cartId, [line!.merchandiseId]);

    let selectedOptions = {} as any;

    if (idParts.length > 1) {
        idParts.shift();

        idParts.map((part) => {
            let option = part.split(':');
            selectedOptions[`${option[0]}`] = { type: 'DROPDOWN', choice: `${option[1]}` };
        });
    }

    const res = await ecwidFetch<EcwidCheckout>({
        method: 'POST',
        path: `/checkout/add-cart-item`,
        useStorefrontAPI: true,
        cache: 'no-store',
        tags: [TAGS.cart],
        payload: {
            lang: 'en',
            newCartItem: {
                identifier: {
                    productId: productId,
                    selectedOptions: selectedOptions
                },
                quantity: line?.quantity,
                categoryId: 0,
                isPreorder: false
            }
        },
        headers: {
            Authorization: 'Bearer ' + sessionToken
        }
    });

    return reshapeOrder(res.body.checkout);
}

export async function getCart(cartId: string): Promise<Cart | undefined> {
    let sessionToken = cookies().get(`ec-${store_id}-session`)?.value;

    if (!sessionToken) {
        return undefined;
    }

    const res = await ecwidFetch<EcwidCheckout>({
        method: 'POST',
        path: `/checkout`,
        useStorefrontAPI: true,
        cache: 'no-store',
        tags: [TAGS.cart],
        payload: {
            lang: 'en'
        },
        headers: {
            Authorization: 'Bearer ' + sessionToken
        }
    });

    if (!res.body) {
        return undefined;
    }

    return reshapeOrder(res.body.checkout);
}

export async function getMenu(handle: string): Promise<Menu[]> {
    if (handle == 'next-js-frontend-footer-menu') {
        return [];
    }

    let query = <Record<string, string | string[]>>{
        parent: '0',
        limit: '2',
        cleanUrls: 'true',
        baseUrl: '/search'
    };

    const res = await ecwidFetch<EcwidPagedResult<EcwidNode>>({
        method: 'GET',
        path: `/categories`,
        tags: [TAGS.collections],
        query: query
    });

    let menu =
        res.body?.items?.map((collection) => ({
            path: `${collection.url}`,
            title: collection.name
        })) || [];

    return [
        {
            title: 'All',
            path: '/search'
        },
        ...menu
    ];
}

export async function getCollections(): Promise<Collection[]> {
    let baseUrl = '/search';

    const res = await ecwidFetch<EcwidPagedResult<EcwidNode>>({
        method: 'GET',
        path: `/categories`,
        tags: [TAGS.collections],
        query: {
            cleanUrls: 'true',
            baseUrl: baseUrl
        }
    });

    const collections = [
        {
            handle: '',
            title: 'All',
            description: 'All products',
            seo: {
                title: 'All',
                description: 'All products'
            },
            path: baseUrl,
            updatedAt: new Date().toISOString()
        },
        ...reshapeCollections(res.body?.items)
    ];

    return <Collection[]>collections;
}

export async function getCollection(handle: string): Promise<Collection | undefined> {
    let categoryId = handle.replace(/^.*?\-c/g, '');

    const res = await ecwidFetch<EcwidNode>({
        method: 'GET',
        path: `/categories/${categoryId}`,
        tags: [TAGS.collections]
    });

    return reshapeCollection(res.body);
}

export async function getCollectionProducts({
    collection,
    reverse,
    sortKey
}: {
    collection: string;
    reverse?: boolean;
    sortKey?: string;
}): Promise<Product[]> {
    let query = <Record<string, string | string[]>>{
        enabled: 'true',
        cleanUrls: 'true',
        baseUrl: '/'
    };

    let categoryId = collection.replace(/^.*?\-c/g, '');

    if (collection != 'hidden-homepage-carousel' && collection != 'hidden-homepage-featured-items') {
        query.categories = `${categoryId}`;
    }

    const res = await ecwidFetch<EcwidPagedResult<EcwidNode>>({
        method: 'GET',
        path: `/products`,
        query: query,
        tags: [TAGS.products]
    });

    if (res.body?.items) {
        return reshapeProducts(res.body?.items);
    }

    console.log(`No collection found for \`${categoryId}\``);
    return [];
}

export async function getProducts({
    query,
    reverse,
    sortKey
}: {
    query?: string;
    reverse?: boolean;
    sortKey?: string;
}): Promise<Product[]> {
    var queryParams = <Record<string, string | string[]>>{};

    queryParams.cleanUrls = 'true';
    queryParams.baseUrl = '/';

    if (query) {
        queryParams.keyword = `${query}`;
    }

    if (sortKey && sortKey != 'relevance') {
        queryParams.sortBy = `${sortKey}_${reverse ? 'desc' : 'asc'}`.toUpperCase();
    }

    const res = await ecwidFetch<EcwidPagedResult<EcwidNode>>({
        method: 'GET',
        path: `/products`,
        query: queryParams,
        tags: [TAGS.products]
    });

    return reshapeProducts(res.body?.items);
}

export async function getProduct(handle: string): Promise<Product | undefined> {
    let productId = handle.replace(/^.*?\-p/g, '');

    const res = await ecwidFetch<EcwidNode>({
        method: 'GET',
        path: `/products/${productId}`,
        tags: [TAGS.products]
    });

    return reshapeProduct(res.body);
}

export async function getProductRecommendations(productId: string): Promise<Product[]> {
    // Get the product
    const res = await ecwidFetch<EcwidNode>({
        method: 'GET',
        path: `/products/${productId}`,
        tags: [TAGS.products]
    });

    let queryParams = <Record<string, string | string[]>>{};

    const relates = <EcwidRelatedProducts>(res.body.relatedProducts || {});

    if (relates.productIds?.length > 0) {
        queryParams.productId = `${relates.productIds.join(',')}`;
    }

    if (relates.relatedCategory.enabled) {
        let relatedCategory = `${relates.relatedCategory.categoryId}`;
        queryParams.categories = 0 ? 'home' : relatedCategory;

        queryParams.includeProductsFromSubcategories = 'true';
        queryParams.limit = `${relates.relatedCategory.productCount}`;
    }

    if (!Object.keys(queryParams).length) {
        return [];
    }

    queryParams.cleanUrls = 'true';
    queryParams.baseUrl = '/';

    const res2 = await ecwidFetch<EcwidPagedResult<EcwidNode>>({
        method: 'GET',
        path: `/products`,
        tags: [TAGS.products],
        query: queryParams
    });

    // Return products filtering out current product
    return reshapeProducts(res2.body?.items.filter((x) => x.id != productId));
}

// This is called from `app/api/revalidate.ts` so providers can control revalidation logic.
export async function revalidate(req: NextRequest): Promise<NextResponse> {
    // We always need to respond with a 200 status code to Ecwid,
    // otherwise it will continue to retry the request.
    const collectionWebhooks = ['category.created', 'category.deleted', 'category.updated'];
    const productWebhooks = ['product.created', 'product.deleted', 'product.updated'];
    const profileWebhooks = ['profile.updated'];
    const { eventType } = await req.json();
    const secret = headers().get('X-Ecwid-Revalidation-Secret') || 'unknown';

    const isCollectionUpdate = collectionWebhooks.includes(eventType);
    const isProductUpdate = productWebhooks.includes(eventType);
    const isProfileUpdate = profileWebhooks.includes(eventType);

    if (!secret || secret !== process.env.ECWID_REVALIDATION_SECRET) {
        console.error('Invalid revalidation secret.');
        return NextResponse.json({ status: 200 });
    }

    if (!isCollectionUpdate && !isProductUpdate && !isProfileUpdate) {
        // We don't need to revalidate anything for any other topics.
        return NextResponse.json({ status: 200 });
    }

    if (isProductUpdate) {
        revalidateTag(TAGS.products);
    }

    if (isCollectionUpdate) {
        revalidateTag(TAGS.collections);
    }

    if (isProfileUpdate) {
        revalidateTag(TAGS.profile);
    }

    return NextResponse.json({ status: 200, revalidated: true, now: Date.now() });
}
