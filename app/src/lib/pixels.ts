/**
 * Tracking Pixel Integration Service
 * Meta Pixel, GA4, and TikTok Pixel
 */

import { logger } from './logger';

export type PixelPlatform = 'meta' | 'google' | 'tiktok';

export interface PixelConfig {
    id: string;
    workspaceId: string;
    platform: PixelPlatform;
    pixelId: string;
    isActive: boolean;
    events: PixelEvent[];
    createdAt: Date;
}

export interface PixelEvent {
    name: string;
    triggered: number;
    conversions: number;
    revenue: number;
}

/**
 * Initialize pixel on page load
 */
export function initializePixel(platform: PixelPlatform, pixelId: string): void {
    if (typeof window === 'undefined') return;

    switch (platform) {
        case 'meta':
            initializeMetaPixel(pixelId);
            break;
        case 'google':
            initializeGA4(pixelId);
            break;
        case 'tiktok':
            initializeTikTokPixel(pixelId);
            break;
    }
}

function initializeMetaPixel(pixelId: string): void {
    // Meta Pixel initialization script
    const script = `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixelId}');
    fbq('track', 'PageView');
  `;

    executeScript(script);
}

function initializeGA4(measurementId: string): void {
    // Google Analytics 4 initialization
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script1);

    const script = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${measurementId}');
  `;

    executeScript(script);
}

function initializeTikTokPixel(pixelId: string): void {
    const script = `
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${pixelId}');
      ttq.page();
    }(window, document, 'ttq');
  `;

    executeScript(script);
}

function executeScript(code: string): void {
    const script = document.createElement('script');
    script.textContent = code;
    document.head.appendChild(script);
}

/**
 * Track standard events
 */
export interface TrackEventData {
    value?: number;
    currency?: string;
    contentIds?: string[];
    contentType?: string;
    contentName?: string;
    numItems?: number;
}

export function trackEvent(
    platform: PixelPlatform,
    eventName: string,
    data?: TrackEventData
): void {
    if (typeof window === 'undefined') return;

    switch (platform) {
        case 'meta':
            trackMetaEvent(eventName, data);
            break;
        case 'google':
            trackGA4Event(eventName, data);
            break;
        case 'tiktok':
            trackTikTokEvent(eventName, data);
            break;
    }
}

function trackMetaEvent(eventName: string, data?: TrackEventData): void {
    if (typeof (window as any).fbq !== 'function') return;

    const metaEventMap: Record<string, string> = {
        page_view: 'PageView',
        view_content: 'ViewContent',
        add_to_cart: 'AddToCart',
        purchase: 'Purchase',
        lead: 'Lead',
        complete_registration: 'CompleteRegistration',
    };

    const metaEvent = metaEventMap[eventName] || eventName;

    (window as any).fbq('track', metaEvent, {
        value: data?.value,
        currency: data?.currency || 'USD',
        content_ids: data?.contentIds,
        content_type: data?.contentType,
        content_name: data?.contentName,
        num_items: data?.numItems,
    });
}

function trackGA4Event(eventName: string, data?: TrackEventData): void {
    if (typeof (window as any).gtag !== 'function') return;

    const ga4EventMap: Record<string, string> = {
        page_view: 'page_view',
        view_content: 'view_item',
        add_to_cart: 'add_to_cart',
        purchase: 'purchase',
        lead: 'generate_lead',
    };

    const ga4Event = ga4EventMap[eventName] || eventName;

    (window as any).gtag('event', ga4Event, {
        value: data?.value,
        currency: data?.currency || 'USD',
        items: data?.contentIds?.map(id => ({ item_id: id })),
    });
}

function trackTikTokEvent(eventName: string, data?: TrackEventData): void {
    if (typeof (window as any).ttq !== 'object') return;

    const tiktokEventMap: Record<string, string> = {
        page_view: 'ViewContent',
        view_content: 'ViewContent',
        add_to_cart: 'AddToCart',
        purchase: 'CompletePayment',
        lead: 'SubmitForm',
    };

    const tiktokEvent = tiktokEventMap[eventName] || eventName;

    (window as any).ttq.track(tiktokEvent, {
        value: data?.value,
        currency: data?.currency || 'USD',
        contents: data?.contentIds?.map(id => ({ content_id: id })),
        content_type: data?.contentType,
    });
}

/**
 * Track all configured pixels at once
 */
export function trackAllPixels(
    configs: PixelConfig[],
    eventName: string,
    data?: TrackEventData
): void {
    configs
        .filter(config => config.isActive)
        .forEach(config => {
            trackEvent(config.platform, eventName, data);
        });
}

/**
 * Generate server-side event for Conversions API
 */
export async function sendServerEvent(
    platform: PixelPlatform,
    eventName: string,
    data: {
        userEmail?: string;
        userPhone?: string;
        clientIp?: string;
        clientUserAgent?: string;
        eventSourceUrl?: string;
        value?: number;
        currency?: string;
    }
): Promise<{ success: boolean; error?: string }> {
    // TODO: In production, this would:
    // 1. Hash user data (email, phone)
    // 2. Send to Meta Conversions API / GA4 Measurement Protocol
    logger.debug({ platform, eventName, ...data }, 'Sending server event');

    return { success: true };
}

/**
 * Generate embed code for pixel
 */
export function generatePixelEmbed(platform: PixelPlatform, pixelId: string): string {
    switch (platform) {
        case 'meta':
            return `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->`;

        case 'google':
            return `<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${pixelId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${pixelId}');
</script>
<!-- End Google Analytics 4 -->`;

        case 'tiktok':
            return `<!-- TikTok Pixel Code -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
  ttq.load('${pixelId}');
  ttq.page();
}(window, document, 'ttq');
</script>
<!-- End TikTok Pixel Code -->`;

        default:
            return '';
    }
}
