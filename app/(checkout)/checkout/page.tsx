import type { Metadata } from 'next';

import Prose from 'components/prose';
import { cookies } from 'next/headers';
import Script from 'next/script';

export const runtime = 'edge';

export const revalidate = 43200; // 12 hours in seconds

export async function generateMetadata({
  params: _params
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  return {
    title: 'Checkout',
    description: ''
  };
}

export default async function Page({ params: _params }: { params: Promise<{ page: string }> }) {
  const store_id = process.env.ECWID_STORE_ID!;
  const body = '<div id="ecStoreProductBrowser">Loading checkout...</div>';

  const cookieStore = await cookies();
  const cartId = cookieStore.get('cartId')?.value;

  return (
    <>
      <h1 className="mb-8 text-5xl font-bold">Checkout</h1>
      <Prose className="mb-8" html={body as string} />
      <Script id="ecStoreProductBrowser-script">
        {`let checkout = {
                    id: '` +
          cartId +
          `',
                    itemsCount: 0
                }
                localStorage.setItem('ec-` +
          store_id +
          `-checkout', JSON.stringify(checkout));

                let ecwidLoaded = false;

                function load_ecwid() {
                    if (typeof Ecwid != 'undefined') {

                        Ecwid.OnAPILoaded.add(function () {
                            if (!ecwidLoaded) {
                                ecwidLoaded = true;
                                xProductBrowser("categoriesPerRow=3", "views=grid(3,3) list(10) table(20)", "categoryView=grid", "searchView=list", "id=ecStoreProductBrowser");
                            }
                        });

                        Ecwid.OnPageLoad.add(function(page) {
                            if (!page.hasPrevious) {
                                Ecwid.openPage("cart");
                            }
                        })
        
                        Ecwid.OnPageSwitch.add(function (page) {

                            let is_cart_page = page.type == 'CART';
                            let is_download_error_page = page.type == 'DOWNLOAD_ERROR';
                            let is_checkout_page = page.type.indexOf('CHECKOUT_') >= 0;
                            let is_order_page = page.type.indexOf('ORDER_') >= 0;

                            if (page.type == 'ORDER_CONFIRMATION' && page.orderId) {
                                document.cookie = 'cartId=';
                            }

                            if (page.type == 'CATEGORY') {
                                location.href = '/';
                                return true;
                            }

                            if (!is_cart_page && !is_download_error_page && !is_checkout_page && !is_order_page) {
                                Ecwid.openPage('cart');
                                return true;
                            }
                        });
                    }
                }
        
                window.ec = window.ec || {};
                window.ec.config = window.ec.config || {};
                window.ec.config.storefrontUrls = window.ec.config.storefrontUrls || {};
                window.ec.config.storefrontUrls.cleanUrls = true;
                window.ec.config.storefrontUrls.queryBasedCleanUrls = true;
                
                window.ec.storefront = window.ec.storefront || {};
                window.ec.storefront.show_breadcrumbs = false;
                window.ec.storefront.show_footer_menu = false;
        
                window.ecwid_script_defer = true;
                window.ecwid_dynamic_widgets = true;
        
                if (!document.getElementById('ecwid-script')) {
                    var script = document.createElement('script');
                    script.type = 'text/javascript';
                    script.src = 'https://app.ecwid.com/script.js?` +
          store_id +
          `&data_platform=nextjs_commerce&storefront-v3=true';
                    script.id = 'ecwid-script'
                    script.onload = load_ecwid
                    document.body.appendChild(script);
                } else {
                    load_ecwid()
                }`}
      </Script>
    </>
  );
}
