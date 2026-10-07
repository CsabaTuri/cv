import * as rootParams from 'next/root-params';
import {getRequestConfig} from 'next-intl/server';
import {hasLocale} from 'next-intl';
import {routing} from './routing';

export default getRequestConfig(async ({locale}) => {
  // `locale` is not known yet in the i18n routing setup — read it from the
  // `[[...locale]]` route segment via `next/root-params`.
  if (!locale) {
    const paramValue = await rootParams.locale();
    const segments = Array.isArray(paramValue) ? paramValue : [paramValue];
    const [segment] = segments;

    // No segment at all means the unprefixed root: the default locale.
    locale =
      segment && hasLocale(routing.locales, segment)
        ? segment
        : routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
